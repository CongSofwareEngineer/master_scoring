// Import danh sách lớp (Excel/CSV) để đối chiếu MSSV → tên chuẩn và phát hiện sinh viên chưa nộp.
import ExcelJS from 'exceljs'
import { readFileSync } from 'fs'
import { extname } from 'path'
import type { ClassListEntry } from '@shared/types'
import { decodeText } from './extract'

function parseCsvLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') q = false
      else cur += ch
    } else if (ch === '"') q = true
    else if (ch === sep) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function fromRows(rows: string[][]): ClassListEntry[] {
  const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
  let mssvCol = -1
  let nameCol = -1
  let lastCol = -1
  let firstCol = -1
  let start = 0
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r].map(norm)
    const mi = row.findIndex((c) => /mssv|ma ?sv|ma sinh vien|student ?id|^id$/.test(c))
    if (mi >= 0) {
      mssvCol = mi
      nameCol = row.findIndex((c) => /ho (va )?ten|^ten sinh vien|full ?name|^name$|ho ten/.test(c))
      lastCol = row.findIndex((c) => /^ho( dem)?$|ho lot|last ?name/.test(c))
      firstCol = row.findIndex((c) => /^ten$|first ?name/.test(c))
      start = r + 1
      break
    }
  }
  if (mssvCol < 0) {
    // Không có tiêu đề: tìm cột có giá trị không trống ở đa số các hàng (giả định là MSSV)
    const sample = rows.slice(0, 20)
    const width = Math.max(...sample.map((r) => r.length))
    for (let c = 0; c < width; c++) {
      const nonEmptyCount = sample.filter((r) => (r[c] ?? '').trim().length > 0).length
      if (nonEmptyCount >= Math.max(1, sample.length / 2)) {
        mssvCol = c
        break
      }
    }
    if (mssvCol < 0) throw new Error('Không tìm thấy cột MSSV trong file danh sách lớp')
    nameCol = mssvCol + 1 < width ? mssvCol + 1 : mssvCol - 1
  }
  const out: ClassListEntry[] = []
  const seen = new Set<string>()
  for (const r of rows.slice(start)) {
    const mssv = (r[mssvCol] ?? '').trim()
    if (!mssv || seen.has(mssv)) continue
    let name = nameCol >= 0 ? (r[nameCol] ?? '').trim() : ''
    if (!name && lastCol >= 0 && firstCol >= 0) name = `${r[lastCol] ?? ''} ${r[firstCol] ?? ''}`.trim()
    seen.add(mssv)
    out.push({ mssv, name: name.normalize('NFC') })
  }
  if (!out.length) throw new Error('File danh sách lớp không có dữ liệu')
  return out
}

export async function parseClassList(file: string): Promise<ClassListEntry[]> {
  const ext = extname(file).toLowerCase()
  if (ext === '.csv' || ext === '.txt') {
    const text = decodeText(readFileSync(file))
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : lines[0].includes('\t') ? '\t' : ','
    return fromRows(lines.map((l) => parseCsvLine(l, sep)))
  }
  if (ext === '.xlsx') {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(file)
    const ws = wb.worksheets[0]
    if (!ws) throw new Error('File Excel không có sheet nào')
    const rows: string[][] = []
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = (row.values as any[]).slice(1).map((v) => {
        if (v == null) return ''
        if (typeof v === 'object') return String(v.text ?? v.result ?? v.richText?.map((t: any) => t.text).join('') ?? '')
        return String(v)
      })
      rows.push(vals)
    })
    return fromRows(rows)
  }
  throw new Error('Chỉ hỗ trợ file .xlsx, .csv')
}
