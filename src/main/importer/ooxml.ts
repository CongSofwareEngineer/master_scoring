// Đọc file Office mới (gói zip OOXML): Excel .xlsx và PowerPoint .pptx → văn bản thuần để chấm báo cáo.
// (.docx đọc trong docx.ts.) Định dạng văn bản đầu ra giống .docx: heading → "#", bảng / hàng Excel → "| ô | ô |".
import yauzl from 'yauzl'
import type { DocStats } from '@shared/types'
import { OfficeError } from './cfb'

const MAX_XML = 40 * 1024 * 1024
const MAX_ROWS = 3000 // mỗi sheet Excel: quá số hàng này thì cắt (bảng dữ liệu lớn không cần gửi hết cho AI)

/** Đếm số từ của văn bản đã chuyển (bỏ ký hiệu heading / bảng). */
export function countWords(text: string): number {
  return (text.replace(/^#+ /gm, '').match(/[\p{L}\p{N}][\p{L}\p{N}'’\-.]*/gu) ?? []).length
}

export interface OfficeText {
  text: string
  stats: Omit<DocStats, 'file'>
}

export interface ZipParts {
  parts: Map<string, string>
  names: string[] // mọi entry trong gói (đếm ảnh trong thư mục media/)
}

export function zipLabel(kind: 'word' | 'excel' | 'powerpoint'): string {
  return kind === 'word' ? 'Word' : kind === 'excel' ? 'Excel' : 'PowerPoint'
}

// Đọc các phần XML cần thiết của gói OOXML vào RAM.
export async function readZipParts(buf: Buffer, want: (name: string) => boolean): Promise<ZipParts> {
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.fromBuffer(buf, { lazyEntries: true, validateEntrySizes: true, autoClose: true }, (err, z) => {
      if (err || !z) reject(new OfficeError('File Office hỏng hoặc có mật khẩu'))
      else resolve(z)
    })
  })
  const parts = new Map<string, string>()
  const names: string[] = []
  await new Promise<void>((resolve, reject) => {
    zip.on('error', (e) => reject(new OfficeError('File Office hỏng: ' + e.message)))
    zip.on('end', () => resolve())
    zip.on('entry', (entry: yauzl.Entry) => {
      const name = entry.fileName.replace(/\\/g, '/')
      names.push(name)
      if ((entry.generalPurposeBitFlag & 0x1) !== 0) {
        zip.close()
        return reject(new OfficeError('File Office có mật khẩu'))
      }
      if (!want(name)) return zip.readEntry()
      if (entry.uncompressedSize > MAX_XML) {
        zip.close()
        return reject(new OfficeError('File Office quá lớn'))
      }
      zip.openReadStream(entry, (err, rs) => {
        if (err || !rs) {
          zip.close()
          return reject(new OfficeError('File Office hỏng: ' + (err?.message ?? '')))
        }
        const chunks: Buffer[] = []
        rs.on('data', (c: Buffer) => chunks.push(c))
        rs.on('end', () => {
          parts.set(name, Buffer.concat(chunks).toString('utf8'))
          zip.readEntry()
        })
        rs.on('error', (e) => reject(new OfficeError('File Office hỏng: ' + e.message)))
      })
    })
    zip.readEntry()
  })
  return { parts, names }
}

export function unescapeXml(s: string): string {
  return s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e: string) => {
    const k = e.toLowerCase()
    if (k === 'lt') return '<'
    if (k === 'gt') return '>'
    if (k === 'amp') return '&'
    if (k === 'quot') return '"'
    if (k === 'apos') return "'"
    const code = k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10)
    return Number.isFinite(code) ? String.fromCodePoint(code) : m
  })
}

export function attr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))
  return m ? m[1] : null
}

// Nối mọi <x:t>…</x:t> trong đoạn XML (bỏ phần phiên âm <rPh> của Excel).
function joinText(xml: string, tag: string): string {
  let out = ''
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, 'g')
  for (const m of xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(re)) out += unescapeXml(m[1])
  return out
}

// Đường dẫn trong gói: target của quan hệ tính từ thư mục của part nguồn.
function resolvePart(fromDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const segs = fromDir.split('/').filter(Boolean)
  for (const s of target.split('/')) {
    if (s === '..') segs.pop()
    else if (s !== '.') segs.push(s)
  }
  return segs.join('/')
}

function readRels(xml: string | undefined, fromDir: string): Map<string, { target: string; type: string }> {
  const out = new Map<string, { target: string; type: string }>()
  if (!xml) return out
  for (const m of xml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = attr(m[1], 'Id')
    const target = attr(m[1], 'Target')
    if (id && target && attr(m[1], 'TargetMode') !== 'External') out.set(id, { target: resolvePart(fromDir, unescapeXml(target)), type: attr(m[1], 'Type') ?? '' })
  }
  return out
}

