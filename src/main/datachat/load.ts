// Trợ lý dữ liệu: đọc file Excel / CSV thành bảng có kiểu (số / ngày / chữ) để nạp vào SQLite trong RAM.
// Nhận diện dòng tiêu đề (bỏ qua tiêu đề báo cáo phía trên), số kiểu Việt Nam (1.234.567 / 12,5 / 15%) và dòng "Tổng cộng".
import ExcelJS from 'exceljs'
import { readFileSync } from 'fs'
import { basename, extname } from 'path'
import type { DataColumnType, DataNote } from '@shared/types'
import { readCfb, isCfb } from '../importer/cfb'
import { decodeText } from '../importer/extract'
import { xlsSheets } from '../importer/legacyOffice'

export const MAX_ROWS = 200_000
const MAX_COLS = 200

type RawCell = string | number | Date | boolean | null
interface RawSheet {
  name: string
  rows: RawCell[][]
  percentCols?: Set<number> // cột có định dạng % trong Excel
  canonicalNumbers?: boolean // .xls: số đã được ghi dạng "1234.5"
}

export type Value = string | number | null

export interface LoadedColumn {
  name: string // tên cột SQL (không dấu, a-z0-9_)
  label: string // tiêu đề gốc
  type: DataColumnType
  percent: boolean
}

export interface LoadedTable {
  sheet: string
  columns: LoadedColumn[]
  rows: Value[][]
  truncated: boolean
  notes: DataNote[]
}

export const DATA_EXTS = ['xlsx', 'xlsm', 'xls', 'csv', 'tsv', 'txt']

// ───────────── Đọc file → sheet thô ─────────────

function parseCsvLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') q = false
      else cur += ch
    } else if (ch === '"') q = true
    else if (ch === sep) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

// Tách dòng CSV, giữ xuống dòng nằm trong ô có ngoặc kép
function splitCsvRecords(text: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') q = !q
    if (!q && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && text[i + 1] === '\n') i++
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  if (cur) out.push(cur)
  return out
}

function readCsv(file: string): RawSheet {
  const text = decodeText(readFileSync(file)).replace(/^﻿/, '')
  const lines = splitCsvRecords(text)
  const head = lines.slice(0, 20).join('\n')
  const count = (re: RegExp): number => head.match(re)?.length ?? 0
  const ext = extname(file).toLowerCase()
  const sep = ext === '.tsv' || count(/\t/g) > Math.max(count(/;/g), count(/,/g)) ? '\t' : count(/;/g) > count(/,/g) ? ';' : ','
  return { name: basename(file, extname(file)), rows: lines.map((l) => parseCsvLine(l, sep)) }
}

function excelCell(v: any): RawCell {
  if (v == null) return null
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v
  if (v instanceof Date) return v
  if (typeof v === 'object') {
    if ('result' in v) return v.result instanceof Date || typeof v.result !== 'object' ? (v.result ?? null) : null
    if (Array.isArray(v.richText)) return v.richText.map((t: any) => t.text).join('')
    if ('text' in v) return String(v.text ?? '')
    if ('error' in v) return null
  }
  return String(v)
}

async function readXlsx(file: string): Promise<RawSheet[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  const out: RawSheet[] = []
  for (const ws of wb.worksheets) {
    if (ws.state && ws.state !== 'visible') continue
    const rows: RawCell[][] = []
    const percentCols = new Set<number>()
    ws.eachRow({ includeEmpty: true }, (row, r) => {
      if (r > MAX_ROWS + 50) return
      const vals: RawCell[] = []
      row.eachCell({ includeEmpty: false }, (cell, c) => {
        if (c > MAX_COLS) return
        // Ô phụ của vùng gộp: coi là trống (tránh tiêu đề gộp bị lặp ở mọi cột)
        if (cell.isMerged && cell.master && cell.master.address !== cell.address) return
        const v = excelCell(cell.value)
        if (typeof v === 'number' && /%/.test(cell.numFmt ?? '')) percentCols.add(c - 1)
        vals[c - 1] = v
      })
      rows[r - 1] = Array.from(vals, (v) => v ?? null)
    })
    out.push({ name: ws.name, rows: Array.from(rows, (r) => r ?? []), percentCols })
  }
  return out
}

