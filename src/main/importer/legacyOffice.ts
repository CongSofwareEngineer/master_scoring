// Đọc file Office 97-2003 (.doc .xls .ppt — định dạng nhị phân trong OLE/CFB) và RTF thành văn bản thuần, cùng định
// dạng đầu ra với .docx / .xlsx / .pptx (heading → "#", bảng → "| ô | ô |").
import iconv from 'iconv-lite'
import type { DocStats } from '@shared/types'
import { OfficeError, summaryPageCount, type Cfb } from './cfb'
import { countWords, formatNumber, sheetsToText, slidesToText, tableRow, type OfficeText, type SlideText } from './ooxml'

// ───────────── Gom đoạn văn → văn bản (dùng chung .doc và RTF) ─────────────

interface ParaOut {
  text: string
  level: number | null // cấp heading
  list: boolean
  inTable: boolean
  cellEnd: boolean // đoạn kết thúc 1 ô
  rowEnd: boolean // đoạn kết thúc 1 hàng
}

const clean = (s: string): string => s.trim().replace(/[ \t\u00a0]+/g, ' ').replace(/\s*\n\s*/g, ' / ')

function buildDoc(paras: ParaOut[], images: number, pages: number | null): OfficeText {
  const lines: string[] = []
  const headings: DocStats['headings'] = []
  let paragraphs = 0
  let tables = 0
  let row: string[] = []
  let cell: string[] = []
  let inTable = false
  const closeTable = (): void => {
    if (cell.length) row.push(cell.join(' / '))
    const r = tableRow(row)
    if (r) lines.push(r)
    row = []
    cell = []
  }
  for (const p of paras) {
    const text = clean(p.text)
    if (p.inTable || p.rowEnd) {
      if (!inTable) tables++
      inTable = true
      if (p.rowEnd) {
        if (text) cell.push(text)
        closeTable()
        continue
      }
      if (text) cell.push(text)
      if (p.cellEnd) {
        row.push(cell.join(' / '))
        cell = []
      }
      continue
    }
    if (inTable) {
      closeTable()
      lines.push('')
      inTable = false
    }
    if (!text) continue
    paragraphs++
    if (p.level) {
      lines.push('#'.repeat(Math.min(p.level, 6)) + ' ' + text)
      headings.push({ level: p.level, text, line: lines.length })
    } else lines.push((p.list ? '- ' : '') + text)
  }
  if (inTable) closeTable()
  while (lines.length && !lines[lines.length - 1]) lines.pop()
  const text = lines.join('\n')
  return { text, stats: { words: countWords(text), paragraphs, headings, tables, images, pages } }
}

// ───────────── Word 97-2003 (.doc) ─────────────

interface PapRun {
  fcStart: number
  fcEnd: number
  istd: number
  inTable: boolean
  ttp: boolean
  outLvl: number | null
  list: boolean
}

// Đọc các sprm cần thiết trong grpprl của PAPX: trong bảng, cuối hàng, outline level, danh sách.
function readGrpprl(b: Buffer, start: number, end: number, run: PapRun): void {
  let p = start
  while (p + 2 <= end) {
    const sprm = b.readUInt16LE(p)
    p += 2
    const spra = sprm >> 13
    let size: number
    if (spra === 6) {
      if (sprm === 0xd608 || sprm === 0xd606) {
        if (p + 2 > end) return
        size = b.readUInt16LE(p) + 1 // cb gồm cả 2 byte độ dài − 1
      } else {
        if (p >= end || (sprm === 0xc615 && b[p] === 255)) return
        size = b[p] + 1
      }
    } else size = [1, 1, 2, 4, 2, 2, 0, 3][spra]
    if (p + size > end) return
    if (sprm === 0x2416) run.inTable = b[p] !== 0
    else if (sprm === 0x2417) run.ttp = b[p] !== 0
    else if (sprm === 0x6649) run.inTable = run.inTable || b.readInt32LE(p) > 0
    else if (sprm === 0x2640) run.outLvl = b[p]
    else if (sprm === 0x460b) run.list = b.readUInt16LE(p) > 0
    p += size
  }
}

