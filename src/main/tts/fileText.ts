// TTS từ file: đọc file văn bản (txt, md, html, srt, csv, json, Word, Excel, PowerPoint, OpenDocument, EPUB…) → tách
// thành từng dòng. Mỗi dòng có chữ sẽ thành 1 file voice<N>.wav (xem batch.ts). Dòng trống / chỉ có ký hiệu / chỉ là cú
// pháp định dạng được giữ lại kèm lý do bỏ để màn xem trước hiện cho người dùng đối chiếu.
// Nhận diện theo NỘI DUNG trước (zip Office / OpenDocument / EPUB, CFB, RTF, PDF), sau đó mới theo đuôi file.
import { extname } from 'path'
import { TTS_BATCH_MAX_LINES } from '@shared/constants'
import type { TtsFileLine, TtsFileParse } from '@shared/types'
import { isCfb } from '../importer/cfb'
import { officeToText } from '../importer/office'
import { readZipParts, unescapeXml } from '../importer/ooxml'

type Kind = 'plain' | 'markdown' | 'office' | 'html' | 'subtitle' | 'table'

const KIND_LABEL: Record<string, string> = {
  plain: 'Văn bản',
  markdown: 'Markdown',
  html: 'HTML / XML',
  subtitle: 'Phụ đề',
  table: 'Bảng CSV / TSV',
  json: 'JSON',
  word: 'Word',
  excel: 'Excel',
  powerpoint: 'PowerPoint',
  rtf: 'RTF',
  odf: 'OpenDocument',
  epub: 'EPUB'
}

const isZip = (b: Buffer): boolean => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5 || b[2] === 7)
const isRtf = (b: Buffer): boolean => b.subarray(0, 5).toString('latin1') === '{\\rtf'
const isPdf = (b: Buffer): boolean => b.subarray(0, 5).toString('latin1') === '%PDF-'

// ───── Giải mã văn bản thuần ─────
function decodeText(buf: Buffer): { text: string; encoding: string } {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return { text: buf.subarray(3).toString('utf8'), encoding: 'UTF-8' }
  if (buf[0] === 0xff && buf[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(buf.subarray(2)), encoding: 'UTF-16 LE' }
  if (buf[0] === 0xfe && buf[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(buf.subarray(2)), encoding: 'UTF-16 BE' }
  // UTF-16 không BOM: nhiều byte 0 ở vị trí lẻ (chữ Latin)
  const probe = buf.subarray(0, 4096)
  let zeroOdd = 0
  let zeroEven = 0
  for (let i = 0; i < probe.length; i++) if (probe[i] === 0) i % 2 ? zeroOdd++ : zeroEven++
  if (probe.length >= 8 && zeroOdd > probe.length * 0.2 && zeroEven < probe.length * 0.02) {
    return { text: new TextDecoder('utf-16le').decode(buf), encoding: 'UTF-16 LE' }
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), encoding: 'UTF-8' }
  } catch {
    /* không phải UTF-8 → thử bảng mã tiếng Việt của Windows */
  }
  try {
    return { text: new TextDecoder('windows-1258').decode(buf), encoding: 'Windows-1258' }
  } catch {
    return { text: buf.toString('latin1'), encoding: 'Latin-1' }
  }
}

function looksBinary(text: string): boolean {
  const s = text.slice(0, 8192)
  if (!s) return false
  let bad = 0
  for (const ch of s) {
    const c = ch.charCodeAt(0)
    if (c === 0 || (c < 32 && c !== 9 && c !== 10 && c !== 13 && c !== 12)) bad++
  }
  return bad > s.length * 0.05
}

