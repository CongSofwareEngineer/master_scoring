// Trợ lý dữ liệu: phiên làm việc theo giáo viên (trong RAM). Mỗi phiên có 1 DB sql.js riêng chứa bảng từ các file
// đã mở — tách hẳn khỏi app.db, không ghi xuống đĩa. AI chỉ được chạy SQL chỉ-đọc trên DB này.
import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from 'sql.js'
import { readFileSync } from 'fs'
import { basename } from 'path'
import type { DataChatState, DataChatTurn, DataColumn, DataFile, DataPreview, DataQuery, DataTable } from '@shared/types'
import { loadDataFile, norm, parseNumber, slug, uniqueName, type Value } from './load'

interface Session {
  db: Database
  files: DataFile[]
  history: DataChatTurn[]
  abort: AbortController | null
}

const sessions = new Map<number, Session>()
let SQL: SqlJsStatic | null = null

async function sqlJs(): Promise<SqlJsStatic> {
  if (!SQL) {
    const wasm = readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'))
    SQL = await initSqlJs({ wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer })
  }
  return SQL
}

export async function getSession(userId: number): Promise<Session> {
  let s = sessions.get(userId)
  if (!s) {
    const db = new (await sqlJs()).Database()
    // Tìm kiếm không phân biệt hoa thường / có dấu: unaccent('Công ty') = 'cong ty'
    db.create_function('unaccent', (v: SqlValue) => (v == null ? null : norm(String(v))))
    s = { db, files: [], history: [], abort: null }
    sessions.set(userId, s)
  }
  return s
}

export function peekSession(userId: number): Session | undefined {
  return sessions.get(userId)
}

export function sessionState(userId: number): DataChatState {
  const s = sessions.get(userId)
  return { files: s?.files ?? [], history: s?.history ?? [], busy: !!s?.abort }
}

export function closeSession(userId: number): void {
  const s = sessions.get(userId)
  if (!s) return
  s.abort?.abort()
  s.db.close()
  sessions.delete(userId)
}