const cellText = (s: string): string => s.replace(/\s*\n\s*/g, ' / ').replace(/\|/g, '/').replace(/[ \t\u00a0]+/g, ' ').trim()

/** Hàng bảng → "| a | b |" (bỏ ô trống ở cuối); hàng rỗng → null. */
export function tableRow(cells: string[]): string | null {
  const c = cells.map(cellText)
  while (c.length && !c[c.length - 1]) c.pop()
  return c.length ? '| ' + c.join(' | ') + ' |' : null
}

// Số Excel → chuỗi gọn (bỏ sai số dấu phẩy động).
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return ''
  return Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(12)))
}

/** Gom các sheet (tên + hàng) thành văn bản: "# Sheet: <tên>" rồi từng hàng dạng bảng. */
export function sheetsToText(sheets: { name: string; rows: string[][] }[], images: number): OfficeText {
  const lines: string[] = []
  const headings: DocStats['headings'] = []
  let paragraphs = 0
  let tables = 0
  for (const sh of sheets) {
    const rows = sh.rows.map(tableRow).filter((r): r is string => r !== null)
    if (!rows.length) continue
    if (lines.length) lines.push('')
    lines.push('# Sheet: ' + sh.name)
    headings.push({ level: 1, text: 'Sheet: ' + sh.name, line: lines.length })
    tables++
    for (const r of rows.slice(0, MAX_ROWS)) lines.push(r)
    if (rows.length > MAX_ROWS) lines.push(`(… đã bỏ ${rows.length - MAX_ROWS} hàng còn lại của sheet)`)
    paragraphs += Math.min(rows.length, MAX_ROWS)
  }
  const text = lines.join('\n')
  return { text, stats: { words: countWords(text), paragraphs, headings, tables, images, pages: null } }
}

// "AB12" → cột 27 (0-based), hàng 11
function cellRef(ref: string | null): { row: number; col: number } | null {
  const m = ref?.match(/^([A-Z]+)(\d+)$/)
  if (!m) return null
  let col = 0
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
  return { row: Number(m[2]) - 1, col: col - 1 }
}

export async function xlsxToText(buf: Buffer): Promise<OfficeText> {
  const { parts, names } = await readZipParts(buf, (n) => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/i.test(n))
  const wb = parts.get('xl/workbook.xml')
  if (!wb) throw new OfficeError('File Excel không có nội dung (thiếu xl/workbook.xml)')
  const rels = readRels(parts.get('xl/_rels/workbook.xml.rels'), 'xl')
  const shared = [...(parts.get('xl/sharedStrings.xml') ?? '').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)].map((m) => joinText(m[1] ?? '', 't'))

  const sheets: { name: string; rows: string[][] }[] = []
  for (const m of wb.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = unescapeXml(attr(m[1], 'name') ?? '')
    const rid = attr(m[1], 'r:id')
    const xml = rid ? parts.get(rels.get(rid)?.target ?? '') : undefined
    if (!xml) continue // chart sheet / thiếu sheet
    const rows: string[][] = []
    let nextRow = 0
    for (const r of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const rowIdx = Number(attr(r[1], 'r') ?? nextRow + 1) - 1
      nextRow = rowIdx + 1
      const cells: string[] = []
      let nextCol = 0
      for (const c of (r[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const col = cellRef(attr(c[1], 'r'))?.col ?? nextCol
        nextCol = col + 1
        const t = attr(c[1], 't')
        const body = c[2] ?? ''
        const v = body.match(/<v>([^<]*)<\/v>/)?.[1]
        let val = ''
        if (t === 's') val = shared[Number(v)] ?? ''
        else if (t === 'inlineStr') val = joinText(body, 't')
        else if (t === 'b') val = v === '1' ? 'TRUE' : v === '0' ? 'FALSE' : ''
        else if (v !== undefined) val = t === 'str' || t === 'e' ? unescapeXml(v) : formatNumber(Number(v))
        if (col < 1000) cells[col] = val
      }
      if (rowIdx < 1_000_000) rows[rowIdx] = Array.from(cells, (x) => x ?? '')
    }
    sheets.push({ name, rows: Array.from(rows, (x) => x ?? []) })
  }
  return sheetsToText(sheets, names.filter((n) => /^xl\/media\/[^/]+$/i.test(n)).length)
}

// Một slide: tiêu đề + các đoạn (thân, bảng), ghi chú của người thuyết trình.
export interface SlideText {
  title: string
  lines: string[]
  notes: string[]
}

/** Gom slide thành văn bản: "# Slide N: <tiêu đề>", đoạn thân "- …", ghi chú "> Ghi chú: …". */
export function slidesToText(slides: SlideText[], images: number): OfficeText {
  const lines: string[] = []
  const headings: DocStats['headings'] = []
  let paragraphs = 0
  let tables = 0
  slides.forEach((s, i) => {
    if (lines.length) lines.push('')
    const h = `Slide ${i + 1}` + (s.title ? ': ' + s.title : '')
    lines.push('# ' + h)
    headings.push({ level: 1, text: h, line: lines.length })
    let inTable = false
    for (const l of s.lines) {
      const isRow = l.startsWith('| ')
      if (isRow && !inTable) tables++
      inTable = isRow
      lines.push(isRow ? l : '- ' + l)
      paragraphs++
    }
    for (const n of s.notes) lines.push('> Ghi chú: ' + n)
  })
  const text = lines.join('\n')
  return { text, stats: { words: countWords(text), paragraphs, headings, tables, images, pages: slides.length } }
}

const paraText = (xml: string): string =>
  joinText(xml.replace(/<a:br\b[^>]*\/>/g, '<a:t>\n</a:t>').replace(/<a:tab\b[^>]*\/>/g, '<a:t>\t</a:t>'), 'a:t')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\s*\n\s*/g, ' / ')
    .trim()

