// Đọc bài nộp (file nén) vào bộ nhớ, chỉ lấy file mã nguồn/văn bản đã lọc theo Tech Profile.
// - .zip: đọc trực tiếp bằng yauzl (không ghi ra đĩa).
// - Định dạng khác (.rar .7z .tar.gz .iso .dmg .arj...): 7-Zip liệt kê → chỉ giải nén file cần chấm ra thư mục tạm
//   → đọc vào bộ nhớ → xoá thư mục tạm.
// - Bỏ qua thư mục bị loại NGAY KHI ĐỌC (node_modules, build...) → nhanh, tránh lỗi đường dẫn dài.
// - Tên file tiếng Việt trong zip: không có cờ UTF-8 → thử UTF-8 → CP1258 → CP437.
// - Chặn zip-slip, zip bomb (giới hạn dung lượng + số file), file nén có mật khẩu, không lấy file thực thi.
// - File nén lồng file nén: giải thêm 1 cấp. Chỉ có 1 thư mục gốc: tự lấy làm gốc project.
// - Assignment báo cáo (profile REPORT_PROFILE): chỉ lấy file Word / Excel / PowerPoint (nộp thẳng hoặc trong file nén),
//   chuyển thành văn bản (office.ts).
import iconv from 'iconv-lite'
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { basename, dirname, join, normalize, resolve, sep } from 'path'
import yauzl from 'yauzl'
import { BLOCKED_EXT, BUILTIN_PROFILES, REPORT_PROFILE_ID } from '@shared/constants'
import { COMPRESS_ONLY_EXTS, REPORT_EXTS, fileExtension, stripExtension } from '@shared/submissionName'
import type { DocStats, TechProfile } from '@shared/types'
import { officeToText, quickCheckOffice } from './office'
import { paths } from '../paths'
import { ArchiveError, extractArchive, findSevenZip, listArchive } from './sevenZip'

export interface Submission {
  files: Map<string, Buffer>
  // assignment báo cáo: bytes gốc của file Word / Excel / PowerPoint (giữ tên file gốc) để xem trước kiểu Office.
  rawDocs: Map<string, Buffer>
  docs: DocStats[] // assignment báo cáo: thống kê từng file Office (files chứa văn bản đã chuyển, giữ tên file gốc)
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
  '.DS_Store', 'Thumbs.db', 'desktop.ini', '._*',
  '*.log', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', '*.lock', '*.lockb',
  ...['readme', 'license', 'licence', 'changelog', 'contributing', 'authors'].flatMap((n) => [n, n + '.*']),
  '.gitignore', '.gitattributes', '.editorconfig', '.npmrc', '.prettierrc*', '.eslintrc*', '.prettierignore', '.eslintignore',
  '*.min.js', '*.min.css', '*.map'
]
const EXTRA_TEXT_NAMES = ['makefile', 'cmakelists.txt', 'dockerfile', 'gradlew', '.env', 'procfile']
const MAX_TEXT_FILE = 512 * 1024
const MAX_NESTED = 200 * 1024 * 1024
const MAX_DOCX = 100 * 1024 * 1024
// Định dạng tài liệu chưa đọc được khi chấm báo cáo → cảnh báo yêu cầu nộp file Office
const UNREADABLE_DOC_EXTS = ['.pdf', '.odt', '.ods', '.odp', '.pages', '.numbers', '.key']
// File nén lồng bên trong bài nộp được giải thêm 1 cấp. Không gồm .iso/.dmg/.pak... (thường là dữ liệu, không phải code).
const NESTED_EXTS = ['.zip', '.rar', '.7z', '.tar', '.tgz', '.tbz', '.tbz2', '.txz']

const ALL_TEXT_EXT = new Set(BUILTIN_PROFILES.flatMap((p) => p.extensions.map((e) => e.toLowerCase())))

export class SubmissionError extends Error {}
// Máy không có 7-Zip → không đọc được định dạng ngoài .zip.
export class NoSevenZipError extends SubmissionError {}

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

function isNestedArchive(name: string): boolean {
  const ext = fileExtension(name)
  return NESTED_EXTS.includes(ext) || (COMPRESS_ONLY_EXTS.includes(ext) && /\.tar\.[^.]+$/i.test(name))
}

function looksBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 4096)
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true
  return false
}

function isUnsafePath(name: string): boolean {
  return /^([a-zA-Z]:|\/)/.test(name) || name.split('/').includes('..')
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
  report: boolean
  docStats: Map<Buffer, Omit<DocStats, 'file'>>
  ignore: string[]
  extraExt: string[]
  limits: ExtractLimits
  totalBytes: number
  totalFiles: number
  out: Map<string, Buffer>
  rawDocs: Map<string, Buffer>
  warnings: string[]
  skippedLarge: number
  skippedBinary: number
}

// Quyết định với 1 file trong bài nộp (dùng chung cho zip và 7-Zip): bỏ qua / đọc làm mã nguồn / giải nén lồng.
// Đếm số file + dung lượng để chặn zip bomb.
function classify(full: string, size: number, ctx: Ctx): 'skip' | 'text' | 'nested' | 'docx' {
  if (matchesIgnore(full, ctx.ignore)) return 'skip'
  const lower = full.toLowerCase()
  if (BLOCKED_EXT.some((e) => lower.endsWith(e))) {
    ctx.warnings.push(`Không giải nén file thực thi: ${full}`)
    return 'skip'
  }
  ctx.totalFiles++
  ctx.totalBytes += size
  if (ctx.totalFiles > ctx.limits.maxFiles) throw new SubmissionError(`Zip có quá nhiều file (> ${ctx.limits.maxFiles})`)
  if (ctx.totalBytes > ctx.limits.maxBytes) {
    throw new SubmissionError(`Dung lượng giải nén vượt giới hạn ${(ctx.limits.maxBytes / 1048576).toFixed(0)} MB (nghi zip bomb)`)
  }
  if (isNestedArchive(lower)) return 'nested'
  if (ctx.report) {
    const ext = fileExtension(full)
    if (REPORT_EXTS.includes(ext)) {
      if (size <= MAX_DOCX) return 'docx'
      ctx.warnings.push(`Bỏ qua file quá lớn (> 100 MB): ${full}`)
    } else if (UNREADABLE_DOC_EXTS.includes(ext)) ctx.warnings.push(`Chưa đọc được file ${ext} — cần nộp file Word / Excel / PowerPoint: ${full}`)
    else ctx.skippedBinary++
    return 'skip'
  }
  if (!isTextFile(full, ctx.extraExt)) {
    ctx.skippedBinary++
    return 'skip'
  }
  if (size > MAX_TEXT_FILE) {
    ctx.skippedLarge++
    ctx.warnings.push(`Bỏ qua file quá lớn (> 512 KB): ${full}`)
    return 'skip'
  }
  return 'text'
}

function addText(full: string, buf: Buffer, ctx: Ctx): void {
  if (looksBinary(buf)) ctx.skippedBinary++
  else ctx.out.set(full, buf)
}

// File Word / Excel / PowerPoint → văn bản (giữ tên file gốc làm "file" để chấm / xem trong Code Review).
async function addDocx(full: string, buf: Buffer, ctx: Ctx, throwOnError = false): Promise<void> {
  try {
    const { text, stats } = await officeToText(buf)
    const out = Buffer.from(text, 'utf8')
    ctx.out.set(full, out)
    ctx.rawDocs.set(full, buf)
    ctx.docStats.set(out, stats)
  } catch (e: any) {
    if (throwOnError) throw new SubmissionError(e?.message ?? 'Không đọc được file')
    ctx.warnings.push(`Không đọc được ${full}: ${e?.message ?? e}`)
  }
}