// ───── Markdown → chữ đọc được (từng dòng) ─────
function cleanMarkdownLine(line: string, st: { fence: boolean }): string {
  if (/^\s*(```|~~~)/.test(line)) {
    st.fence = !st.fence
    return ''
  }
  if (st.fence) return line.trim()
  let s = line
  if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(s)) return '' // đường kẻ ngang
  if (/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(s)) return '' // dòng phân cách bảng
  if (/^\s*\[\^[^\]]+\]:/.test(s)) return '' // định nghĩa chú thích
  if (/^\s*\[[^\]]+\]:\s*\S+/.test(s)) return '' // định nghĩa link tham chiếu
  s = s.replace(/^(\s*>)+\s?/, '') // trích dẫn
  s = s.replace(/^\s{0,3}#{1,6}\s+/, '').replace(/\s+#+\s*$/, '') // tiêu đề
  s = s.replace(/^\s*([-*+]|\d{1,3}[.)])\s+/, '') // danh sách
  s = s.replace(/^\[[ xX]\]\s+/, '') // checkbox
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // ảnh → chữ thay thế
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // link → chữ
  s = s.replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
  s = s.replace(/\[\^[^\]]+\]/g, '') // chú thích [^1]
  s = s.replace(/<(https?:\/\/|mailto:)[^>]+>/g, '')
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, '') // thẻ HTML
  s = s.replace(/`+([^`]*)`+/g, '$1') // code nội dòng
  s = s.replace(/\*+|~~/g, '') // in đậm / nghiêng / gạch
  s = s.replace(/(^|[^\p{L}\p{N}])_+|_+(?=[^\p{L}\p{N}]|$)/gu, '$1')
  if (/^\s*\|.*\|\s*$/.test(s)) {
    s = s
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean)
      .join(', ')
  }
  return s
}

// Văn bản Office (định dạng chung của importer: "# Slide N: …", "# Sheet: …", "> Ghi chú: …", "| ô |") → dòng đọc được
function cleanOfficeLine(line: string, st: { fence: boolean }): string {
  if (/^# Sheet: /.test(line) || /^\(… đã bỏ \d+ hàng/.test(line)) return ''
  const slide = line.match(/^# Slide \d+(?:: (.*))?$/)
  if (slide) return slide[1] ?? ''
  const note = line.match(/^> Ghi chú: (.*)$/)
  if (note) return note[1]
  return cleanMarkdownLine(line, st)
}

// ───── HTML / XML → dòng ─────
const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  copy: '©',
  reg: '®',
  deg: '°',
  euro: '€'
}

function htmlToText(html: string): string {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<(script|style|head|noscript|template|svg)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
  s = s.replace(/\s*<\/(td|th)\s*>\s*/gi, ', ')
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(
    /<\/?(p|div|li|ul|ol|h[1-6]|tr|table|section|article|header|footer|blockquote|pre|dt|dd|title|figcaption|nav|aside|main)\b[^>]*>/gi,
    '\n'
  )
  // XML chung: mỗi thẻ đóng là ranh giới dòng (thẻ HTML nội dòng như <b>, <span> đã không nằm trong danh sách trên)
  if (!/<html\b|<body\b|<p\b|<div\b/i.test(html)) s = s.replace(/<\/[^>]+>/g, '\n')
  s = s.replace(/<[^>]+>/g, '')
  s = s.replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m)
  s = unescapeXml(s)
  return s
    .split('\n')
    .map((l) => l.replace(/,\s*$/, '').trim())
    .join('\n')
}

// ───── Phụ đề SRT / VTT ─────
function cleanSubtitleLine(line: string, st: { note: boolean }): string {
  const s = line.trim()
  if (!s) {
    st.note = false
    return ''
  }
  if (st.note) return ''
  if (/^WEBVTT\b/.test(s) || /^(STYLE|REGION)\b/.test(s)) return ''
  if (/^NOTE\b/.test(s)) {
    st.note = true
    return ''
  }
  if (/^\d+$/.test(s) || s.includes('-->')) return ''
  return s.replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '')
}

// ───── CSV / TSV: mỗi hàng = 1 dòng ("ô 1, ô 2") ─────
function parseDelimited(text: string, sep: string): string[] {
  const rows: string[] = []
  let cells: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"'
          i++
        } else quoted = false
      } else cur += ch === '\n' || ch === '\r' ? ' ' : ch
      continue
    }
    if (ch === '"' && !cur.trim()) quoted = true
    else if (ch === sep) {
      cells.push(cur)
      cur = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      cells.push(cur)
      rows.push(
        cells
          .map((c) => c.trim())
          .filter(Boolean)
          .join(', ')
      )
      cells = []
      cur = ''
    } else cur += ch
  }
  if (cur || cells.length) {
    cells.push(cur)
    rows.push(
      cells
        .map((c) => c.trim())
        .filter(Boolean)
        .join(', ')
    )
  }
  return rows
}