// istd → cấp heading theo sti (1..9 = Heading 1..9, 62 = Title) hoặc tên style "heading N".
function docHeadingStyles(table: Buffer, fc: number, lcb: number): Map<number, number> {
  const out = new Map<number, number>()
  if (!lcb || fc + lcb > table.length) return out
  const cbStshi = table.readUInt16LE(fc)
  const cstd = table.readUInt16LE(fc + 2)
  const cbBase = table.readUInt16LE(fc + 4)
  let p = fc + 2 + cbStshi
  for (let istd = 0; istd < cstd && p + 2 <= fc + lcb; istd++) {
    const cb = table.readUInt16LE(p)
    if (cb >= 2) {
      const sti = table.readUInt16LE(p + 2) & 0x0fff
      let name = ''
      const np = p + 2 + cbBase
      if (np + 2 <= p + 2 + cb) {
        const cch = table.readUInt16LE(np)
        name = table.toString('utf16le', np + 2, Math.min(np + 2 + cch * 2, p + 2 + cb)).toLowerCase()
      }
      const h = name.match(/^heading\s*(\d)$/)
      if (sti >= 1 && sti <= 9) out.set(istd, sti)
      else if (sti === 62 || name === 'title') out.set(istd, 1)
      else if (h) out.set(istd, Number(h[1]))
    }
    p += 2 + cb
  }
  return out
}

function papRuns(wd: Buffer, table: Buffer, fc: number, lcb: number): PapRun[] {
  const runs: PapRun[] = []
  if (!lcb || fc + lcb > table.length) return runs
  const n = (lcb - 4) / 8
  for (let i = 0; i < n; i++) {
    const pn = table.readUInt32LE(fc + (n + 1) * 4 + i * 4) & 0x3fffff
    const page = pn * 512
    if (page + 512 > wd.length) continue
    const crun = wd[page + 511]
    for (let j = 0; j < crun; j++) {
      const run: PapRun = {
        fcStart: wd.readUInt32LE(page + j * 4),
        fcEnd: wd.readUInt32LE(page + (j + 1) * 4),
        istd: 0,
        inTable: false,
        ttp: false,
        outLvl: null,
        list: false
      }
      const bOff = wd[page + (crun + 1) * 4 + j * 13] * 2
      if (bOff) {
        const cb = wd[page + bOff]
        const start = cb ? page + bOff + 1 : page + bOff + 2
        const len = cb ? cb * 2 - 1 : wd[page + bOff + 1] * 2
        const end = Math.min(start + len, page + 511)
        if (start + 2 <= end) {
          run.istd = wd.readUInt16LE(start)
          readGrpprl(wd, start + 2, end, run)
        }
      }
      runs.push(run)
    }
  }
  return runs.sort((a, b) => a.fcStart - b.fcStart)
}

function findRun(runs: PapRun[], fc: number): PapRun | null {
  let lo = 0
  let hi = runs.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (fc < runs[mid].fcStart) hi = mid - 1
    else if (fc >= runs[mid].fcEnd) lo = mid + 1
    else return runs[mid]
  }
  return null
}

