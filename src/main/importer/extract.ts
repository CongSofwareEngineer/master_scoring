// Đọc bài nộp (.zip) vào bộ nhớ, chỉ lấy file mã nguồn/văn bản đã lọc theo Tech Profile.
// - Bỏ qua thư mục bị loại NGAY KHI ĐỌC ZIP (node_modules, build...) → nhanh, tránh lỗi đường dẫn dài.
// - Tên file tiếng Việt: không có cờ UTF-8 → thử UTF-8 → CP1258 → CP437.
// - Chặn zip-slip, zip bomb (giới hạn dung lượng + số file), zip có mật khẩu, không lấy file thực thi.
// - Zip lồng zip: giải nén thêm 1 cấp. Zip chỉ có 1 thư mục gốc: tự lấy làm gốc project.
import iconv from 'iconv-lite'
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, join, normalize, sep } from 'path'
import yauzl from 'yauzl'
import { BLOCKED_EXT, BUILTIN_PROFILES } from '@shared/constants'
import type { TechProfile } from '@shared/types'

export interface Submission {
  files: Map<string, Buffer>
  warnings: string[]
  skippedLarge: number
  skippedBinary: number
}

export interface ExtractLimits {
  maxBytes: number
  maxFiles: number
}

// Không đọc với mọi profile: thư viện/thư mục sinh tự động, log, lock file, tài liệu, file cấu hình công cụ, code đã minify.
// Chỉ chấm code sinh viên tự viết.
export const ALWAYS_IGNORE = [
  'node_modules/', 'bower_components/', 'vendor/', '.venv/', 'venv/', '__pycache__/',
  '.git/', '.svn/', '__MACOSX/', '.next/', '.nuxt/', '.gradle/', '.idea/', '.vs/', '.vscode/', 'dist/', 'coverage/', 'logs/',
  '.DS_Store', 'Thumbs.db', 'desktop.ini',
  '*.log', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', '*.lock', '*.lockb',
  ...['readme', 'license', 'licence', 'changelog', 'contributing', 'authors'].flatMap((n) => [n, n + '.*']),
  '.gitignore', '.gitattributes', '.editorconfig', '.npmrc', '.prettierrc*', '.eslintrc*', '.prettierignore', '.eslintignore',
  '*.min.js', '*.min.css', '*.map'
]
const EXTRA_TEXT_NAMES = ['makefile', 'cmakelists.txt', 'dockerfile', 'gradlew', '.env', 'procfile']
const MAX_TEXT_FILE = 512 * 1024
const MAX_NESTED_ZIP = 200 * 1024 * 1024

const ALL_TEXT_EXT = new Set(BUILTIN_PROFILES.flatMap((p) => p.extensions.map((e) => e.toLowerCase())))

export class SubmissionError extends Error {}

function decodeName(raw: Buffer | string, utf8Flag: boolean): string {
  if (typeof raw === 'string') return raw
  if (utf8Flag) return raw.toString('utf8')
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(raw)
  } catch {
    /* không phải UTF-8 */
  }
  const cp1258 = iconv.decode(raw, 'cp1258')
  if (!cp1258.includes('�')) return cp1258
  return iconv.decode(raw, 'cp437')
}

export function matchesIgnore(path: string, patterns: string[]): boolean {
  const lower = path.toLowerCase()
  const segs = lower.split('/')
  const base = segs[segs.length - 1]
  for (const raw of patterns) {
    const p = raw.trim().toLowerCase()
    if (!p) continue
    if (p.endsWith('/')) {
      const dir = p.slice(0, -1)
      if (dir.includes('/')) {
        if (lower.startsWith(dir + '/') || lower.includes('/' + dir + '/')) return true
      } else if (segs.slice(0, -1).includes(dir)) return true
    } else if (p.startsWith('*.')) {
      if (base.endsWith(p.slice(1))) return true
    } else if (p.includes('*')) {
      const re = new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')
      if (re.test(base)) return true
    } else if (base === p || lower === p) return true
  }
  return false
}