function guessSeparator(text: string, ext: string): string {
  if (ext === '.tsv') return '\t'
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  const count = (c: string): number => first.split(c).length - 1
  const best = [',', ';', '\t'].sort((a, b) => count(b) - count(a))[0]
  return count(best) ? best : ','
}

// ───── JSON: lấy mọi chuỗi chữ theo thứ tự ─────
function jsonStrings(v: unknown, out: string[]): void {
  if (out.length > TTS_BATCH_MAX_LINES * 2) return
  if (typeof v === 'string') out.push(...v.split(/\r\n|\r|\n/))
  else if (Array.isArray(v)) for (const x of v) jsonStrings(x, out)
  else if (v && typeof v === 'object') for (const x of Object.values(v)) jsonStrings(x, out)
}

// ───── OpenDocument (.odt .ods .odp) ─────
function odfInline(xml: string): string {
  return unescapeXml(
    xml
      .replace(/<text:s\b[^>]*text:c="(\d+)"[^>]*\/>/g, (_m, n: string) => ' '.repeat(Math.min(Number(n), 50)))
      .replace(/<text:(s|tab)\b[^>]*\/>/g, ' ')
      .replace(/<text:line-break\b[^>]*\/>/g, ' ')
      .replace(/<text:note-citation\b[\s\S]*?<\/text:note-citation>/g, '')
      .replace(/<[^>]+>/g, '')
  )
}

function odfToText(content: string, spreadsheet: boolean): string {
  const body = content.replace(/^[\s\S]*?<office:body\b[^>]*>/, '')
  if (spreadsheet) {
    const rows = body.match(/<table:table-row\b[\s\S]*?<\/table:table-row>/g) ?? []
    return rows
      .map((r) =>
        (r.match(/<table:table-cell\b[^>]*>[\s\S]*?<\/table:table-cell>/g) ?? [])
          .map((c) => odfInline(c.replace(/<\/text:p>/g, ' ')).trim())
          .filter(Boolean)
          .join(', ')
      )
      .join('\n')
  }
  return odfInline(body.replace(/<\/text:(p|h)>/g, '\n').replace(/<text:(p|h)\b[^>]*\/>/g, '\n'))
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
}

// ───── EPUB: các chương XHTML theo thứ tự spine ─────
async function epubToText(buf: Buffer): Promise<string> {
  const { parts, names } = await readZipParts(buf, (n) => n === 'META-INF/container.xml' || /\.opf$/i.test(n) || /\.x?html?$/i.test(n))
  const opfPath = parts.get('META-INF/container.xml')?.match(/full-path="([^"]+)"/)?.[1] ?? names.find((n) => /\.opf$/i.test(n))
  let order: string[] = []
  const opf = opfPath ? parts.get(opfPath) : undefined
  if (opfPath && opf) {
    const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''
    const items = new Map<string, string>()
    for (const m of opf.matchAll(/<item\b([^>]*)\/?>/g)) {
      const id = m[1].match(/\bid="([^"]+)"/)?.[1]
      const href = m[1].match(/\bhref="([^"]+)"/)?.[1]
      if (id && href) items.set(id, base + decodeURIComponent(href.split('#')[0]))
    }
    order = [...opf.matchAll(/<itemref\b[^>]*idref="([^"]+)"/g)].map((m) => items.get(m[1]) ?? '').filter((p) => parts.has(p))
  }
  if (!order.length) order = names.filter((n) => /\.x?html?$/i.test(n)).sort()
  return order.map((p) => htmlToText(parts.get(p) ?? '')).join('\n')
}

// ───── Tách dòng + phân loại dòng bị bỏ ─────
function toLines(text: string, clean: ((line: string) => string) | null): { lines: TtsFileLine[]; truncated: boolean } {
  const raws = text.normalize('NFC').split(/\r\n|\r|\n|\u2028|\u2029/)
  const lines: TtsFileLine[] = []
  let kept = 0
  let truncated = false
  for (let i = 0; i < raws.length; i++) {
    const raw = raws[i].replace(/\t/g, ' ').trim()
    const text = (clean ? clean(raws[i]) : raw).replace(/[\s ]+/g, ' ').trim()
    const l: TtsFileLine = { line: i + 1, text }
    if (raw !== text) l.raw = raw
    if (!raw) l.skip = 'empty'
    else if (!text) l.skip = 'markup'
    else if (!/[\p{L}\p{N}]/u.test(text)) l.skip = 'symbols'
    if (!l.skip && kept >= TTS_BATCH_MAX_LINES) {
      truncated = true
      break
    }
    if (!l.skip) kept++
    lines.push(l)
  }
  // bỏ các dòng trống ở cuối file
  while (lines.length && lines[lines.length - 1].skip === 'empty') lines.pop()
  return { lines, truncated }
}