export function docToText(cfb: Cfb): OfficeText {
  const wd = cfb.streams.get('WordDocument')!
  if (wd.length < 0x200 || wd.readUInt16LE(0) !== 0xa5ec) throw new OfficeError('File Word .doc hỏng')
  const nFib = wd.readUInt16LE(2)
  const flags = wd.readUInt16LE(0x0a)
  if (flags & 0x0100) throw new OfficeError('File Word có mật khẩu')
  if (nFib < 0xc0) throw new OfficeError('File Word 6.0 / 95 quá cũ — cần lưu lại bằng Word mới hơn')
  const table = cfb.streams.get(flags & 0x0200 ? '1Table' : '0Table')
  if (!table) throw new OfficeError('File Word .doc hỏng (thiếu bảng dữ liệu)')

  const csw = wd.readUInt16LE(32)
  const lwBase = 34 + csw * 2 + 2
  const cslw = wd.readUInt16LE(34 + csw * 2)
  const ccpText = wd.readInt32LE(lwBase + 3 * 4)
  const fcLcbBase = lwBase + cslw * 4 + 2
  const pair = (i: number): [number, number] => [wd.readUInt32LE(fcLcbBase + i * 8), wd.readUInt32LE(fcLcbBase + i * 8 + 4)]
  const [fcStshf, lcbStshf] = pair(1)
  const [fcBtePapx, lcbBtePapx] = pair(13)
  const [fcClx, lcbClx] = pair(33)
  if (!lcbClx || fcClx + lcbClx > table.length) throw new OfficeError('File Word .doc hỏng (thiếu bảng đoạn văn)')

  // Clx: bỏ các Prc, tới Pcdt (bảng piece: vị trí ký tự → vị trí byte trong WordDocument)
  let p = fcClx
  while (table[p] === 0x01) p += 3 + table.readInt16LE(p + 1)
  if (table[p] !== 0x02) throw new OfficeError('File Word .doc hỏng (bảng piece)')
  const lcb = table.readUInt32LE(p + 1)
  const plc = p + 5
  const n = Math.floor((lcb - 4) / 12)
  const pieces: { cp: number; cpEnd: number; fc: number; compressed: boolean }[] = []
  for (let i = 0; i < n; i++) {
    const raw = table.readUInt32LE(plc + (n + 1) * 4 + i * 8 + 2)
    const compressed = (raw & 0x40000000) !== 0
    pieces.push({ cp: table.readUInt32LE(plc + i * 4), cpEnd: table.readUInt32LE(plc + (i + 1) * 4), fc: compressed ? (raw & 0x3fffffff) / 2 : raw, compressed })
  }

  const styles = docHeadingStyles(table, fcStshf, lcbStshf)
  const runs = papRuns(wd, table, fcBtePapx, lcbBtePapx)
  const paras: ParaOut[] = []
  let images = 0
  let cur = ''
  const fields: boolean[] = [] // true = đang trong mã field (bỏ), false = phần kết quả (giữ)
  const endPara = (fc: number, mark: number): void => {
    const run = findRun(runs, fc)
    const lvl = run ? (styles.get(run.istd) ?? (run.outLvl !== null && run.outLvl < 9 ? run.outLvl + 1 : null)) : null
    const inTable = !!run?.inTable
    paras.push({ text: cur, level: inTable ? null : lvl, list: !!run?.list, inTable, cellEnd: mark === 7 && !run?.ttp, rowEnd: mark === 7 && !!run?.ttp })
    cur = ''
  }
  for (const pc of pieces) {
    const from = Math.max(0, pc.cp)
    const to = Math.min(pc.cpEnd, ccpText)
    if (from >= to) continue
    const width = pc.compressed ? 1 : 2
    const start = pc.fc + (from - pc.cp) * width
    const end = start + (to - from) * width
    if (end > wd.length) throw new OfficeError('File Word .doc hỏng (vượt dữ liệu)')
    const chunk = pc.compressed ? iconv.decode(wd.subarray(start, end), 'win1252') : wd.toString('utf16le', start, end)
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk.charCodeAt(i)
      if (c === 0x13) {
        fields.push(true)
        continue
      }
      if (c === 0x14) {
        if (fields.length) fields[fields.length - 1] = false
        continue
      }
      if (c === 0x15) {
        fields.pop()
        continue
      }
      if (fields.includes(true)) continue
      if (c === 0x0d || c === 0x07 || c === 0x0c) endPara(start + i * width, c)
      else if (c === 0x01 || c === 0x08) images++
      else if (c === 0x0b) cur += '\n'
      else if (c === 0x09) cur += '\t'
      else if (c === 0x1e) cur += '-'
      else if (c >= 0x20) cur += chunk[i]
    }
  }
  if (cur) endPara(-1, 0x0d)
  return buildDoc(paras, images, summaryPageCount(cfb))
}

// ───────────── Excel 97-2003 (.xls, BIFF8) ─────────────