export const q = (id: string): string => '"' + id.replace(/"/g, '""') + '"'

export const round = (n: number): number => (Number.isInteger(n) ? n : Number(n.toPrecision(12)))

function cellOut(v: SqlValue): string | number | null {
  if (v instanceof Uint8Array) return '[blob]'
  if (typeof v === 'number') return round(v)
  return v
}

function columnStats(db: Database, table: string, name: string, label: string, type: DataColumn['type'], percent: boolean): DataColumn {
  const t = q(table)
  const c = q(name)
  const one = (sql: string): SqlValue[] => db.exec(sql)[0]?.values[0] ?? []
  const [filled, distinct] = one(`SELECT COUNT(${c}), COUNT(DISTINCT ${c}) FROM ${t}`) as number[]
  const col: DataColumn = { name, label, type, percent, filled, distinct }
  if (type === 'number') {
    const [sum, avg, min, max] = one(`SELECT SUM(${c}), AVG(${c}), MIN(${c}), MAX(${c}) FROM ${t} WHERE typeof(${c}) IN ('integer','real')`)
    if (typeof sum === 'number') Object.assign(col, { sum: round(sum), avg: round(avg as number), min: round(min as number), max: round(max as number) })
  } else if (type === 'date') {
    const [min, max] = one(`SELECT MIN(${c}), MAX(${c}) FROM ${t}`)
    if (min != null) Object.assign(col, { min: String(min), max: String(max) })
  }
  if (type === 'text' || distinct <= 12) {
    const res = db.exec(`SELECT ${c}, COUNT(*) AS n FROM ${t} WHERE ${c} IS NOT NULL GROUP BY ${c} ORDER BY n DESC LIMIT 8`)[0]
    col.top = (res?.values ?? []).map(([v, n]) => ({ value: String(v), count: Number(n) }))
  }
  return col
}

export async function openFiles(userId: number, paths: string[]): Promise<{ state: DataChatState; errors: string[] }> {
  const s = await getSession(userId)
  const errors: string[] = []
  const used = new Set(s.files.flatMap((f) => f.tables.map((t) => t.name)))
  for (const path of paths) {
    const created: string[] = []
    try {
      const loaded = await loadDataFile(path)
      const fileBase = basename(path).replace(/\.[^.]+$/, '')
      const tables: DataTable[] = []
      for (const lt of loaded) {
        // 1 sheet / CSV → tên theo file; nhiều sheet → tên theo sheet
        const name = uniqueName(slug(loaded.length > 1 ? lt.sheet : fileBase, 'bang'), used)
        const cols = lt.columns.map((c) => `${q(c.name)} ${c.type === 'number' ? 'REAL' : 'TEXT'}`)
        s.db.run(`CREATE TABLE ${q(name)} (${cols.join(', ')})`)
        created.push(name)
        s.db.run('BEGIN')
        const stmt = s.db.prepare(`INSERT INTO ${q(name)} VALUES (${lt.columns.map(() => '?').join(', ')})`)
        try {
          for (const r of lt.rows) stmt.run(r as Value[])
        } finally {
          stmt.free()
          s.db.run('COMMIT')
        }
        tables.push({
          name,
          label: loaded.length > 1 ? `${basename(path)} › ${lt.sheet}` : basename(path),
          rowCount: lt.rows.length,
          truncated: lt.truncated,
          columns: lt.columns.map((c) => columnStats(s.db, name, c.name, c.label, c.type, c.percent)),
          notes: lt.notes
        })
      }
      s.files.push({ id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: basename(path), path, tables })
    } catch (e: any) {
      // File lỗi giữa chừng → bỏ các bảng đã tạo của file đó
      for (const name of created) s.db.run(`DROP TABLE IF EXISTS ${q(name)}`)
      for (const name of created) used.delete(name)
      errors.push(`${basename(path)}: ${e?.message ?? String(e)}`)
    }
  }
  if (errors.length === paths.length) throw new Error(errors.join('\n'))
  return { state: sessionState(userId), errors }
}

export function removeFile(userId: number, fileId: string): DataChatState {
  const s = sessions.get(userId)
  const f = s?.files.find((x) => x.id === fileId)
  if (s && f) {
    for (const t of f.tables) s.db.run(`DROP TABLE IF EXISTS ${q(t.name)}`)
    s.files = s.files.filter((x) => x !== f)
  }
  return sessionState(userId)
}

export function clearHistory(userId: number): DataChatState {
  const s = sessions.get(userId)
  if (s && !s.abort) s.history = []
  return sessionState(userId)
}

function findTable(s: Session, name: string): DataTable {
  const t = s.files.flatMap((f) => f.tables).find((x) => x.name === name)
  if (!t) throw new Error('Không tìm thấy bảng dữ liệu')
  return t
}

export interface PreviewQuery {
  search?: string
  column?: string // tên cột SQL; trống = mọi cột
}

// Xem trước dữ liệu, có lọc theo từ khoá. Số: gõ "1.500.000" / "1,500,000" / "1500000" đều khớp ô có giá trị đó.
export function preview(userId: number, table: string, offset: number, limit: number, query: PreviewQuery = {}): DataPreview {
  const s = sessions.get(userId)
  if (!s) throw new Error('Chưa mở file dữ liệu')
  const t = findTable(s, table)
  const lim = Math.max(1, Math.min(500, Math.floor(limit) || 100))
  const off = Math.max(0, Math.floor(offset) || 0)
  const term = String(query.search ?? '').trim().slice(0, 200)
  const cols = query.column ? t.columns.filter((c) => c.name === query.column) : t.columns
  if (query.column && !cols.length) throw new Error('Không tìm thấy cột')
  let where = ''
  const params: SqlValue[] = []
  if (term) {
    const like = '%' + norm(term).replace(/[\\%_]/g, (ch) => '\\' + ch) + '%'
    const nums = [parseNumber(term, 'vn')?.n, parseNumber(term, 'us')?.n].filter((n): n is number => n !== undefined)
    const conds: string[] = []
    for (const c of cols) {
      conds.push(`unaccent(${q(c.name)}) LIKE ? ESCAPE '\\'`)
      params.push(like)
      if (c.type === 'number') for (const n of new Set(nums)) {
        conds.push(`${q(c.name)} = ?`)
        params.push(n)
      }
    }
    where = conds.length ? ` WHERE ${conds.join(' OR ')}` : ' WHERE 0'
  }
  const total = term ? Number(s.db.exec(`SELECT COUNT(*) FROM ${q(t.name)}${where}`, params)[0]?.values[0]?.[0] ?? 0) : t.rowCount
  const res = s.db.exec(`SELECT rowid, * FROM ${q(t.name)}${where} ORDER BY rowid LIMIT ${lim} OFFSET ${off}`, params)[0]
  const values = res?.values ?? []
  return {
    columns: t.columns.map((c) => c.name),
    rows: values.map((r) => r.slice(1).map(cellOut)),
    rowIds: values.map((r) => Number(r[0])),
    total
  }
}

// Bỏ chuỗi '...' trước khi soát từ khoá cấm (tránh chặn nhầm giá trị như 'update')
const stripStrings = (sql: string): string => sql.replace(/'(?:[^']|'')*'/g, "''")

const FORBIDDEN = /\b(attach|detach|pragma|insert|update|delete|drop|alter|create|replace|vacuum|reindex|analyze|begin|commit|rollback|savepoint|release|load_extension)\b/i

export const QUERY_ROW_LIMIT = 200

// Hàm tính số: tham số luôn là cột / biểu thức, không phải giá trị chữ cần so sánh
const COL_FUNCS = 'sum|avg|min|max|total|count|round|abs|cast|group_concat'

/**
 * Model hay viết tên cột trong nháy đơn: AVG('eth') — với SQLite đó là chuỗi chữ → kết quả 0 / sai mà không báo lỗi.
 * Sửa 'cot' → "cot" khi chuỗi trùng tên cột và nằm ở vị trí chỉ có thể là cột: tham số hàm tính, GROUP BY, ORDER BY.
 * Chuỗi so sánh giá trị (WHERE token = 'eth') không bị đụng tới.
 */