// Các đoạn văn của 1 khối XML (shape / ô bảng)
function paragraphs(xml: string): string[] {
  return [...xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)].map((m) => paraText(m[1])).filter(Boolean)
}

function slideXmlToText(xml: string): { title: string; lines: string[] } {
  let title = ''
  const lines: string[] = []
  // Bảng (graphicFrame chứa a:tbl) tách riêng trước, phần còn lại là shape
  const rest = xml.replace(/<a:tbl\b[\s\S]*?<\/a:tbl>/g, (tbl) => {
    for (const tr of tbl.matchAll(/<a:tr\b[^>]*>([\s\S]*?)<\/a:tr>/g)) {
      const row = tableRow([...tr[1].matchAll(/<a:tc\b[^>]*?(?:\/>|>([\s\S]*?)<\/a:tc>)/g)].map((tc) => paragraphs(tc[1] ?? '').join(' / ')))
      if (row) lines.push(row)
    }
    return ''
  })
  for (const sp of rest.matchAll(/<p:sp\b[^>]*>([\s\S]*?)<\/p:sp>/g)) {
    const ph = sp[1].match(/<p:ph\b([^>]*)\/?>/)?.[1]
    const type = ph !== undefined ? attr(ph, 'type') : null
    const paras = paragraphs(sp[1])
    if (!paras.length) continue
    if (!title && (type === 'title' || type === 'ctrTitle')) title = paras.join(' / ')
    else if (type !== 'sldNum' && type !== 'dt' && type !== 'ftr') lines.push(...paras)
  }
  return { title, lines }
}

export async function pptxToText(buf: Buffer): Promise<OfficeText> {
  const { parts, names } = await readZipParts(buf, (n) =>
    /^ppt\/(presentation\.xml|_rels\/presentation\.xml\.rels|slides\/[^/]+\.xml|slides\/_rels\/[^/]+\.rels|notesSlides\/[^/]+\.xml)$/i.test(n)
  )
  const pres = parts.get('ppt/presentation.xml')
  if (!pres) throw new OfficeError('File PowerPoint không có nội dung (thiếu ppt/presentation.xml)')
  const rels = readRels(parts.get('ppt/_rels/presentation.xml.rels'), 'ppt')
  // Thứ tự slide theo sldIdLst (không theo tên file slideN.xml)
  let slidePaths = [...pres.matchAll(/<p:sldId\b([^>]*)\/?>/g)].map((m) => rels.get(attr(m[1], 'r:id') ?? '')?.target).filter((p): p is string => !!p && parts.has(p))
  if (!slidePaths.length) {
    slidePaths = [...parts.keys()].filter((k) => /^ppt\/slides\/slide\d+\.xml$/i.test(k)).sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]))
  }
  const slides: SlideText[] = slidePaths.map((p) => {
    const { title, lines } = slideXmlToText(parts.get(p)!)
    const base = p.split('/').pop()!
    const sRels = readRels(parts.get(`ppt/slides/_rels/${base}.rels`), 'ppt/slides')
    const notesPath = [...sRels.values()].find((r) => r.type.endsWith('/notesSlide'))?.target
    const notesXml = notesPath ? parts.get(notesPath) : undefined
    let notes: string[] = []
    if (notesXml) {
      // Ghi chú = shape placeholder "body" của trang ghi chú (bỏ ảnh thu nhỏ slide, số trang)
      for (const sp of notesXml.matchAll(/<p:sp\b[^>]*>([\s\S]*?)<\/p:sp>/g)) {
        if (attr(sp[1].match(/<p:ph\b([^>]*)\/?>/)?.[1] ?? '', 'type') === 'body') notes.push(...paragraphs(sp[1]))
      }
      notes = notes.filter(Boolean)
    }
    return { title, lines, notes }
  })
  return slidesToText(slides, names.filter((n) => /^ppt\/media\/[^/]+$/i.test(n)).length)
}