// Đọc chuỗi qua nhiều record CONTINUE: khi mảng ký tự bị cắt, record mới bắt đầu bằng 1 byte cờ (8/16 bit).
class SegReader {
  private seg = 0
  private pos = 0
  constructor(private segs: Buffer[]) {}
  private ensure(): boolean {
    while (this.seg < this.segs.length && this.pos >= this.segs[this.seg].length) {
      this.seg++
      this.pos = 0
    }
    return this.seg < this.segs.length
  }
  done(): boolean {
    return !this.ensure()
  }
  bytes(n: number): Buffer {
    const parts: Buffer[] = []
    while (n > 0) {
      if (!this.ensure()) throw new OfficeError('File Excel .xls hỏng (bảng chuỗi)')
      const s = this.segs[this.seg]
      const k = Math.min(n, s.length - this.pos)
      parts.push(s.subarray(this.pos, this.pos + k))
      this.pos += k
      n -= k
    }
    return Buffer.concat(parts)
  }
  u8(): number {
    return this.bytes(1)[0]
  }
  u16(): number {
    return this.bytes(2).readUInt16LE(0)
  }
  u32(): number {
    return this.bytes(4).readUInt32LE(0)
  }
  // Hết record giữa mảng ký tự → record CONTINUE kế bắt đầu bằng 1 byte cờ (bit 0 = ký tự 16 bit).
  chars(n: number, wide: boolean): string {
    let out = ''
    while (n > 0) {
      if (this.pos >= this.segs[this.seg].length) {
        this.seg++
        this.pos = 0
        if (this.seg >= this.segs.length) throw new OfficeError('File Excel .xls hỏng (bảng chuỗi)')
        wide = (this.segs[this.seg][this.pos++] & 1) !== 0
        continue
      }
      const s = this.segs[this.seg]
      const k = Math.min(n, Math.floor((s.length - this.pos) / (wide ? 2 : 1)))
      if (!k) {
        this.pos = s.length // còn nửa ký tự → coi như hết record
        continue
      }
      out += wide ? s.toString('utf16le', this.pos, this.pos + k * 2) : s.toString('latin1', this.pos, this.pos + k)
      this.pos += k * (wide ? 2 : 1)
      n -= k
    }
    return out
  }
}

// XLUnicodeRichExtendedString (SST)
function readSstString(r: SegReader): string {
  const cch = r.u16()
  const fl = r.u8()
  const runs = fl & 0x08 ? r.u16() : 0
  const ext = fl & 0x04 ? r.u32() : 0
  const s = r.chars(cch, (fl & 1) !== 0)
  if (runs) r.bytes(runs * 4)
  if (ext) r.bytes(ext)
  return s
}

// XLUnicodeString trong 1 record (LABEL, STRING, tên sheet)
function readXlString(b: Buffer, p: number, cch: number): string {
  const wide = (b[p] & 1) !== 0
  return wide ? b.toString('utf16le', p + 1, p + 1 + cch * 2) : b.toString('latin1', p + 1, p + 1 + cch)
}

function rkValue(v: number): number {
  let n: number
  if (v & 2) n = v >> 2
  else {
    const b = Buffer.alloc(8)
    b.writeUInt32LE((v & 0xfffffffc) >>> 0, 4)
    n = b.readDoubleLE(0)
  }
  return v & 1 ? n / 100 : n
}

