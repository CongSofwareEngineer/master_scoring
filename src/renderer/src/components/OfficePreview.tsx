// Xem trước file Office (Word .docx / Excel .xlsx) trong Code Review — hiển thị gần giống Office
// thay vì văn bản thuần. Chỉ dùng cho định dạng OOXML mới; file cũ (.doc/.xls nhị phân) sẽ báo lỗi và
// giáo viên xem ở chế độ Văn bản. Word render bằng docx-preview, Excel đọc bằng exceljs rồi dựng bảng
// bằng React (an toàn với nội dung sinh viên vì React tự escape text, không dùng innerHTML).
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Workbook } from 'exceljs'
import type { Border, Cell, FillPattern, Worksheet } from 'exceljs'
import { renderAsync } from 'docx-preview'
import { useT } from '../lib/i18n'

export type OfficeKind = 'word' | 'excel'

// Nhận diện file Office mới theo đuôi (đuôi .doc/.xls vẫn thử được vì có thể là OOXML đổi tên).
export function officeKind(path: string): OfficeKind | null {
  const p = path.toLowerCase()
  if (/\.docx?$/.test(p)) return 'word'
  if (/\.xlsx?$/.test(p)) return 'excel'
  return null
}

export function OfficePreview(props: { path: string; kind: OfficeKind; data: Uint8Array }): JSX.Element {
  if (props.kind === 'word') return <WordPreview key={props.path} data={props.data} />
  return <ExcelPreview key={props.path} data={props.data} />
}

// ───────────────────────── Word (.docx) ─────────────────────────

function WordPreview(props: { data: Uint8Array }): JSX.Element {
  const t = useT()
  const host = useRef<HTMLDivElement>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const el = host.current
    if (!el) return
    let alive = true
    el.innerHTML = ''
    setError(false)
    setLoading(true)
    const data = props.data.buffer.slice(props.data.byteOffset, props.data.byteOffset + props.data.byteLength)
    renderAsync(data, el, undefined, {
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true
    })
      .then(() => alive && setLoading(false))
      .catch((e: any) => {
        if (!alive) return
        setLoading(false)
        setError(true)
        if (e) console.warn('docx-preview:', e)
      })
    return () => {
      alive = false
    }
  }, [props.data])

  return (
    <div className="office-scroll">
      {loading && <div className="office-status">{t('Đang dựng bản xem trước…')}</div>}
      {error && <div className="callout warning office-status">{t('Không xem trước được file này (có thể là định dạng .doc cũ hoặc file hỏng). Hãy dùng chế độ Văn bản.')}</div>}
      <div ref={host} className="office-doc" />
    </div>
  )
}

// ───────────────────────── Excel (.xlsx) ─────────────────────────

const MAX_ROWS = 2000
const MAX_COLS = 100

interface XCell {
  text: string
  colSpan: number
  rowSpan: number
  style: CSSProperties
}
interface XSheet {
  name: string
  cols: number[]
  rows: { cells: XCell[]; height?: number }[]
  truncated: boolean
}

function argbHex(color: unknown): string | undefined {
  const argb = (color as { argb?: unknown })?.argb
  if (typeof argb !== 'string' || argb.length !== 8) return undefined
  const a = parseInt(argb.slice(0, 2), 16)
  if (a === 0) return undefined
  return '#' + argb.slice(2).toLowerCase()
}

function borderCss(b: Partial<Border> | undefined): string | undefined {
  if (!b || !b.style) return undefined
  const width = b.style === 'thick' ? 3 : b.style === 'medium' ? 2 : 1
  const color = argbHex(b.color) ?? '#c9ced6'
  return `${width}px ${b.style.includes('dash') ? 'dashed' : b.style === 'dotted' ? 'dotted' : 'solid'} ${color}`
}

function cellStyle(cell: Cell): CSSProperties {
  const s: CSSProperties = {}
  const f = cell.font
  if (f) {
    if (f.bold) s.fontWeight = 'bold'
    if (f.italic) s.fontStyle = 'italic'
    if (f.underline) s.textDecoration = 'underline'
    if (typeof f.size === 'number') s.fontSize = `${f.size}pt`
    if (f.name) s.fontFamily = f.name
    const color = argbHex(f.color)
    if (color) s.color = color
  }
  const fill = cell.fill as FillPattern | undefined
  if (fill && fill.type === 'pattern' && fill.pattern === 'solid') {
    const bg = argbHex(fill.fgColor)
    if (bg) s.backgroundColor = bg
  }
  const a = cell.alignment
  if (a) {
    if (a.horizontal) s.textAlign = a.horizontal as CSSProperties['textAlign']
    if (a.vertical) s.verticalAlign = a.vertical === 'middle' ? 'middle' : a.vertical
    if (a.wrapText) s.whiteSpace = 'pre-wrap'
  }
  const b = cell.border
  if (b) {
    const top = borderCss(b.top)
    const right = borderCss(b.right)
    const bottom = borderCss(b.bottom)
    const left = borderCss(b.left)
    if (top) s.borderTop = top
    if (right) s.borderRight = right
    if (bottom) s.borderBottom = bottom
    if (left) s.borderLeft = left
  }
  return s
}