export async function readSheets(file: string): Promise<RawSheet[]> {
  const ext = extname(file).toLowerCase()
  if (ext === '.csv' || ext === '.tsv' || ext === '.txt') return [readCsv(file)]
  if (ext === '.xlsx' || ext === '.xlsm') return readXlsx(file)
  if (ext === '.xls') {
    const buf = readFileSync(file)
    // Một số phần mềm xuất "xls" thực chất là CSV / HTML
    if (!isCfb(buf)) return [readCsv(file)]
    return xlsSheets(readCfb(buf)).map((s) => ({ name: s.name, rows: s.rows, canonicalNumbers: true }))
  }
  throw new Error('Chỉ hỗ trợ file .xlsx, .xls, .csv, .tsv, .txt')
}

// ───────────── Chuẩn hoá giá trị ─────────────

export const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()

const RESERVED = new Set(
  'select from where group order by limit table index values key default check primary references as and or not null in is like between case when then else end join on union all distinct having offset exists cast collate'.split(' ')
)

export function slug(s: string, fallback: string): string {
  let out = norm(s)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  if (!out) out = fallback
  if (/^\d/.test(out)) out = 'c_' + out
  if (RESERVED.has(out)) out += '_'
  return out
}

export function uniqueName(base: string, used: Set<string>): string {
  let n = base
  for (let i = 2; used.has(n); i++) n = `${base}_${i}`
  used.add(n)
  return n
}

type NumStyle = 'vn' | 'us'

// Trả về số nếu chuỗi là số (theo kiểu phân cách), kèm cờ %. Không nhận → null.
export function parseNumber(raw: string, style: NumStyle): { n: number; pct: boolean } | null {
  let s = raw.trim().replace(/[\s ]/g, '')
  if (!s) return null
  let neg = false
  if (/^\(.+\)$/.test(s)) {
    neg = true // số âm kiểu kế toán: (1.000)
    s = s.slice(1, -1)
  }
  s = s.replace(/vnđ|vnd|usd|eur|[₫đ$€£¥]/gi, '')
  const pct = s.endsWith('%')
  if (pct) s = s.slice(0, -1)
  if (/^[+-]/.test(s)) {
    if (s[0] === '-') neg = !neg
    s = s.slice(1)
  }
  let num: string | null = null
  if (style === 'vn') {
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^\d+(,\d+)?$/.test(s)) num = s.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) || /^\d+(\.\d+)?$/.test(s)) num = s.replace(/,/g, '')
  if (num === null && /^\d+(\.\d+)?e[+-]?\d+$/i.test(s)) num = s
  if (num === null) return null
  const n = Number(num)
  if (!Number.isFinite(n)) return null
  return { n: neg ? -n : n, pct }
}

const pad = (n: number): string => String(n).padStart(2, '0')

function dateIso(d: Date): string {
  // exceljs trả ngày theo UTC
  const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  const t = d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()
  return t ? `${day} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` : day
}

function parseDate(s: string): string | null {
  const t = s.trim()
  let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (m) {
    const d = Number(m[1])
    const mo = Number(m[2])
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return null
    const day = `${m[3]}-${pad(mo)}-${pad(d)}`
    return m[4] ? `${day} ${pad(Number(m[4]))}:${m[5]}:${m[6] ?? '00'}` : day
  }
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (m) {
    const day = `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`
    return m[4] ? `${day} ${pad(Number(m[4]))}:${m[5]}:${m[6] ?? '00'}` : day
  }
  return null
}

const isEmpty = (v: RawCell): boolean => v === null || v === '' || (typeof v === 'string' && /^[\s\-–—]*$/.test(v))

function cellText(v: RawCell): string {
  if (v === null) return ''
  if (v instanceof Date) return dateIso(v)
  return String(v).replace(/\s+/g, ' ').trim()
}

// ───────────── Sheet thô → bảng có kiểu ─────────────

function findHeader(rows: RawCell[][], width: number): number {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const cells = rows[r].filter((v) => !isEmpty(v))
    if (cells.length < 2 || cells.length < width * 0.4) continue
    const texts = cells.filter((v) => typeof v === 'string' && !parseNumber(v, 'vn') && !parseNumber(v, 'us') && !parseDate(v))
    const distinct = new Set(texts.map((v) => cellText(v)))
    if (texts.length >= Math.max(2, Math.ceil(cells.length * 0.5)) && distinct.size >= texts.length * 0.6) return r
  }
  return -1
}

const TOTAL_RE = /^(tong cong|tong so|tong|cong|total|grand total|sum)( |:|$)/