export function xlsToText(cfb: Cfb): OfficeText {
  const wb = cfb.streams.get('Workbook') ?? cfb.streams.get('WORKBOOK')
  if (!wb) {
    if (cfb.streams.has('Book')) throw new OfficeError('File Excel 5.0 / 95 quá cũ — cần lưu lại bằng Excel mới hơn')
    throw new OfficeError('File Excel .xls hỏng (thiếu Workbook)')
  }
  const recs: { type: number; off: number; data: Buffer }[] = []
  for (let p = 0; p + 4 <= wb.length; ) {
    const type = wb.readUInt16LE(p)
    const len = wb.readUInt16LE(p + 2)
    recs.push({ type, off: p, data: wb.subarray(p + 4, Math.min(p + 4 + len, wb.length)) })
    p += 4 + len
  }
  if (recs[0]?.type !== 0x0809 || recs[0].data.readUInt16LE(0) !== 0x0600) throw new OfficeError('File Excel quá cũ hoặc hỏng (chỉ đọc được Excel 97 trở lên)')

  const sheetNames = new Map<number, string>()
  let sst: string[] = []
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i]
    if (r.type === 0x002f) throw new OfficeError('File Excel có mật khẩu')
    if (r.type === 0x0085 && r.data[5] === 0) sheetNames.set(r.data.readUInt32LE(0), readXlString(r.data, 7, r.data[6]))
    if (r.type === 0x00fc) {
      const segs = [r.data]
      for (let j = i + 1; j < recs.length && recs[j].type === 0x003c; j++) segs.push(recs[j].data)
      const rd = new SegReader(segs)
      rd.u32() // cstTotal
      const total = rd.u32() // cstUnique
      sst = []
      try {
        for (let k = 0; k < total && !rd.done(); k++) sst.push(readSstString(rd))
      } catch {
        /* bảng chuỗi bị cắt → giữ phần đọc được */
      }
    }
    if (r.type === 0x000a) break // hết phần globals
  }

  const sheets: { name: string; rows: string[][] }[] = []
  let sheet: { name: string; rows: string[][] } | null = null
  let depth = 0
  let pendingFormula: { row: number; col: number } | null = null
  const set = (row: number, col: number, v: string): void => {
    if (!sheet || depth !== 1 || row > 1_000_000 || col > 1000) return
    ;(sheet.rows[row] ??= [])[col] = v
  }
  for (const r of recs.slice(1)) {
    const d = r.data
    if (r.type === 0x0809) {
      depth++
      if (depth === 1 && sheetNames.has(r.off)) {
        sheet = { name: sheetNames.get(r.off)!, rows: [] }
        sheets.push(sheet)
      }
      continue
    }
    if (r.type === 0x000a) {
      depth = Math.max(0, depth - 1)
      if (!depth) sheet = null
      continue
    }
    if (!sheet) continue
    if (r.type === 0x0207) {
      if (pendingFormula && d.length >= 3) set(pendingFormula.row, pendingFormula.col, readXlString(d, 2, d.readUInt16LE(0)))
      pendingFormula = null
      continue
    }
    if (d.length < 6) continue
    const row = d.readUInt16LE(0)
    const col = d.readUInt16LE(2)
    if (r.type === 0x00fd && d.length >= 10) set(row, col, sst[d.readUInt32LE(6)] ?? '')
    else if (r.type === 0x0204 && d.length >= 9) set(row, col, readXlString(d, 8, d.readUInt16LE(6)))
    else if (r.type === 0x0203 && d.length >= 14) set(row, col, formatNumber(d.readDoubleLE(6)))
    else if (r.type === 0x027e && d.length >= 10) set(row, col, formatNumber(rkValue(d.readInt32LE(6))))
    else if (r.type === 0x00bd) {
      for (let p = 4, c = col; p + 6 <= d.length - 2; p += 6, c++) set(row, c, formatNumber(rkValue(d.readInt32LE(p + 2))))
    } else if (r.type === 0x0205 && d.length >= 8) set(row, col, d[7] ? '#ERR' : d[6] ? 'TRUE' : 'FALSE')
    else if (r.type === 0x0006 && d.length >= 14) {
      if (d.readUInt16LE(12) !== 0xffff) set(row, col, formatNumber(d.readDoubleLE(6)))
      else if (d[6] === 0) pendingFormula = { row, col }
      else if (d[6] === 1) set(row, col, d[8] ? 'TRUE' : 'FALSE')
      continue
    }
    pendingFormula = null
  }
  const out = sheets.map((s) => ({ name: s.name, rows: Array.from(s.rows, (r) => Array.from(r ?? [], (c) => c ?? '')) }))
  return sheetsToText(out, 0)
}

// ───────────── PowerPoint 97-2003 (.ppt) ─────────────

interface PptRec {
  type: number
  inst: number
  container: boolean
  start: number // đầu dữ liệu
  end: number
}

function pptChildren(b: Buffer, start: number, end: number): PptRec[] {
  const out: PptRec[] = []
  for (let p = start; p + 8 <= end; ) {
    const vi = b.readUInt16LE(p)
    const len = b.readUInt32LE(p + 4)
    const s = p + 8
    const e = Math.min(s + len, end)
    out.push({ type: b.readUInt16LE(p + 2), inst: vi >> 4, container: (vi & 0xf) === 0xf, start: s, end: e })
    p = s + len
  }
  return out
}

const TEXT_HEADER = 0x0f9f
const TEXT_CHARS = 0x0fa0
const TEXT_BYTES = 0x0fa8

