// Quy ước đặt tên file bài nộp: <Họ tên>_<MSSV>.zip (vd HoDienCong_23546.zip).
// Dùng chung cho quét folder (main) và trang Hướng dẫn (renderer) để mô tả luôn khớp hành vi thật.

export interface ParsedSubmissionName {
  name: string
  mssv: string
}

export const SUPPORTED_EXTS = ['.zip']
export const UNSUPPORTED_EXTS = ['.rar', '.7z']

function baseName(fileName: string): string {
  return fileName.replace(/\\/g, '/').split('/').pop() ?? fileName
}

/** Đuôi file viết thường, kèm dấu chấm. Không có dấu chấm → chuỗi rỗng. */
export function fileExtension(fileName: string): string {
  const base = baseName(fileName)
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot).toLowerCase() : ''
}

/** Bỏ đường dẫn và đuôi file → phần "stem". */
export function stripExtension(fileName: string): string {
  const base = baseName(fileName)
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(0, dot) : base
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

export function parseSubmissionName(fileName: string, pattern: RegExp): ParsedSubmissionName | null {
  const stem = stripExtension(fileName).normalize('NFC')
  const parts = splitAtLastUnderscore(stem)
  if (!parts) return null
  const name = prettifyStudentName(parts.left)
  const mssv = parts.right.trim()
  if (!name || !pattern.test(mssv)) return null
  return { name, mssv }
}

export type NameVerdict = 'valid' | 'unsupported_ext' | 'ignored_ext' | 'no_separator' | 'empty_name' | 'bad_mssv'

export interface NameCheckResult {
  verdict: NameVerdict
  /** Họ tên sẽ hiển thị (null nếu không tách được). */
  name: string | null
  /** MSSV sẽ hiển thị (null nếu không hợp lệ). */
  mssv: string | null
  /** MSSV thô lấy từ sau dấu "_" cuối cùng (để hiển thị lý do bị từ chối). */
  rawMssv: string | null
}

/**
 * Mô phỏng đúng quyết định của scan.ts cho một tên file, dùng để kiểm tra trong trang Hướng dẫn.
 * Không mở file zip — chỉ xét tên file.
 */
export function checkSubmissionName(fileName: string, pattern: RegExp): NameCheckResult {
  const ext = fileExtension(fileName)
  if (UNSUPPORTED_EXTS.includes(ext)) return { verdict: 'unsupported_ext', name: null, mssv: null, rawMssv: null }
  if (!SUPPORTED_EXTS.includes(ext)) return { verdict: 'ignored_ext', name: null, mssv: null, rawMssv: null }
  const stem = stripExtension(fileName).normalize('NFC')
  const idx = stem.lastIndexOf('_')
  if (idx < 0) return { verdict: 'no_separator', name: null, mssv: null, rawMssv: null }
  const rawMssv = stem.slice(idx + 1).trim()
  const name = prettifyStudentName(stem.slice(0, idx))
  if (idx === 0 || !name) return { verdict: 'empty_name', name: null, mssv: null, rawMssv }
  if (!pattern.test(rawMssv)) return { verdict: 'bad_mssv', name, mssv: null, rawMssv }
  return { verdict: 'valid', name, mssv: rawMssv, rawMssv }
}