// File nén lồng bên trong bài nộp: giải thêm 1 cấp, nội dung đặt dưới thư mục cùng tên (bỏ đuôi).
async function walkNested(source: Buffer | string, full: string, depth: number, ctx: Ctx): Promise<void> {
  if (depth >= 1) {
    ctx.warnings.push(`Bỏ qua file nén lồng quá 1 cấp: ${full}`)
    return
  }
  const prefix = full.slice(0, full.length - basename(full).length) + stripExtension(full) + '/'
  if (fileExtension(full) === '.zip') {
    await walkZip(source, prefix, depth + 1, ctx)
    return
  }
  // Định dạng khác: cần 7-Zip; lỗi của file lồng chỉ cảnh báo, không làm hỏng cả bài
  let tmpDir: string | null = null
  try {
    let file = source as string
    if (Buffer.isBuffer(source)) {
      tmpDir = mkdtempSync(join(paths.work, 'n-'))
      file = join(tmpDir, 'nested' + fileExtension(full))
      writeFileSync(file, source)
    }
    await walk7z(file, prefix, depth + 1, ctx)
  } catch (e) {
    if (!(e instanceof ArchiveError) && !(e instanceof NoSevenZipError)) throw e
    ctx.warnings.push(`Không đọc được file nén bên trong: ${full}${e.message ? ` (${e.message})` : ''}`)
  } finally {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
  }
}

async function walkZip(source: string | Buffer, prefix: string, depth: number, ctx: Ctx): Promise<void> {
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
        if (isUnsafePath(name)) {
          ctx.warnings.push(`Bỏ qua đường dẫn không an toàn: ${name}`)
          return next()
        }
        name = name.replace(/^\.\/+/, '')
        const full = prefix + name
        if (matchesIgnore(full, ctx.ignore)) return next()
        if ((entry.generalPurposeBitFlag & 0x1) !== 0) throw new SubmissionError('Zip có mật khẩu — không thể giải nén')
        const kind = classify(full, entry.uncompressedSize, ctx)
        if (kind === 'nested') await walkNested(await readEntry(zip, entry, MAX_NESTED), full, depth, ctx)
        else if (kind === 'text') addText(full, await readEntry(zip, entry, MAX_TEXT_FILE + 1024), ctx)
        else if (kind === 'docx') await addDocx(full, await readEntry(zip, entry, MAX_DOCX + 1024), ctx)
        next()
      } catch (e) {
        zip.close()
        reject(e)
      }
    })
    next()
  })
}

async function requireSevenZip(file: string): Promise<string> {
  const bin = await findSevenZip()
  if (!bin) throw new NoSevenZipError(`Không tìm thấy 7-Zip để đọc file ${fileExtension(file) || 'nén'}`)
  return bin
}

