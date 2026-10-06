// Quét folder bài nộp: <TenSV>_<MSSV>.zip — tách theo dấu "_" cuối cùng.
// Chỉ cần có dấu "_" là đủ, không có ràng buộc về định dạng MSSV.
import { existsSync, readdirSync, statSync } from 'fs'
import { basename, extname, join } from 'path'
import { parseSubmissionName } from '@shared/submissionName'
import type { Assignment, ClassListEntry, ScanSummary } from '@shared/types'
import { all, run, transaction } from '../db'
import { quickCheckZip } from './extract'

interface FoundFile {
  path: string
  mtime: number
  kind: 'zip' | 'unsupported'
  parsed: { name: string; mssv: string } | null
  broken: string | null
}

interface ExistingRow {
  id: number
  mssv: string
  name: string
  zip_path: string
  zip_mtime: number
  scan_status: string
  scan_note: string
}

export async function scanFolder(a: Assignment, onProgress?: (done: number, total: number) => void): Promise<ScanSummary> {
  if (!a.submissionsDir || !existsSync(a.submissionsDir)) throw new Error('Folder bài nộp không tồn tại')

  const entries = readdirSync(a.submissionsDir, { withFileTypes: true }).filter((d) => d.isFile())
  const found: FoundFile[] = []
  let i = 0
  for (const d of entries) {
    i++
    onProgress?.(i, entries.length)
    const p = join(a.submissionsDir, d.name)
    const ext = extname(d.name).toLowerCase()
    if (ext !== '.zip' && ext !== '.rar' && ext !== '.7z') continue
    const mtime = Math.floor(statSync(p).mtimeMs)
    if (ext !== '.zip') {
      found.push({ path: p, mtime, kind: 'unsupported', parsed: parseSubmissionName(d.name), broken: null })
      continue
    }
    found.push({ path: p, mtime, kind: 'zip', parsed: parseSubmissionName(d.name), broken: await quickCheckZip(p) })
  }

  const existing = all<ExistingRow>('SELECT id, mssv, name, zip_path, zip_mtime, scan_status, scan_note FROM students WHERE assignment_id = ?', [a.id])
  const byPath = new Map(existing.filter((e) => e.zip_path).map((e) => [e.zip_path, e]))
  const manual = new Map<string, ExistingRow>()
  for (const e of existing) if (e.scan_note.startsWith('Gán tay') && e.zip_path) manual.set(e.zip_path, e)
  const preferred = new Map<string, string>() // mssv → zip đang được chọn làm bài chính
  for (const e of existing) if (e.scan_status === 'valid' && e.mssv && e.zip_path) preferred.set(e.mssv, e.zip_path)

  const classMap = new Map<string, string>(a.classList.map((c: ClassListEntry) => [c.mssv.trim(), c.name.trim()]))

  interface Planned {
    path: string
    mtime: number
    mssv: string
    name: string
    status: string
    note: string
    alt: string[]
  }
  const planned: Planned[] = []
  const groups = new Map<string, FoundFile[]>()

  for (const f of found) {
    const m = manual.get(f.path)
    const parsed = m ? { name: m.name, mssv: m.mssv } : f.parsed
    if (f.kind === 'unsupported') {
      planned.push({
        path: f.path,
        mtime: f.mtime,
        mssv: parsed?.mssv ?? '',
        name: parsed?.name ?? basename(f.path),
        status: 'unsupported',
        note: 'Định dạng .rar/.7z không được hỗ trợ — yêu cầu sinh viên nộp lại .zip',
        alt: []
      })
      continue
    }
    if (f.broken) {
      planned.push({ path: f.path, mtime: f.mtime, mssv: parsed?.mssv ?? '', name: parsed?.name ?? basename(f.path), status: 'broken', note: f.broken, alt: [] })
      continue
    }
    if (!parsed) {
      const stem = basename(f.path, extname(f.path)).normalize('NFC')
      const idx = stem.lastIndexOf('_')
      const note =
        idx > 0 && stem.slice(idx + 1).trim()
          ? `Sai định dạng tên file (cần <HọTên>_<MSSV>.zip, vd HoDienCong_23546.zip) — thiếu họ tên hoặc MSSV bị trống`
          : 'Sai định dạng tên file (cần <HọTên>_<MSSV>.zip) — cần gán MSSV tay'
      planned.push({ path: f.path, mtime: f.mtime, mssv: '', name: basename(f.path), status: 'needs_assign', note, alt: [] })
      continue
    }
    const g = groups.get(parsed.mssv) ?? []
    g.push({ ...f, parsed })
    groups.set(parsed.mssv, g)
  }

  for (const [mssv, files] of groups) {
    files.sort((x, y) => y.mtime - x.mtime)
    const pref = preferred.get(mssv)
    const primary = files.find((f) => f.path === pref) ?? files[0]
    const others = files.filter((f) => f !== primary)
    const officialName = classMap.get(mssv)
    const m = manual.get(primary.path)
    planned.push({
      path: primary.path,
      mtime: primary.mtime,
      mssv,
      name: officialName || primary.parsed!.name,
      status: 'valid',
      note: m ? m.scan_note : others.length ? `Nộp ${files.length} lần — đang dùng ${primary === files[0] ? 'file mới nhất' : 'file đã chọn'}` : '',
      alt: others.map((o) => o.path)
    })
    for (const o of others) {
      planned.push({
        path: o.path,
        mtime: o.mtime,
        mssv,
        name: officialName || o.parsed!.name,
        status: 'duplicate_old',
        note: 'Trùng MSSV (nộp lại) — không dùng',
        alt: []
      })
    }
  }

  // Sinh viên trong danh sách lớp nhưng chưa nộp
  const submitted = new Set(planned.filter((p) => p.status === 'valid').map((p) => p.mssv))
  for (const [mssv, name] of classMap) {
    if (!submitted.has(mssv)) planned.push({ path: '', mtime: 0, mssv, name, status: 'missing', note: 'Chưa nộp bài', alt: [] })
  }

  transaction(() => {
    const keep = new Set<number>()
    let ord = 0
    planned.sort((x, y) => (x.mssv || 'zzz' + x.name).localeCompare(y.mssv || 'zzz' + y.name))
    for (const p of planned) {
      ord++
      const ex = p.path ? byPath.get(p.path) : existing.find((e) => !e.zip_path && e.mssv === p.mssv && e.scan_status === 'missing')
      if (ex) {
        keep.add(ex.id)
        const changed = ex.zip_mtime !== p.mtime || ex.mssv !== p.mssv || (ex.scan_status !== 'valid' && p.status === 'valid')
        run('UPDATE students SET mssv = ?, name = ?, zip_mtime = ?, scan_status = ?, scan_note = ?, alt_files = ?, ord = ? WHERE id = ?', [
          p.mssv,
          p.name,
          p.mtime,
          p.status,
          p.note,
          JSON.stringify(p.alt),
          ord,
          ex.id
        ])
        if (changed && p.status === 'valid') {
          // File bài nộp thay đổi → chấm lại từ đầu
          run('DELETE FROM results WHERE student_id = ?', [ex.id])
        }
      } else {
        const { lastId } = run(
          'INSERT INTO students (assignment_id, mssv, name, zip_path, zip_mtime, scan_status, scan_note, alt_files, ord) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [a.id, p.mssv, p.name, p.path, p.mtime, p.status, p.note, JSON.stringify(p.alt), ord]
        )
        keep.add(lastId)
      }
    }
    for (const e of existing) {
      if (!keep.has(e.id)) {
        run('DELETE FROM results WHERE student_id = ?', [e.id])
        run('DELETE FROM students WHERE id = ?', [e.id])
      }
    }
    // Kết quả chấm của bài không hợp lệ không còn ý nghĩa
    run(
      `DELETE FROM results WHERE student_id IN (SELECT id FROM students WHERE assignment_id = ? AND scan_status != 'valid')`,
      [a.id]
    )
  })

  return summarize(a.id)
}