/** Đọc nội dung file → các dòng (mỗi dòng có chữ = 1 file âm thanh). */
export async function parseTtsFile(name: string, buf: Buffer): Promise<TtsFileParse> {
  const ext = extname(name).toLowerCase()
  const done = (kind: string, text: string, clean: Kind, encoding?: string): TtsFileParse => {
    const md = { fence: false }
    const sub = { note: false }
    const fn =
      clean === 'markdown'
        ? (l: string) => cleanMarkdownLine(l, md)
        : clean === 'office'
          ? (l: string) => cleanOfficeLine(l, md)
          : clean === 'subtitle'
            ? (l: string) => cleanSubtitleLine(l, sub)
            : null
    const r = toLines(text, fn)
    if (!r.lines.some((l) => !l.skip)) throw new Error('File không có dòng chữ nào để đọc')
    return { name, kind: KIND_LABEL[kind] ?? kind, encoding, ...r }
  }

  if (!buf.length) throw new Error('File rỗng')
  if (isPdf(buf)) {
    throw new Error('Chưa hỗ trợ đọc PDF — hãy mở PDF, sao chép chữ sang file .txt hoặc Word rồi mở file đó')
  }
  if (isZip(buf)) {
    const { names, parts } = await readZipParts(buf, (n) => n === 'mimetype' || n === 'content.xml')
    const mime = (parts.get('mimetype') ?? '').trim()
    if (names.includes('word/document.xml')) return done('word', (await officeToText(buf)).text, 'office')
    if (names.includes('xl/workbook.xml')) return done('excel', (await officeToText(buf)).text, 'office')
    if (names.includes('ppt/presentation.xml')) return done('powerpoint', (await officeToText(buf)).text, 'office')
    if (mime === 'application/epub+zip' || ext === '.epub') return done('epub', await epubToText(buf), 'plain')
    const content = parts.get('content.xml')
    if (content) return done('odf', odfToText(content, mime.includes('spreadsheet') || ext === '.ods'), 'plain')
    throw new Error('File nén / định dạng này chưa hỗ trợ — hãy dùng .txt, .md, Word, Excel, PowerPoint, OpenDocument hoặc EPUB')
  }
  if (isCfb(buf)) {
    const t = (await officeToText(buf)).text
    const kind = /^\.xls/.test(ext) ? 'excel' : /^\.ppt/.test(ext) ? 'powerpoint' : 'word'
    return done(kind, t, 'office')
  }
  if (isRtf(buf)) return done('rtf', (await officeToText(buf)).text, 'office')

  const { text, encoding } = decodeText(buf)
  if (looksBinary(text)) throw new Error('Không đọc được file này như văn bản (định dạng chưa hỗ trợ hoặc file hỏng)')
  const body = text.replace(/^\ufeff/, '')
  switch (ext) {
    case '.md':
    case '.markdown':
    case '.mdown':
    case '.mkd':
      return done('markdown', body, 'markdown', encoding)
    case '.html':
    case '.htm':
    case '.xhtml':
    case '.xml':
      return done('html', htmlToText(body), 'plain', encoding)
    case '.srt':
    case '.vtt':
      return done('subtitle', body, 'subtitle', encoding)
    case '.csv':
    case '.tsv':
      return done('table', parseDelimited(body, guessSeparator(body, ext)).join('\n'), 'plain', encoding)
    case '.json': {
      try {
        const out: string[] = []
        jsonStrings(JSON.parse(body), out)
        return done('json', out.join('\n'), 'plain', encoding)
      } catch {
        return done('plain', body, 'plain', encoding)
      }
    }
  }
  // Đuôi lạ nhưng nội dung là HTML → bỏ thẻ
  if (/^\s*<(!doctype html|html\b)/i.test(body)) return done('html', htmlToText(body), 'plain', encoding)
  return done('plain', body, 'plain', encoding)
}