// Gom text theo thứ tự trong 1 khối: TextHeaderAtom cho biết loại (0 / 6 = tiêu đề), sau đó là text atom.
function collectText(b: Buffer, recs: PptRec[], slide: SlideText, state: { type: number }, depth = 0): void {
  for (const r of recs) {
    if (r.container) {
      if (depth < 30) collectText(b, pptChildren(b, r.start, r.end), slide, state, depth + 1)
      continue
    }
    if (r.type === TEXT_HEADER && r.end - r.start >= 4) state.type = b.readUInt32LE(r.start)
    else if (r.type === TEXT_CHARS || r.type === TEXT_BYTES) {
      const raw = r.type === TEXT_CHARS ? b.toString('utf16le', r.start, r.end) : b.toString('latin1', r.start, r.end)
      const paras = raw.split(/\r/).map((s) => clean(s.replace(/\x0b/g, '\n'))).filter(Boolean)
      if (!paras.length) continue
      if ((state.type === 0 || state.type === 6) && !slide.title) slide.title = paras.join(' / ')
      else if (state.type !== 2) slide.lines.push(...paras) // 2 = ghi chú
    }
  }
}

export function pptToText(cfb: Cfb): OfficeText {
  if (cfb.streams.has('EncryptedSummary')) throw new OfficeError('File PowerPoint có mật khẩu')
  const b = cfb.streams.get('PowerPoint Document')!
  const top = pptChildren(b, 0, b.length)
  // Bảng persist: persistId → vị trí record (các lần lưu nối tiếp ghi đè lần trước)
  const persist = new Map<number, number>()
  for (const r of top.filter((x) => x.type === 0x1772)) {
    for (let p = r.start; p + 4 <= r.end; ) {
      const x = b.readUInt32LE(p)
      const id = x & 0xfffff
      const cnt = x >>> 20
      p += 4
      for (let k = 0; k < cnt && p + 4 <= r.end; k++, p += 4) persist.set(id + k, b.readUInt32LE(p))
    }
  }
  const slideAt = (off: number | undefined): PptRec | null => {
    if (off === undefined || off + 8 > b.length || b.readUInt16LE(off + 2) !== 0x03ee) return null
    return { type: 0x03ee, inst: 0, container: true, start: off + 8, end: Math.min(off + 8 + b.readUInt32LE(off + 4), b.length) }
  }

  const slides: SlideText[] = []
  const doc = top.filter((r) => r.type === 0x03e8).pop()
  const slwt = doc ? pptChildren(b, doc.start, doc.end).find((r) => r.type === 0x0ff0 && r.inst === 0) : undefined
  if (slwt) {
    // Text của placeholder (tiêu đề, nội dung) nằm trong SlideListWithText; text box tự vẽ nằm trong Slide
    let cur: SlideText | null = null
    let curId = -1
    const state = { type: 4 }
    const flush = (): void => {
      if (!cur) return
      const s = slideAt(persist.get(curId))
      if (s) collectText(b, pptChildren(b, s.start, s.end), cur, { type: 4 })
      slides.push(cur)
    }
    for (const r of pptChildren(b, slwt.start, slwt.end)) {
      if (r.type === 0x03f3) {
        flush()
        cur = { title: '', lines: [], notes: [] }
        curId = b.readUInt32LE(r.start)
        state.type = 4
      } else if (cur) collectText(b, [r], cur, state)
    }
    flush()
  } else {
    for (const r of top.filter((x) => x.type === 0x03ee)) {
      const s: SlideText = { title: '', lines: [], notes: [] }
      collectText(b, pptChildren(b, r.start, r.end), s, { type: 4 })
      slides.push(s)
    }
  }
  const pics = cfb.streams.get('Pictures')
  return slidesToText(slides, pics ? pptChildren(pics, 0, pics.length).length : 0)
}

// ───────────── RTF (nhiều file ".doc" thực chất là RTF) ─────────────

const RTF_SKIP = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'headerl', 'headerr', 'headerf', 'footer', 'footerl',
  'footerr', 'footerf', 'themedata', 'colorschememapping', 'datastore', 'latentstyles', 'listtable', 'listoverridetable',
  'rsidtbl', 'generator', 'xmlnstbl', 'fldinst', 'footnote', 'annotation', 'listtext', 'pntext', 'pntxta', 'pntxtb', 'filetbl',
  'revtbl', 'mmathPr', 'nonshppict', 'bkmkstart', 'bkmkend', 'protusertbl', 'userprops', 'docvar'
])