export function summarize(assignmentId: number): ScanSummary {
  const rows = all<{ scan_status: string; c: number }>(
    'SELECT scan_status, COUNT(*) AS c FROM students WHERE assignment_id = ? GROUP BY scan_status',
    [assignmentId]
  )
  const m = Object.fromEntries(rows.map((r) => [r.scan_status, r.c])) as Record<string, number>
  const total = rows.filter((r) => r.scan_status !== 'missing').reduce((s, r) => s + r.c, 0)
  return {
    total,
    valid: m.valid ?? 0,
    needsAssign: m.needs_assign ?? 0,
    duplicates: m.duplicate_old ?? 0,
    broken: m.broken ?? 0,
    unsupported: m.unsupported ?? 0,
    missing: m.missing ?? 0
  }
}

// Giáo viên gán MSSV tay cho file sai định dạng tên.
export function assignManually(studentId: number, mssv: string, name: string): void {
  mssv = mssv.trim()
  name = name.trim()
  if (!mssv || !name) throw new Error('Cần nhập đủ MSSV và họ tên')
  const row = all<{ assignment_id: number }>('SELECT assignment_id FROM students WHERE id = ?', [studentId])[0]
  if (!row) throw new Error('Không tìm thấy bài nộp')
  const dup = all<{ id: number }>("SELECT id FROM students WHERE assignment_id = ? AND mssv = ? AND scan_status = 'valid' AND id != ?", [
    row.assignment_id,
    mssv,
    studentId
  ])
  if (dup.length) throw new Error('MSSV này đã có bài nộp hợp lệ')
  transaction(() => {
    run("DELETE FROM students WHERE assignment_id = ? AND mssv = ? AND scan_status = 'missing'", [row.assignment_id, mssv])
    run("UPDATE students SET mssv = ?, name = ?, scan_status = 'valid', scan_note = 'Gán tay' WHERE id = ?", [mssv, name, studentId])
    run('DELETE FROM results WHERE student_id = ?', [studentId])
  })
}

// Chọn file khác trong các lần nộp trùng MSSV.
export function chooseAlternateFile(studentId: number, zipPath: string): void {
  const s = all<any>('SELECT * FROM students WHERE id = ?', [studentId])[0]
  if (!s) throw new Error('Không tìm thấy sinh viên')
  const alts: string[] = JSON.parse(s.alt_files || '[]')
  if (!alts.includes(zipPath)) throw new Error('File không nằm trong danh sách nộp lại')
  const other = all<any>('SELECT * FROM students WHERE assignment_id = ? AND zip_path = ?', [s.assignment_id, zipPath])[0]
  const newAlts = [...alts.filter((p) => p !== zipPath), s.zip_path]
  transaction(() => {
    run("UPDATE students SET zip_path = ?, zip_mtime = ?, alt_files = ?, scan_note = 'Nộp nhiều lần — đang dùng file đã chọn' WHERE id = ?", [
      zipPath,
      other?.zip_mtime ?? 0,
      JSON.stringify(newAlts),
      studentId
    ])
    if (other) run('UPDATE students SET zip_path = ?, zip_mtime = ? WHERE id = ?', [s.zip_path, s.zip_mtime, other.id])
    run('DELETE FROM results WHERE student_id = ?', [studentId])
  })
}