export function fixQuotedColumns(sql: string, columns: string[]): string {
  const byLower = new Map(columns.map((c) => [c.toLowerCase(), c]))
  const fix = (m: string, pre: string, name: string): string => {
    const col = byLower.get(name.toLowerCase())
    return col ? `${pre}${q(col)}` : m
  }
  return sql
    .replace(new RegExp(`(\\b(?:${COL_FUNCS})\\s*\\(\\s*(?:distinct\\s+)?)'([^']+)'`, 'gi'), fix)
    .replace(/(\b(?:group|order)\s+by\s+(?:[^;]*?,\s*)?)'([^']+)'/gi, fix)
    .replace(/(\bstrftime\s*\(\s*'[^']*'\s*,\s*)'([^']+)'/gi, fix)
}

// Chuỗi '…' hoặc tên trong nháy kép "…" (nhóm 1)
const SQL_QUOTED = /'(?:[^']|'')*'|"((?:[^"]|"")*)"/g

// Tên trong nháy kép không khớp cột nào thì SQLite coi là chuỗi chữ: AVG("ETH") khi cột thật là "gia_eth" → 0, không báo lỗi.
// Chạy bản đổi "…" → […] (ngoặc vuông luôn là tên, không bao giờ thành chuỗi) để SQLite báo "no such column".
const bracketIdents = (sql: string): string =>
  sql.replace(SQL_QUOTED, (m, id?: string) => (id == null || id.includes(']') ? m : `[${id.replace(/""/g, '"')}]`))

const loose = (s: string): string => norm(s).replace(/[^a-z0-9]+/g, '')

/**
 * Prepare với kiểm tra tên cột: tên trong nháy kép không có thật → nếu trùng đúng 1 tiêu đề gốc (label, vd "Giá ETH")
 * thì đổi sang tên SQL của cột đó, không thì báo lỗi kèm danh sách cột để AI sửa (thay vì ra số 0).
 */
function prepareChecked(db: Database, sql: string, cols: DataColumn[]): { stmt: ReturnType<Database['prepare']>; sql: string } {
  for (let i = 0; ; i++) {
    try {
      return { stmt: db.prepare(bracketIdents(sql)), sql }
    } catch (e: any) {
      const m = /no such column: (.+)$/.exec(e?.message ?? '')
      if (!m || i >= 5) throw e
      const name = m[1].trim().replace(/^.*\./, '')
      const hits = cols.filter((c) => loose(c.label) === loose(name) || loose(c.name) === loose(name))
      const names = [...new Set(hits.map((c) => c.name))]
      let fixed = sql
      if (names.length === 1)
        // Không đổi alias (… AS "ETH")
        fixed = sql.replace(SQL_QUOTED, (t, id: string | undefined, at: number) =>
          id != null && id.replace(/""/g, '"') === name && !/\bas\s*$/i.test(sql.slice(0, at)) ? q(names[0]) : t
        )
      if (fixed === sql) {
        const list = [...new Set(cols.map((c) => (c.label && c.label !== c.name ? `"${c.name}" (${c.label})` : `"${c.name}"`)))]
        throw new Error(
          `Không có cột "${name}" (tên trong nháy kép phải là tên SQL của cột, nếu không SQLite coi là chuỗi chữ). ` +
            `Các cột: ${list.slice(0, 60).join(', ')}${list.length > 60 ? ', …' : ''}`
        )
      }
      sql = fixed
    }
  }
}

// Chạy 1 câu SELECT chỉ-đọc trên DB dữ liệu của phiên. Lỗi → trả về trong `error` để AI tự sửa.
export function runQuery(userId: number, sql: string, purpose: string): DataQuery {
  const s = sessions.get(userId)
  const out: DataQuery = { sql: sql.trim(), purpose, columns: [], rows: [], total: 0 }
  try {
    if (!s) throw new Error('Chưa mở file dữ liệu')
    const cols = s.files.flatMap((f) => f.tables.flatMap((t) => t.columns))
    const text = fixQuotedColumns(
      sql.trim().replace(/;+\s*$/, ''),
      cols.map((c) => c.name)
    )
    out.sql = text
    const bare = stripStrings(text)
    if (!/^(select|with)\b/i.test(bare)) throw new Error('Chỉ được chạy câu lệnh SELECT')
    if (bare.includes(';')) throw new Error('Chỉ được chạy 1 câu lệnh mỗi lần')
    if (FORBIDDEN.test(bare)) throw new Error('Câu lệnh chứa từ khoá không được phép (chỉ đọc dữ liệu)')
    const checked = prepareChecked(s.db, text, cols)
    out.sql = checked.sql
    const stmt = checked.stmt
    try {
      out.columns = stmt.getColumnNames()
      while (stmt.step()) {
        out.total++
        if (out.rows.length < QUERY_ROW_LIMIT) out.rows.push(stmt.get().map(cellOut))
        if (out.total >= 100_000) break
      }
    } finally {
      stmt.free()
    }
  } catch (e: any) {
    out.error = e?.message ?? String(e)
  }
  return out
}

export function pushTurn(userId: number, turn: DataChatTurn): void {
  sessions.get(userId)?.history.push(turn)
}
