// Đọc file Office nộp làm báo cáo: Word (.doc .docx), Excel (.xls .xlsx), PowerPoint (.ppt .pptx), RTF.
// Nhận diện theo NỘI DUNG file (không theo đuôi): file ".doc" thực chất là .docx / RTF, ".xls" thực chất là .xlsx…
// vẫn đọc được. Mọi định dạng ra cùng một kiểu văn bản (heading "#", bảng "| ô |") + thống kê DocStats.
import { isCfb, OfficeError, readCfb } from './cfb'
import { docxToText } from './docx'
import { docToText, pptToText, rtfToText, xlsToText } from './legacyOffice'
import { pptxToText, readZipParts, xlsxToText, type OfficeText } from './ooxml'

export { OfficeError } from './cfb'
export type { OfficeText } from './ooxml'

const isZip = (b: Buffer): boolean => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5 || b[2] === 7)
const isRtf = (b: Buffer): boolean => b.subarray(0, 5).toString('latin1') === '{\\rtf'

export async function officeToText(buf: Buffer): Promise<OfficeText> {
  if (isZip(buf)) {
    const { names } = await readZipParts(buf, () => false)
    if (names.includes('word/document.xml')) return docxToText(buf)
    if (names.includes('xl/workbook.xml')) return xlsxToText(buf)
    if (names.includes('ppt/presentation.xml')) return pptxToText(buf)
    throw new OfficeError('Không phải file Word / Excel / PowerPoint')
  }
  if (isCfb(buf)) {
    const cfb = readCfb(buf)
    // File Office mới (.docx/.xlsx/.pptx) đặt mật khẩu được bọc trong CFB
    if (cfb.streams.has('EncryptedPackage')) throw new OfficeError('File Office có mật khẩu')
    if (cfb.streams.has('WordDocument')) return docToText(cfb)
    if (cfb.streams.has('Workbook') || cfb.streams.has('WORKBOOK') || cfb.streams.has('Book')) return xlsToText(cfb)
    if (cfb.streams.has('PowerPoint Document')) return pptToText(cfb)
    throw new OfficeError('Không phải file Word / Excel / PowerPoint')
  }
  if (isRtf(buf)) return rtfToText(buf)
  throw new OfficeError('Không phải file Word / Excel / PowerPoint (hoặc file hỏng)')
}

// Kiểm tra nhanh khi quét folder: đọc được, có chữ. Trả về lý do lỗi, null nếu dùng được.
export async function quickCheckOffice(buf: Buffer): Promise<string | null> {
  try {
    const { text } = await officeToText(buf)
    return text.trim() ? null : 'File không có chữ nào'
  } catch (e: any) {
    return e instanceof OfficeError ? e.message : 'File hỏng: ' + (e?.message ?? e)
  }
}