// Đọc file nén bằng 7-Zip. `wrapped`: file đang đọc là lớp .tar bên trong .tar.gz (không tính là lồng).
async function walk7z(file: string, prefix: string, depth: number, ctx: Ctx, wrapped = false): Promise<void> {
  const bin = await requireSevenZip(file)
  const entries = (await listArchive(bin, file)).filter((e) => !e.isDir)
  if (entries.some((e) => e.encrypted)) throw new ArchiveError('File nén có mật khẩu — không thể giải nén', 'password')
  // .tar.gz / .tgz / .gz: lớp nén ngoài chỉ chứa 1 file .tar → bóc thêm lớp, nội dung tính như ở gốc
  const isWrapper = !wrapped && entries.length === 1 && COMPRESS_ONLY_EXTS.concat(['.tgz', '.tbz', '.tbz2', '.txz']).includes(fileExtension(file))
  const wanted: { raw: string; full: string; kind: 'text' | 'nested' | 'inner' | 'docx' }[] = []
  for (const e of entries) {
    const name = e.path.replace(/\\/g, '/').replace(/^\.\/+/, '')
    if (isUnsafePath(name)) {
      ctx.warnings.push(`Bỏ qua đường dẫn không an toàn: ${name}`)
      continue
    }
    const full = prefix + name
    if (isWrapper && fileExtension(name) === '.tar') {
      if (e.size > ctx.limits.maxBytes) {
        throw new SubmissionError(`Dung lượng giải nén vượt giới hạn ${(ctx.limits.maxBytes / 1048576).toFixed(0)} MB (nghi zip bomb)`)
      }
      wanted.push({ raw: e.path, full, kind: 'inner' })
      continue
    }
    const kind = classify(full, e.size, ctx)
    if (kind === 'nested' && e.size > MAX_NESTED) ctx.warnings.push(`Bỏ qua file nén bên trong quá lớn: ${full}`)
    else if (kind !== 'skip') wanted.push({ raw: e.path, full, kind })
  }
  if (!wanted.length) return

  const tmpRoot = mkdtempSync(join(paths.work, 'x-'))
  const dest = join(tmpRoot, 'o')
  try {
    mkdirSync(dest)
    await extractArchive(bin, file, dest, wanted.map((w) => w.raw))
    const root = resolve(dest)
    for (const w of wanted) {
      const p = resolve(root, w.raw)
      let size = -1
      try {
        const st = lstatSync(p)
        if (p.startsWith(root + sep) && st.isFile()) size = st.size // không đi theo symlink
      } catch {
        /* 7-Zip không tạo được file (tên không hợp lệ trên hệ điều hành này...) */
      }
      if (size < 0) {
        ctx.warnings.push(`Không giải nén được: ${w.full}`)
        continue
      }
      if (w.kind === 'inner') await walk7z(p, prefix, depth, ctx, true)
      else if (w.kind === 'nested') await walkNested(p, w.full, depth, ctx)
      else if (w.kind === 'docx') await addDocx(w.full, readFileSync(p), ctx)
      else if (size <= MAX_TEXT_FILE + 1024) addText(w.full, readFileSync(p), ctx)
    }
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true })
  }
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
    report: profile.id === REPORT_PROFILE_ID,
    docStats: new Map(),
    ignore: [...profile.ignore, ...ALWAYS_IGNORE],
    extraExt: profile.extensions.map((e) => e.toLowerCase()),
    limits,
    totalBytes: 0,
    totalFiles: 0,
    out: new Map(),
    rawDocs: new Map(),
    warnings: [],
    skippedLarge: 0,
    skippedBinary: 0
  }
  if (REPORT_EXTS.includes(fileExtension(zipPath))) {
    // Báo cáo nộp thẳng file Word / Excel / PowerPoint (không nén)
    if (!ctx.report) throw new SubmissionError('File Word / Excel / PowerPoint chỉ chấm được ở assignment loại Báo cáo')
    const size = lstatSync(zipPath).size
    if (size > Math.min(MAX_DOCX, limits.maxBytes)) throw new SubmissionError('File vượt giới hạn dung lượng')
    await addDocx(basename(zipPath), readFileSync(zipPath), ctx, true)
  } else if (fileExtension(zipPath) === '.zip') {
    await walkZip(zipPath, '', 0, ctx)
  } else {
    try {
      await walk7z(zipPath, '', 0, ctx)
    } catch (e) {
      if (e instanceof ArchiveError) throw new SubmissionError(archiveErrorText(e))
      throw e
    }
  }
  const files = stripCommonRoot(ctx.out)
  const rawDocs = stripCommonRoot(ctx.rawDocs)
  // Sắp xếp ổn định theo đường dẫn
  const sorted = new Map([...files.entries()].sort((a, b) => a[0].localeCompare(b[0])))
  const docs: DocStats[] = []
  for (const [file, buf] of sorted) {
    const st = ctx.docStats.get(buf)
    if (st) docs.push({ file, ...st })
  }
  return { files: sorted, rawDocs, docs, warnings: ctx.warnings, skippedLarge: ctx.skippedLarge, skippedBinary: ctx.skippedBinary }
}

function archiveErrorText(e: ArchiveError): string {
  if (e.kind === 'password') return 'File nén có mật khẩu'
  if (e.kind === 'unreadable') return 'Không mở được file nén (định dạng không hỗ trợ hoặc file hỏng)'
  return 'File nén hỏng: ' + e.message
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

// Kiểm tra nhanh file nén định dạng khác bằng 7-Zip (chỉ liệt kê, không giải nén).
// Trả về lý do lỗi, null nếu dùng được. Máy không có 7-Zip → ném NoSevenZipError (quét sẽ đánh dấu "không hỗ trợ").
export async function quickCheckArchive(file: string): Promise<string | null> {
  if (REPORT_EXTS.includes(fileExtension(file))) return quickCheckOffice(readFileSync(file))
  if (fileExtension(file) === '.zip') return quickCheckZip(file)
  const bin = await requireSevenZip(file)
  try {
    const entries = (await listArchive(bin, file)).filter((e) => !e.isDir)
    if (!entries.length) return 'File nén rỗng'
    if (entries.some((e) => e.encrypted)) return 'File nén có mật khẩu'
    return null
  } catch (e) {
    if (e instanceof ArchiveError) return archiveErrorText(e)
    throw e
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
