// Gọi 7-Zip (7z.exe trên Windows, 7zz trên macOS) để đọc các định dạng nén ngoài .zip:
// .rar .7z .tar(.gz/.bz2/.xz) .iso .dmg .arj .cab .lzh... (.zip vẫn đọc bằng yauzl trong extract.ts).
// - 7-Zip đóng gói sẵn trong bộ cài (resources/runtime/7zip) — tải bằng `npm run fetch:runtime[:mac]`.
// - Không có bản đóng gói → thử 7-Zip cài trên máy (Program Files / PATH).
import { execFile } from 'child_process'
import { existsSync, rmSync, writeFileSync } from 'fs'
import { app } from 'electron'
import { basename, join } from 'path'
import { bundledRuntimeDir } from '../paths'

export interface ArchiveEntry {
  path: string
  size: number
  isDir: boolean
  encrypted: boolean
}

// Mật khẩu giả: tránh 7-Zip dừng lại hỏi mật khẩu khi gặp file nén có mật khẩu.
const DUMMY_PASSWORD = '-pMasterScoring'

let cached: Promise<string | null> | null = null

function findInPath(cmd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(process.platform === 'win32' ? 'where' : 'which', [cmd], { windowsHide: true }, (err, out) => {
      if (err) return resolve(null)
      const first = out.split(/\r?\n/).find((l) => l.trim())
      resolve(first ? first.trim() : null)
    })
  })
}

async function locate(): Promise<string | null> {
  const isWin = process.platform === 'win32'
  const exe = isWin ? '7z.exe' : '7zz'
  const candidates = [join(bundledRuntimeDir(), '7zip', exe)]
  // Dev trên macOS: runtime tải bằng `npm run fetch:runtime:mac` nằm theo kiến trúc CPU
  if (process.platform === 'darwin' && !app.isPackaged) {
    candidates.push(join(app.getAppPath(), 'resources', 'runtime-mac', process.arch, '7zip', exe))
  }
  if (isWin) {
    for (const pf of [process.env.ProgramW6432, process.env.ProgramFiles, process.env['ProgramFiles(x86)']]) {
      if (pf) candidates.push(join(pf, '7-Zip', '7z.exe'))
    }
  }
  for (const c of candidates) if (existsSync(c)) return c
  // macOS / Linux: 7-Zip cài sẵn (vd. `brew install sevenzip` → 7zz, p7zip → 7z)
  for (const cmd of isWin ? ['7z'] : ['7zz', '7z']) {
    const p = await findInPath(cmd)
    if (p) return p
  }
  return null
}

/** Đường dẫn 7-Zip dùng được, hoặc null nếu máy không có. Kết quả được nhớ trong phiên chạy. */
export function findSevenZip(): Promise<string | null> {
  if (!cached) cached = locate()
  return cached
}

function run(bin: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(bin, args, { windowsHide: true, maxBuffer: 128 * 1024 * 1024, timeout: 10 * 60_000, encoding: 'utf8' }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as any).code === 'number' ? (err as any).code : 2) : 0
      resolve({ code, stdout: stdout ?? '', stderr: stderr || (err && !stdout ? err.message : '') })
    })
  })
}

/** Lý do lỗi ngắn gọn từ stderr của 7-Zip (dòng "ERROR: ..."). */
function errorText(stderr: string): string {
  const line = stderr.split(/\r?\n/).find((l) => /error/i.test(l)) ?? stderr.split(/\r?\n/).find((l) => l.trim()) ?? ''
  return line.replace(/^ERROR:\s*/i, '').trim()
}

export class ArchiveError extends Error {
  constructor(
    message: string,
    readonly kind: 'password' | 'unreadable' | 'failed'
  ) {
    super(message)
  }
}

function classifyError(stderr: string): ArchiveError {
  const text = errorText(stderr)
  if (/encrypted|wrong password/i.test(stderr)) return new ArchiveError(text, 'password')
  if (/can ?not open .*as archive|unsupported/i.test(stderr)) return new ArchiveError(text, 'unreadable')
  return new ArchiveError(text || 'Lỗi không xác định', 'failed')
}

// .xz (và .gz nén với -n) không lưu tên file bên trong: 7-Zip đặt tên theo file nén bỏ đuôi
// (A_1.tar.xz → A_1.tar, A_1.txz → A_1.tar).
function unnamedItem(file: string): string {
  const base = basename(file)
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return base
  return base.slice(0, dot) + (/^\.t(gz|bz2?|xz|zst)$/i.test(base.slice(dot)) ? '.tar' : '')
}

/** Liệt kê nội dung file nén (`7z l -slt`). Lỗi → ArchiveError. */
export async function listArchive(bin: string, file: string): Promise<ArchiveEntry[]> {
  const r = await run(bin, ['l', '-slt', '-ba', '-sccUTF-8', DUMMY_PASSWORD, file])
  if (r.code >= 2) throw classifyError(r.stderr)
  const entries: ArchiveEntry[] = []
  let cur: Record<string, string> = {}
  const flush = (): void => {
    if (Object.keys(cur).length) {
      entries.push({
        path: cur.Path ?? unnamedItem(file),
        size: parseInt(cur.Size, 10) || 0,
        isDir: cur.Folder === '+' || /^D/.test(cur.Attributes ?? ''),
        encrypted: cur.Encrypted === '+'
      })
    }
    cur = {}
  }
  // Mỗi file là 1 khối "Key = Value", các khối cách nhau bằng dòng trống
  for (const line of r.stdout.split(/\r?\n/)) {
    const m = /^([A-Za-z ]+?) = (.*)$/.exec(line)
    if (!m) {
      if (!line.trim()) flush()
      continue
    }
    if (m[1] === 'Path' && cur.Path !== undefined) flush()
    cur[m[1]] = m[2]
  }
  flush()
  return entries
}

/** Giải nén đúng các file trong `names` (đường dẫn như `listArchive` trả về) vào `dest`. */
export async function extractArchive(bin: string, file: string, dest: string, names: string[]): Promise<void> {
  const listFile = dest + '.list.txt'
  writeFileSync(listFile, names.join('\n') + '\n', 'utf8')
  try {
    // -spd: tên file là chuỗi thường, không phải wildcard; -scsUTF-8: bảng mã của list file
    const r = await run(bin, ['x', file, `-o${dest}`, '-y', '-spd', '-scsUTF-8', '-sccUTF-8', '-bso0', '-bsp0', DUMMY_PASSWORD, `@${listFile}`])
    if (r.code >= 2) throw classifyError(r.stderr)
  } finally {
    rmSync(listFile, { force: true })
  }
}