// Kích thước vùng gộp của ô gốc (ô không phải gốc trả về span 0 → bị bỏ khỏi bảng).
// So sánh master theo địa chỉ (không theo tham chiếu object) cho chắc chắn.
function mergeSpan(ws: Worksheet, cell: Cell, maxRow: number, maxCol: number): { colSpan: number; rowSpan: number } {
  if (!cell.isMerged) return { colSpan: 1, rowSpan: 1 }
  const master = cell.master
  if (master.fullAddress.row !== cell.fullAddress.row || master.fullAddress.col !== cell.fullAddress.col) return { colSpan: 0, rowSpan: 0 }
  const isSameMerge = (c: Cell): boolean => c.isMerged && c.master.fullAddress.row === master.fullAddress.row && c.master.fullAddress.col === master.fullAddress.col
  const { row, col } = cell.fullAddress
  let colSpan = 1
  while (col + colSpan <= maxCol && isSameMerge(ws.getCell(row, col + colSpan))) colSpan++
  let rowSpan = 1
  while (row + rowSpan <= maxRow && isSameMerge(ws.getCell(row + rowSpan, col))) rowSpan++
  return { colSpan, rowSpan }
}

// ── Định dạng giá trị theo numFmt (exceljs không tự áp dụng khi đọc) ──

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3))

function formatDate(d: Date, fmt: string): string {
  const pad = (n: number, l = 2): string => String(n).padStart(l, '0')
  const day = d.getDate()
  const mon = d.getMonth() + 1
  const year = d.getFullYear()
  const h24 = d.getHours()
  const mi = d.getMinutes()
  const se = d.getSeconds()
  const f = fmt.replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '').replace(/\\./g, '')
  const hour12 = /AM\/PM|A\/P/i.test(f)
  const h = hour12 ? h24 % 12 || 12 : h24
  let out = ''
  let i = 0
  let prev: string | null = null
  while (i < f.length) {
    const rest = f.slice(i)
    let token: string
    if (/^AM\/PM/i.test(rest)) {
      token = 'AM/PM'
      i += 5
    } else if (/^A\/P/i.test(rest)) {
      token = 'A/P'
      i += 3
    } else if (/^yyyy/i.test(rest)) (token = 'yyyy'), (i += 4)
    else if (/^yy/i.test(rest)) (token = 'yy'), (i += 2)
    else if (/^mmmm/i.test(rest)) (token = 'mmmm'), (i += 4)
    else if (/^mmm/i.test(rest)) (token = 'mmm'), (i += 3)
    else if (/^mm/i.test(rest)) (token = 'mm'), (i += 2)
    else if (/^m/i.test(rest)) (token = 'm'), (i += 1)
    else if (/^dd/i.test(rest)) (token = 'dd'), (i += 2)
    else if (/^d/i.test(rest)) (token = 'd'), (i += 1)
    else if (/^hh/i.test(rest)) (token = 'hh'), (i += 2)
    else if (/^h/i.test(rest)) (token = 'h'), (i += 1)
    else if (/^ss/i.test(rest)) (token = 'ss'), (i += 2)
    else if (/^s/i.test(rest)) (token = 's'), (i += 1)
    else {
      out += f[i]
      i += 1
      continue
    }
    const isMinute = (token === 'm' || token === 'mm') && (prev === 'h' || prev === 'hh' || /^[:.]/.test(f.slice(i)))
    switch (token) {
      case 'yyyy':
        out += year
        break
      case 'yy':
        out += pad(year % 100)
        break
      case 'mmmm':
        out += MONTHS[mon - 1]
        break
      case 'mmm':
        out += MONTHS_SHORT[mon - 1]
        break
      case 'mm':
        out += isMinute ? pad(mi) : pad(mon)
        break
      case 'm':
        out += isMinute ? mi : mon
        break
      case 'dd':
        out += pad(day)
        break
      case 'd':
        out += day
        break
      case 'hh':
        out += pad(h)
        break
      case 'h':
        out += h
        break
      case 'ss':
        out += pad(se)
        break
      case 's':
        out += se
        break
      case 'AM/PM':
        out += h24 < 12 ? 'AM' : 'PM'
        break
      case 'A/P':
        out += h24 < 12 ? 'A' : 'P'
        break
      default:
        out += token
    }
    prev = token
  }
  return out
}