export function rtfToText(buf: Buffer): OfficeText {
  const s = buf.toString('latin1')
  let codepage = 'win1252'
  const paras: ParaOut[] = []
  let cur = ''
  let level: number | null = null
  let list = false
  let inTable = false
  // Ảnh: \pict (bỏ bản dự phòng trong \nonshppict)
  const images = Math.max(0, (s.match(/\\pict\b/g) ?? []).length - (s.match(/\\nonshppict\b/g) ?? []).length)
  let bytes: number[] = []
  const stack: { skip: boolean; uc: number }[] = []
  let g = { skip: false, uc: 1 }
  let skipChars = 0
  const flushBytes = (): void => {
    if (!bytes.length) return
    if (!g.skip) cur += iconv.decode(Buffer.from(bytes), iconv.encodingExists(codepage) ? codepage : 'win1252')
    bytes = []
  }
  const add = (t: string): void => {
    flushBytes()
    if (g.skip) return
    if (skipChars > 0) {
      const k = Math.min(skipChars, t.length)
      skipChars -= k
      t = t.slice(k)
    }
    cur += t
  }
  const endPara = (cellEnd: boolean, rowEnd: boolean): void => {
    flushBytes()
    paras.push({ text: cur, level: inTable ? null : level, list, inTable: inTable || rowEnd, cellEnd, rowEnd })
    cur = ''
  }
  const re = /\\([a-zA-Z]+)(-?\d+)? ?|\\'([0-9a-fA-F]{2})|\\([^a-zA-Z])|([{}])|([^\\{}\r\n]+)|[\r\n]+/g
  let m: RegExpExecArray | null
  let groupStart = false
  while ((m = re.exec(s))) {
    const [, word, num, hex, sym, brace, text] = m
    const wasStart = groupStart
    groupStart = false
    if (brace === '{') {
      flushBytes()
      stack.push(g)
      g = { ...g }
      groupStart = true
    } else if (brace === '}') {
      flushBytes()
      g = stack.pop() ?? { skip: false, uc: 1 }
    } else if (hex) {
      if (skipChars > 0) skipChars--
      else if (!g.skip) bytes.push(parseInt(hex, 16))
    } else if (sym) {
      if (sym === '*' && wasStart) g.skip = true
      else if (sym === '~') add('\u00a0')
      else if (sym === '_') add('-')
      else if (sym === '\\' || sym === '{' || sym === '}') add(sym)
      else if (sym === '\n' || sym === '\r') endPara(false, false)
      if (sym === '*') groupStart = wasStart
    } else if (word) {
      const n = num !== undefined ? Number(num) : null
      if (RTF_SKIP.has(word) && wasStart) g.skip = true
      else if (word === 'ansicpg' && n) codepage = 'cp' + n
      else if (word === 'uc' && n !== null) g.uc = n
      else if (word === 'u' && n !== null) {
        add(String.fromCharCode(n < 0 ? n + 65536 : n))
        skipChars = g.uc
      } else if (g.skip) continue
      else if (word === 'par' || word === 'sect' || word === 'page') endPara(false, false)
      else if (word === 'line') add('\n')
      else if (word === 'tab') add('\t')
      else if (word === 'emdash') add('—')
      else if (word === 'endash') add('–')
      else if (word === 'bullet') add('•')
      else if (word === 'lquote' || word === 'rquote') add(word === 'lquote' ? '‘' : '’')
      else if (word === 'ldblquote' || word === 'rdblquote') add(word === 'ldblquote' ? '“' : '”')
      else if (word === 'pard') {
        level = null
        list = false
        inTable = false
      } else if (word === 'outlinelevel' && n !== null) level = n < 9 ? n + 1 : null
      else if (word === 'ls' || word === 'ilvl') list = true
      else if (word === 'intbl') inTable = true
      else if (word === 'cell') endPara(true, false)
      else if (word === 'row') endPara(false, true)
    } else if (text) add(text)
  }
  flushBytes()
  if (cur.trim()) endPara(false, false)
  // \cell kết thúc ô; đoạn \par trong ô vẫn nằm trong ô; \row kết thúc hàng (không mang text)
  return buildDoc(paras, images, null)
}
