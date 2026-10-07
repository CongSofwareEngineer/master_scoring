// Quy ước đặt tên file bài nộp: <Họ tên>_<MSSV>.<đuôi nén> (vd HoDienCong_23546.zip, HoDienCong_23546.rar).
// Chỉ cần có dấu "_" để tách họ tên và MSSV, không có ràng buộc về định dạng MSSV.

export interface ParsedSubmissionName {
  name: string
  mssv: string
}

// .zip đọc bằng yauzl; các đuôi còn lại đọc bằng 7-Zip (src/main/importer/sevenZip.ts).
// .arc / .pak: 7-Zip không có bộ đọc riêng — chỉ mở được khi bên trong thực chất là zip/7z/rar...
export const SUPPORTED_EXTS = [
  '.zip', '.rar', '.7z', '.tar', '.tgz', '.tbz', '.tbz2', '.txz', '.gz', '.bz2', '.xz', '.zst',
  '.iso', '.dmg', '.arj', '.cab', '.lzh', '.lha', '.arc', '.pak'
]
export const UNSUPPORTED_EXTS: string[] = []
// Đuôi chỉ nén 1 file (thường là .tar bên trong) — "A_1.tar.gz" có stem "A_1".
export const COMPRESS_ONLY_EXTS = ['.gz', '.bz2', '.xz', '.zst']

function baseName(fileName: string): string {
  return fileName.replace(/\\/g, '/').split('/').pop() ?? fileName
}

/** Đuôi file viết thường, kèm dấu chấm. Không có dấu chấm → chuỗi rỗng. */
export function fileExtension(fileName: string): string {
  const base = baseName(fileName)
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot).toLowerCase() : ''
}

/** Bỏ đường dẫn và đuôi file → phần "stem". Đuôi kép .tar.gz / .tar.bz2 / .tar.xz / .tar.zst bỏ cả 2. */
export function stripExtension(fileName: string): string {
  const base = baseName(fileName)
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return base
  const stem = base.slice(0, dot)
  if (COMPRESS_ONLY_EXTS.includes(base.slice(dot).toLowerCase()) && /.\.tar$/i.test(stem)) return stem.slice(0, -4)
  return stem
}

/** Tên file có phải file nén đọc được không (theo đuôi). */
export function isArchiveName(fileName: string): boolean {
  return SUPPORTED_EXTS.includes(fileExtension(fileName))
}

// Assignment loại "báo cáo": nhận thêm file Office nộp thẳng (<HọTên>_<MSSV>.docx / .doc / .xlsx / .pptx…), không cần nén.
// .doc và .docx (tương tự .xls/.xlsx, .ppt/.pptx) đều đọc được — nhận diện theo nội dung file (src/main/importer/office.ts).
export const REPORT_EXTS = ['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.rtf']

/** File ở folder bài nộp có được quét không: file nén, hoặc file Office với assignment báo cáo. */
export function isSubmissionFile(fileName: string, kind: 'code' | 'report' = 'code'): boolean {
  if (baseName(fileName).startsWith('~$')) return false // file khoá tạm của Word / Excel / PowerPoint
  return isArchiveName(fileName) || (kind === 'report' && REPORT_EXTS.includes(fileExtension(fileName)))
}

/** Tách theo dấu "_" CUỐI CÙNG. Trả về null nếu không có dấu "_" hoặc "_" đứng đầu. */
export function splitAtLastUnderscore(stem: string): { left: string; right: string } | null {
  const idx = stem.lastIndexOf('_')
  if (idx <= 0) return null
  return { left: stem.slice(0, idx), right: stem.slice(idx + 1) }
}

/** HoDienCong → Ho Dien Cong · Nguyễn_Văn_A → Nguyễn Văn A */
export function prettifyStudentName(raw: string): string {
  return raw
    .replace(/_/g, ' ')
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseSubmissionName(fileName: string): ParsedSubmissionName | null {
  const stem = stripExtension(fileName).normalize('NFC')
  const parts = splitAtLastUnderscore(stem)
  if (!parts) return null
  const name = prettifyStudentName(parts.left)
  const mssv = parts.right.trim()
  if (!name || !mssv) return null
  return { name, mssv }
}

export type NameVerdict = 'valid' | 'unsupported_ext' | 'ignored_ext' | 'no_separator' | 'empty_name'
export interface NameCheckResult {
  verdict: NameVerdict
  name: string | null
  mssv: string | null
  rawMssv: string | null
}

/**
 * Mô phỏng đúng quyết định của scan.ts cho một tên file, dùng để kiểm tra trong trang Hướng dẫn.
 * Không mở file zip — chỉ xét tên file.
 */
export function checkSubmissionName(fileName: string): NameCheckResult {
  const ext = fileExtension(fileName)
  if (UNSUPPORTED_EXTS.includes(ext)) return { verdict: 'unsupported_ext', name: null, mssv: null, rawMssv: null }
  if (!SUPPORTED_EXTS.includes(ext) && !REPORT_EXTS.includes(ext)) return { verdict: 'ignored_ext', name: null, mssv: null, rawMssv: null }
  const stem = stripExtension(fileName).normalize('NFC')
  const idx = stem.lastIndexOf('_')
  if (idx < 0) return { verdict: 'no_separator', name: null, mssv: null, rawMssv: null }
  const rawMssv = stem.slice(idx + 1).trim()
  const name = prettifyStudentName(stem.slice(0, idx))
  if (idx === 0 || !name || !rawMssv) return { verdict: 'empty_name', name: null, mssv: null, rawMssv }
  return { verdict: 'valid', name, mssv: rawMssv, rawMssv }
}