function formatNumber(n: number, fmt: string): string {
  const section = fmt.split(';')[0]
  const percent = section.includes('%')
  const x = percent ? n * 100 : n
  const decPart = section.match(/\.([0#]+)/)?.[1]
  const minDec = decPart ? (decPart.match(/0/g) ?? []).length : 0
  const maxDec = decPart ? decPart.length : 0
  const grouped = /[0#],[0#]/.test(section)
  let out = x.toLocaleString('en-US', { minimumFractionDigits: minDec, maximumFractionDigits: maxDec, useGrouping: grouped })
  if (percent) out += '%'
  return out
}

function displayText(cell: Cell): string {
  const raw = cell.value as unknown
  const value = raw && typeof raw === 'object' && 'result' in raw ? (raw as { result?: unknown }).result : raw
  const fmt = cell.numFmt
  if (value instanceof Date) return formatDate(value, fmt || 'dd/mm/yyyy')
  if (typeof value === 'number' && fmt && fmt !== 'General' && !fmt.includes('@')) return formatNumber(value, fmt)
  return cell.text ?? ''
}

async function parseWorkbook(data: Uint8Array): Promise<XSheet[]> {
  const wb = new Workbook()
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  await wb.xlsx.load(buf as any)
  const sheets: XSheet[] = []
  wb.worksheets.forEach((ws) => {
    const maxCol = Math.min(Math.max(ws.columnCount, 1), MAX_COLS)
    const maxRow = Math.min(Math.max(ws.rowCount, 1), MAX_ROWS)
    const cols: number[] = []
    for (let c = 1; c <= maxCol; c++) {
      const w = ws.getColumn(c).width
      cols.push(w ? Math.round(w * 7 + 5) : 80)
    }
    const rows: XSheet['rows'] = []
    for (let r = 1; r <= maxRow; r++) {
      const row = ws.getRow(r)
      const cells: XCell[] = []
      for (let c = 1; c <= maxCol; c++) {
        const cell = row.getCell(c)
        const span = mergeSpan(ws, cell, maxRow, maxCol)
        if (span.colSpan === 0) continue
        cells.push({ text: displayText(cell), colSpan: span.colSpan, rowSpan: span.rowSpan, style: cellStyle(cell) })
      }
      const height = row.height ? Math.round(row.height * 1.333) : undefined
      rows.push({ cells, height })
    }
    sheets.push({ name: ws.name, cols, rows, truncated: ws.rowCount > MAX_ROWS || ws.columnCount > MAX_COLS })
  })
  return sheets
}

function ExcelPreview(props: { data: Uint8Array }): JSX.Element {
  const t = useT()
  const [sheets, setSheets] = useState<XSheet[]>([])
  const [active, setActive] = useState(0)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setError(false)
    setLoading(true)
    parseWorkbook(props.data)
      .then((s) => {
        if (!alive) return
        setSheets(s)
        setActive(0)
        setLoading(false)
      })
      .catch((e: any) => {
        if (!alive) return
        setLoading(false)
        setError(true)
        console.warn('exceljs:', e)
      })
    return () => {
      alive = false
    }
  }, [props.data])

  if (loading) return <div className="office-status">{t('Đang dựng bản xem trước…')}</div>
  if (error) return <div className="callout warning office-status">{t('Không xem trước được file Excel này (có thể là định dạng .xls cũ hoặc file hỏng). Hãy dùng chế độ Văn bản.')}</div>
  const sheet = sheets[active]
  if (!sheet) return <div className="office-status">{t('File không có sheet nào.')}</div>

  return (
    <div className="office-xlsx">
      {sheets.length > 1 && (
        <div className="xlsx-tabs">
          {sheets.map((s, i) => (
            <button key={i} className={i === active ? 'xlsx-tab active' : 'xlsx-tab'} onClick={() => setActive(i)}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="office-scroll">
        <table className="xlsx-table">
          <colgroup>
            {sheet.cols.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <tbody>
            {sheet.rows.map((row, r) => (
              <tr key={r} style={row.height ? { height: row.height } : undefined}>
                {row.cells.map((cell, c) => (
                  <td key={c} colSpan={cell.colSpan > 1 ? cell.colSpan : undefined} rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined} style={cell.style}>
                    {cell.text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sheet.truncated && <div className="office-status meta">{t('File lớn — chỉ hiển thị {rows} hàng × {cols} cột đầu.', { rows: MAX_ROWS, cols: MAX_COLS })}</div>}
    </div>
  )
}