function isTextFile(path: string, extraExt: string[]): boolean {
  const base = path.split('/').pop()!.toLowerCase()
  const dot = base.lastIndexOf('.')
  const ext = dot >= 0 ? base.slice(dot) : ''
  if (ALL_TEXT_EXT.has(ext) || extraExt.includes(ext)) return true
  if (base.startsWith('.env')) return true
  return EXTRA_TEXT_NAMES.some((n) => base === n || base.startsWith(n + '.'))
}

function looksBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 4096)
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true
  return false
}

function openZip(source: string | Buffer): Promise<yauzl.ZipFile> {
  const opts = { lazyEntries: true, decodeStrings: false, validateEntrySizes: true, autoClose: true } as yauzl.Options
  return new Promise((resolve, reject) => {
    const cb = (err: Error | null, zip?: yauzl.ZipFile): void => {
      if (err || !zip) reject(new SubmissionError('Zip hỏng hoặc không đọc được: ' + (err?.message ?? '')))
      else resolve(zip)
    }
    if (typeof source === 'string') yauzl.open(source, opts, cb)
    else yauzl.fromBuffer(source, opts, cb)
  })
}

function readEntry(zip: yauzl.ZipFile, entry: yauzl.Entry, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, rs) => {
      if (err || !rs) return reject(err)
      const chunks: Buffer[] = []
      let size = 0
      rs.on('data', (c: Buffer) => {
        size += c.length
        if (size > limit) {
          rs.destroy()
          reject(new SubmissionError('File trong zip vượt giới hạn dung lượng'))
          return
        }
        chunks.push(c)
      })
      rs.on('end', () => resolve(Buffer.concat(chunks)))
      rs.on('error', reject)
    })
  })
}

interface Ctx {
  ignore: string[]
  extraExt: string[]
  limits: ExtractLimits
  totalBytes: number
  totalFiles: number
  out: Map<string, Buffer>
  warnings: string[]
  skippedLarge: number
  skippedBinary: number
}

async function walk(source: string | Buffer, prefix: string, depth: number, ctx: Ctx): Promise<void> {
  const zip = await openZip(source)
  await new Promise<void>((resolve, reject) => {
    const next = (): void => zip.readEntry()
    zip.on('error', (e) => reject(new SubmissionError('Zip hỏng: ' + e.message)))
    zip.on('end', () => resolve())
    zip.on('entry', async (entry: yauzl.Entry) => {
      try {
        const utf8 = (entry.generalPurposeBitFlag & 0x800) !== 0
        let name = decodeName(entry.fileName as unknown as Buffer, utf8).replace(/\\/g, '/')
        if (name.endsWith('/')) return next()
        // zip-slip: đường dẫn tuyệt đối hoặc chứa ".."
        if (/^([a-zA-Z]:|\/)/.test(name) || name.split('/').includes('..')) {
          ctx.warnings.push(`Bỏ qua đường dẫn không an toàn: ${name}`)
          return next()
        }
        name = name.replace(/^\.\/+/, '')
        const full = prefix + name
        if (matchesIgnore(full, ctx.ignore)) return next()
        const lower = name.toLowerCase()
        if (BLOCKED_EXT.some((e) => lower.endsWith(e))) {
          ctx.warnings.push(`Không giải nén file thực thi: ${full}`)
          return next()
        }
        if ((entry.generalPurposeBitFlag & 0x1) !== 0) throw new SubmissionError('Zip có mật khẩu — không thể giải nén')
        ctx.totalFiles++
        ctx.totalBytes += entry.uncompressedSize
        if (ctx.totalFiles > ctx.limits.maxFiles) throw new SubmissionError(`Zip có quá nhiều file (> ${ctx.limits.maxFiles})`)
        if (ctx.totalBytes > ctx.limits.maxBytes) {
          throw new SubmissionError(`Dung lượng giải nén vượt giới hạn ${(ctx.limits.maxBytes / 1048576).toFixed(0)} MB (nghi zip bomb)`)
        }
        if (lower.endsWith('.zip')) {
          if (depth >= 1) {
            ctx.warnings.push(`Bỏ qua zip lồng quá 1 cấp: ${full}`)
            return next()
          }
          const buf = await readEntry(zip, entry, MAX_NESTED_ZIP)
          await walk(buf, full.replace(/\.zip$/i, '') + '/', depth + 1, ctx)
          return next()
        }
        if (lower.endsWith('.rar') || lower.endsWith('.7z')) {
          ctx.warnings.push(`File nén .rar/.7z bên trong không được hỗ trợ: ${full}`)
          return next()
        }
        if (!isTextFile(full, ctx.extraExt)) {
          ctx.skippedBinary++
          return next()
        }
        if (entry.uncompressedSize > MAX_TEXT_FILE) {
          ctx.skippedLarge++
          ctx.warnings.push(`Bỏ qua file quá lớn (> 512 KB): ${full}`)
          return next()
        }
        const buf = await readEntry(zip, entry, MAX_TEXT_FILE + 1024)
        if (looksBinary(buf)) {
          ctx.skippedBinary++
          return next()
        }
        ctx.out.set(full, buf)
        next()
      } catch (e) {
        zip.close()
        reject(e)
      }
    })
    next()
  })
}