function toTable(sheet: RawSheet): LoadedTable | null {
  const notes: DataNote[] = []
  const nonEmptyRows = sheet.rows.filter((r) => r.some((v) => !isEmpty(v)))
  if (!nonEmptyRows.length) return null
  let width = Math.min(MAX_COLS, Math.max(...nonEmptyRows.slice(0, 500).map((r) => r.length)))
  const h = findHeader(nonEmptyRows, width)
  const header = h >= 0 ? nonEmptyRows[h] : []
  let data = nonEmptyRows.slice(h + 1)
  if (!data.length) return null

  // Bỏ cột trống hoàn toàn
  const keep: number[] = []
  for (let c = 0; c < width; c++) if (!isEmpty(header[c] ?? null) || data.some((r) => !isEmpty(r[c] ?? null))) keep.push(c)
  width = keep.length

  // Dòng "Tổng cộng" ở cuối: bỏ để tránh cộng trùng khi tính tổng
  // (chỉ xét các dòng cuối liên tiếp, theo ô đầu tiên có dữ liệu của dòng)
  while (data.length > 1) {
    const first = data[data.length - 1].find((v) => !isEmpty(v))
    const label = typeof first === 'string' ? norm(first.trim()) : ''
    if (!label || label === 'cong ty' || !TOTAL_RE.test(label)) break
    notes.push({ text: 'Đã bỏ dòng "{row}" ở cuối bảng để tránh cộng trùng', vars: { row: String(first).trim().slice(0, 40) } })
    data = data.slice(0, -1)
  }
  let truncated = false
  if (data.length > MAX_ROWS) {
    data = data.slice(0, MAX_ROWS)
    truncated = true
    notes.push({ text: 'Chỉ nạp {n} dòng đầu', vars: { n: String(MAX_ROWS) } })
  }

  const used = new Set<string>()
  const columns: LoadedColumn[] = []
  const values: Value[][] = data.map(() => new Array(width).fill(null))
  keep.forEach((c, j) => {
    const label = cellText(header[c] ?? null) || `Cột ${j + 1}`
    const name = uniqueName(slug(label, `cot_${j + 1}`), used)
    const cells = data.map((r) => r[c] ?? null)
    const filled = cells.filter((v) => !isEmpty(v))
    const strs = filled.filter((v): v is string => typeof v === 'string')
    // Chọn kiểu phân cách số theo cả cột (VN: 1.234,5 — US: 1,234.5)
    let style: NumStyle = 'vn'
    if (sheet.canonicalNumbers) style = 'us'
    else if (strs.length) {
      const vn = strs.filter((s) => parseNumber(s, 'vn')).length
      const us = strs.filter((s) => parseNumber(s, 'us')).length
      style = us > vn ? 'us' : 'vn'
    }
    let numCount = 0
    let dateCount = 0
    let pctCount = 0
    for (const v of filled) {
      if (typeof v === 'number') numCount++
      else if (v instanceof Date) dateCount++
      else if (typeof v === 'string') {
        const p = parseNumber(v, style)
        if (p) {
          numCount++
          if (p.pct) pctCount++
        } else if (parseDate(v)) dateCount++
      }
    }
    const total = filled.length || 1
    const type: DataColumnType = numCount >= total * 0.8 && filled.length ? 'number' : dateCount >= total * 0.8 && filled.length ? 'date' : 'text'
    const percent = type === 'number' && (sheet.percentCols?.has(c) || pctCount >= numCount * 0.5)
    const excelPct = !!sheet.percentCols?.has(c)
    cells.forEach((v, i) => {
      if (isEmpty(v)) return
      let out: Value
      if (type === 'number') {
        if (typeof v === 'number') out = excelPct ? Number((v * 100).toPrecision(12)) : v
        else if (typeof v === 'string') out = parseNumber(v, style)?.n ?? cellText(v)
        else out = cellText(v)
      } else if (type === 'date') {
        out = v instanceof Date ? dateIso(v) : typeof v === 'string' ? (parseDate(v) ?? cellText(v)) : cellText(v)
      } else out = v instanceof Date ? dateIso(v) : typeof v === 'number' ? v : cellText(v)
      values[i][j] = out
    })
    columns.push({ name, label, type, percent })
  })
  if (h < 0) notes.push({ text: 'Không tìm thấy dòng tiêu đề — cột được đặt tên Cột 1, Cột 2…' })
  return { sheet: sheet.name, columns, rows: values, truncated, notes }
}

export async function loadDataFile(file: string): Promise<LoadedTable[]> {
  const sheets = await readSheets(file)
  const tables = sheets.map(toTable).filter((t): t is LoadedTable => !!t)
  if (!tables.length) throw new Error(`File ${basename(file)} không có dữ liệu dạng bảng`)
  return tables
}
