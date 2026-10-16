// Trạng thái + hàm định dạng dùng chung của các công cụ dữ liệu (run_sql, draw_chart) và prompt agent dữ liệu.
import type { Database } from 'sql.js'
import type { DataChart, DataQuery, DataTable } from '@shared/types'
import { q, round } from '../../datachat/session'

// `state` của agent dữ liệu trong một câu hỏi: dữ liệu đầu vào + những gì công cụ đã tạo (để lưu vào lượt trả lời)
export interface DataAgentState {
  tables: DataTable[]
  samples: Map<string, string>
  queries: DataQuery[]
  charts: DataChart[]
  // Đã cảnh báo 1 lần biểu đồ toàn số 0 (lần sau chấp nhận)
  zeroChecked: boolean
}

export const SAMPLE_ROWS = 8
export const PROMPT_RESULT_ROWS = 50
export const MAX_CHARTS = 3

export const cut = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + '…' : s)

function fmtCell(v: string | number | null): string {
  if (v === null) return ''
  return cut(String(v), 60).replace(/\|/g, '/').replace(/\s+/g, ' ')
}

export function rowsToText(columns: string[], rows: (string | number | null)[][]): string {
  return [columns.join(' | '), ...rows.map((r) => r.map(fmtCell).join(' | '))].join('\n')
}

export function sampleRows(db: Database, t: DataTable): string {
  const res = db.exec(`SELECT * FROM ${q(t.name)} LIMIT ${SAMPLE_ROWS}`)[0]
  if (!res) return ''
  return rowsToText(
    res.columns,
    res.values.map((r) => r.map((v) => (v instanceof Uint8Array ? '[blob]' : typeof v === 'number' ? round(v) : v)))
  )
}

// Kết quả truy vấn → nội dung lượt 'tool' gửi lại AI
export function queryResultText(r: DataQuery, limit = PROMPT_RESULT_ROWS): string {
  if (r.error) return `LỖI SQL: ${r.error}\nHãy sửa truy vấn (kiểm tra tên bảng / cột trong ngoặc kép) rồi gọi lại, hoặc trả lời nếu đã đủ dữ liệu.`
  if (!r.total) return 'KẾT QUẢ: 0 dòng (không có dữ liệu khớp điều kiện).'
  const shown = r.rows.slice(0, limit)
  const more = r.total > shown.length ? `\n(… còn ${r.total - shown.length} dòng nữa không hiển thị; tổng ${r.total} dòng)` : ''
  return `KẾT QUẢ (${r.total} dòng):\n${rowsToText(r.columns, shown)}${more}`
}