function stripCommonRoot(files: Map<string, Buffer>): Map<string, Buffer> {
  let current = files
  for (let i = 0; i < 3; i++) {
    const keys = [...current.keys()]
    if (!keys.length) return current
    const first = keys[0].split('/')[0]
    if (!keys.every((k) => k.includes('/') && k.split('/')[0] === first)) return current
    const next = new Map<string, Buffer>()
    for (const [k, v] of current) next.set(k.slice(first.length + 1), v)
    current = next
  }
  return current
}

export async function loadSubmission(zipPath: string, profile: TechProfile, limits: ExtractLimits): Promise<Submission> {
  const ctx: Ctx = {
    ignore: [...profile.ignore, ...ALWAYS_IGNORE],
    extraExt: profile.extensions.map((e) => e.toLowerCase()),
    limits,
    totalBytes: 0,
    totalFiles: 0,
    out: new Map(),
    warnings: [],
    skippedLarge: 0,
    skippedBinary: 0
  }
  await walk(zipPath, '', 0, ctx)
  const files = stripCommonRoot(ctx.out)
  // Sắp xếp ổn định theo đường dẫn
  const sorted = new Map([...files.entries()].sort((a, b) => a[0].localeCompare(b[0])))
  return { files: sorted, warnings: ctx.warnings, skippedLarge: ctx.skippedLarge, skippedBinary: ctx.skippedBinary }
}

// Kiểm tra nhanh zip khi quét folder: đọc được central directory, không có mật khẩu.
export async function quickCheckZip(zipPath: string): Promise<string | null> {
  try {
    const zip = await openZip(zipPath)
    return await new Promise<string | null>((resolve) => {
      let count = 0
      let encrypted = false
      zip.on('entry', (e: yauzl.Entry) => {
        count++
        if ((e.generalPurposeBitFlag & 0x1) !== 0) encrypted = true
        if (encrypted) {
          zip.close()
          resolve('Zip có mật khẩu')
          return
        }
        zip.readEntry()
      })
      zip.on('end', () => resolve(count === 0 ? 'Zip rỗng' : null))
      zip.on('error', (e) => resolve('Zip hỏng: ' + e.message))
      zip.readEntry()
    })
  } catch (e: any) {
    return e?.message ?? 'Zip hỏng'
  }
}

export function writeFilesTo(dir: string, files: Map<string, Buffer>): void {
  const root = normalize(dir)
  for (const [rel, buf] of files) {
    const out = normalize(join(root, rel))
    if (!out.startsWith(root + sep)) continue
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, buf)
  }
}

export function decodeText(buf: Buffer): string {
  // BOM UTF-16
  if (buf[0] === 0xff && buf[1] === 0xfe) return iconv.decode(buf, 'utf16le')
  if (buf[0] === 0xfe && buf[1] === 0xff) return iconv.decode(buf, 'utf16be')
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '')
  } catch {
    return iconv.decode(buf, 'cp1258')
  }
}
