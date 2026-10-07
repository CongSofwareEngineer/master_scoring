// Đọc file Word mới (.docx, gói zip OOXML) thành văn bản thuần để chấm báo cáo.
// .docx là file zip: lấy word/document.xml (nội dung), word/styles.xml (style nào là heading), docProps/app.xml (số trang).
// Mỗi đoạn văn → 1 dòng: heading → "#"/"##"…, danh sách → "- ", bảng → "| ô | ô |". Số dòng của văn bản này
// là số dòng AI dùng làm dẫn chứng và Code Review hiển thị.
import type { DocStats } from '@shared/types'
import { OfficeError } from './cfb'
import { attr, countWords, readZipParts, unescapeXml, type OfficeText } from './ooxml'

const WANTED = ['word/document.xml', 'word/styles.xml', 'docProps/app.xml']

// Đọc các phần cần thiết của gói .docx + đếm ảnh trong word/media/.
async function readParts(buf: Buffer): Promise<{ parts: Map<string, string>; media: number }> {
  const { parts, names } = await readZipParts(buf, (n) => WANTED.includes(n))
  if (!parts.has('word/document.xml')) throw new OfficeError('File Word không có nội dung (thiếu word/document.xml)')
  return { parts, media: names.filter((n) => /^word\/media\/[^/]+$/i.test(n)).length }
}

// styleId → cấp heading (1..9); "Title" coi là cấp 1. Tên style built-in trong styles.xml luôn là tiếng Anh
// ("heading 1") dù Word bản địa hoá; style tuỳ chỉnh dựa vào outlineLvl.
function headingStyles(stylesXml: string | undefined): Map<string, number> {
  const out = new Map<string, number>()
  if (!stylesXml) return out
  const re = /<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(stylesXml))) {
    const id = attr(m[1], 'w:styleId')
    if (!id) continue
    const name = (m[2].match(/<w:name\b[^>]*w:val="([^"]*)"/)?.[1] ?? '').toLowerCase()
    const outline = m[2].match(/<w:outlineLvl\b[^>]*w:val="(\d+)"/)?.[1]
    const h = name.match(/^heading\s*(\d)$/)
    if (h) out.set(id, Number(h[1]))
    else if (name === 'title') out.set(id, 1)
    else if (outline !== undefined && Number(outline) < 9) out.set(id, Number(outline) + 1)
  }
  return out
}

interface Para {
  text: string
  style: string | null
  outline: number | null
  list: boolean
}

export async function docxToText(buf: Buffer): Promise<OfficeText> {
  const { parts, media } = await readParts(buf)
  const styles = headingStyles(parts.get('word/styles.xml'))
  const xml = parts.get('word/document.xml')!
  const body = xml.slice(Math.max(0, xml.indexOf('<w:body')))

  const lines: string[] = []
  const headings: DocStats['headings'] = []
  let paragraphs = 0
  let tables = 0
  let images = 0
  // Bảng: mỗi cấp bảng có hàng hiện tại / ô hiện tại
  const tableStack: { row: string[]; cell: string[] }[] = []
  // Đoạn văn lồng nhau (text box nằm trong 1 đoạn) → dùng stack
  const paraStack: Para[] = []
  let inText = false
  let skipDepth = 0 // trong w:delText / w:instrText (bản xoá khi theo dõi thay đổi, mã field) → bỏ
  let fallbackDepth = 0 // mc:Fallback lặp lại nội dung của mc:Choice (text box) → bỏ

  const levelOf = (p: Para): number | null => {
    if (p.style && styles.has(p.style)) return styles.get(p.style)!
    if (p.outline !== null && p.outline < 9) return p.outline + 1
    return null
  }
  const endPara = (): void => {
    const p = paraStack.pop()
    if (!p) return
    const text = p.text.trim().replace(/[ \u00a0]+/g, ' ').replace(/\s*\n\s*/g, ' / ')
    if (tableStack.length) {
      if (text) tableStack[tableStack.length - 1].cell.push(text)
      return
    }
    if (!text) return
    paragraphs++
    const level = levelOf(p)
    if (level) {
      lines.push('#'.repeat(Math.min(level, 6)) + ' ' + text)
      headings.push({ level, text, line: lines.length })
    } else lines.push((p.list ? '- ' : '') + text)
  }

  const re = /<(\/?)([\w.-]+:[\w.-]+)((?:\s[^>]*?)?)(\/?)>|([^<]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    const para = paraStack[paraStack.length - 1]
    if (m[5] !== undefined) {
      if (inText && !skipDepth && !fallbackDepth && para) para.text += unescapeXml(m[5])
      continue
    }
    const closing = m[1] === '/'
    const tag = m[2]
    const attrs = m[3] ?? ''
    const selfClose = m[4] === '/'
    if (tag === 'mc:Fallback') {
      if (!selfClose) fallbackDepth += closing ? -1 : 1
      continue
    }
    if (fallbackDepth) continue
    switch (tag) {
      case 'w:p':
        if (closing) endPara()
        else if (!selfClose) paraStack.push({ text: '', style: null, outline: null, list: false })
        break
      case 'w:t':
        inText = !closing && !selfClose
        break
      case 'w:delText':
      case 'w:instrText':
        if (!selfClose) skipDepth = Math.max(0, skipDepth + (closing ? -1 : 1))
        break
      case 'w:pStyle':
        if (para && !closing) para.style = attr(attrs, 'w:val')
        break
      case 'w:outlineLvl':
        if (para && !closing) para.outline = Number(attr(attrs, 'w:val'))
        break
      case 'w:numPr':
        if (para && !closing) para.list = true
        break
      case 'w:tab':
        // w:tab trong w:tabs (định nghĩa tab stop) có thuộc tính w:pos → không phải ký tự tab
        if (para && !closing && !/w:pos=/.test(attrs)) para.text += '\t'
        break
      case 'w:br':
      case 'w:cr':
        if (para && !closing) para.text += '\n'
        break
      case 'w:drawing':
      case 'w:pict':
        if (!closing && !selfClose) images++
        break
      case 'w:tbl':
        if (closing) {
          tableStack.pop()
          if (!tableStack.length) lines.push('')
        } else if (!selfClose) {
          if (!tableStack.length) tables++
          tableStack.push({ row: [], cell: [] })
        }
        break
      case 'w:tc':
        if (closing && tableStack.length) {
          const t = tableStack[tableStack.length - 1]
          t.row.push(t.cell.join(' / ').replace(/\|/g, '/'))
          t.cell = []
        }
        break
      case 'w:tr':
        if (closing && tableStack.length) {
          const t = tableStack[tableStack.length - 1]
          const rowText = '| ' + t.row.join(' | ') + ' |'
          if (t.row.some((c) => c.trim())) {
            if (tableStack.length === 1) lines.push(rowText)
            else tableStack[tableStack.length - 2].cell.push(rowText)
          }
          t.row = []
        }
        break
    }
  }
  while (paraStack.length) endPara()
  while (lines.length && !lines[lines.length - 1]) lines.pop()

  const text = lines.join('\n')
  const words = countWords(text)
  const pagesRaw = parts.get('docProps/app.xml')?.match(/<Pages>(\d+)<\/Pages>/)?.[1]
  return {
    text,
    stats: {
      words,
      paragraphs,
      headings,
      tables,
      images: images || media,
      pages: pagesRaw ? Number(pagesRaw) : null
    }
  }
}
