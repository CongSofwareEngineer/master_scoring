// SQLite (sql.js / WebAssembly — không cần native module, build Windows từ máy nào cũng được).
// DB nằm trong RAM, được ghi xuống data\app.db (ghi nguyên tử, debounce) sau mỗi thay đổi.
import initSqlJs, { type Database, type SqlValue } from 'sql.js'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { paths } from './paths'

let db: Database
let saveTimer: NodeJS.Timeout | null = null
let dirty = false

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  default_pw INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS settings (
  user_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);
CREATE TABLE IF NOT EXISTS secrets (
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (user_id, name)
);
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE TABLE IF NOT EXISTS rubric_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  rubric TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL,
  mssv TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  zip_path TEXT NOT NULL DEFAULT '',
  zip_mtime INTEGER NOT NULL DEFAULT 0,
  scan_status TEXT NOT NULL,
  scan_note TEXT NOT NULL DEFAULT '',
  alt_files TEXT NOT NULL DEFAULT '[]',
  ord INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_students_assignment ON students(assignment_id);
CREATE TABLE IF NOT EXISTS results (
  student_id INTEGER PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  backend TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  total REAL,
  criteria TEXT NOT NULL DEFAULT '[]',
  issues TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL DEFAULT '',
  auto TEXT NOT NULL DEFAULT '{}',
  ai_signal TEXT,
  ai_penalty TEXT,
  ai_questions TEXT,
  overrides TEXT NOT NULL DEFAULT '{}',
  teacher_note TEXT NOT NULL DEFAULT '',
  reviewed INTEGER NOT NULL DEFAULT 0,
  error TEXT NOT NULL DEFAULT '',
  detected_profile TEXT NOT NULL DEFAULT '',
  warnings TEXT NOT NULL DEFAULT '[]',
  fingerprint TEXT,
  started_at TEXT,
  finished_at TEXT,
  duration_ms INTEGER
);
CREATE TABLE IF NOT EXISTS integrity_pairs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL,
  a_id INTEGER NOT NULL,
  b_id INTEGER NOT NULL,
  similarity REAL NOT NULL,
  matches TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_pairs_assignment ON integrity_pairs(assignment_id);
CREATE TABLE IF NOT EXISTS netlog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  url TEXT NOT NULL,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT ''
);
`

export async function openDb(): Promise<void> {
  const wasmBinary = readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'))
  const SQL = await initSqlJs({ wasmBinary: wasmBinary.buffer.slice(wasmBinary.byteOffset, wasmBinary.byteOffset + wasmBinary.byteLength) as ArrayBuffer })
  if (existsSync(paths.db)) {
    db = new SQL.Database(readFileSync(paths.db))
  } else {
    db = new SQL.Database()
  }
  db.run('PRAGMA foreign_keys = OFF;')
  db.exec(SCHEMA)
  migrate()
  flush()
}

// Nâng cấp schema cho database tạo từ phiên bản cũ
function migrate(): void {
  const cols = db.exec("PRAGMA table_info(users)")[0]?.values.map((v) => v[1]) ?? []
  if (!cols.includes('default_pw')) db.run('ALTER TABLE users ADD COLUMN default_pw INTEGER NOT NULL DEFAULT 0')
  const rcols = db.exec('PRAGMA table_info(results)')[0]?.values.map((v) => v[1]) ?? []
  if (!rcols.includes('ai_penalty')) db.run('ALTER TABLE results ADD COLUMN ai_penalty TEXT')
  if (!rcols.includes('ai_questions')) db.run('ALTER TABLE results ADD COLUMN ai_questions TEXT')
}

export async function reopenDbFrom(buffer: Buffer): Promise<void> {
  const wasmBinary = readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'))
  const SQL = await initSqlJs({ wasmBinary: wasmBinary.buffer.slice(wasmBinary.byteOffset, wasmBinary.byteOffset + wasmBinary.byteLength) as ArrayBuffer })
  const next = new SQL.Database(buffer)
  next.exec(SCHEMA)
  db.close()
  db = next
  migrate()
  dirty = true
  flush()
}

function scheduleSave(): void {
  dirty = true
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    flush()
  }, 400)
}

export function flush(): void {
  if (!db) return
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  const data = db.export()
  const tmp = paths.db + '.tmp'
  writeFileSync(tmp, Buffer.from(data))
  renameSync(tmp, paths.db)
  dirty = false
}

export function isDirty(): boolean {
  return dirty
}

type Params = SqlValue[] | Record<string, SqlValue>

export function run(sql: string, params: Params = []): { lastId: number; changes: number } {
  db.run(sql, params as any)
  const lastId = (db.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0] as number) ?? 0
  const changes = db.getRowsModified()
  scheduleSave()
  return { lastId, changes }
}

export function all<T = any>(sql: string, params: Params = []): T[] {
  const stmt = db.prepare(sql)
  try {
    stmt.bind(params as any)
    const rows: T[] = []
    while (stmt.step()) rows.push(stmt.getAsObject() as T)
    return rows
  } finally {
    stmt.free()
  }
}

export function get<T = any>(sql: string, params: Params = []): T | undefined {
  return all<T>(sql, params)[0]
}

export function transaction<T>(fn: () => T): T {
  db.run('BEGIN')
  try {
    const r = fn()
    db.run('COMMIT')
    scheduleSave()
    return r
  } catch (e) {
    db.run('ROLLBACK')
    throw e
  }
}

export function exportDb(): Buffer {
  return Buffer.from(db.export())
}

export function nowIso(): string {
  return new Date().toISOString()
}
