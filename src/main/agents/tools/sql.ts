import { translate } from '@shared/i18n'
import { runQuery } from '../../datachat/session'
import type { AgentTool } from '../base'
import { TOOL_NAME } from '../constants'
import { cut, queryResultText, type DataAgentState } from './dataShared'

// Chạy một truy vấn SQLite chỉ-đọc trên các bảng đã nạp; kết quả (≤ 50 dòng) hoặc lỗi SQL gửi lại cho AI
export const runSqlTool: AgentTool<DataAgentState> = {
  name: TOOL_NAME.runSql,
  description:
    'Chạy MỘT câu SQLite chỉ-đọc (SELECT / WITH) trên các bảng dữ liệu đã nạp và trả về kết quả (tối đa 50 dòng) hoặc thông báo lỗi. ' +
    'Mọi con số trong câu trả lời phải lấy từ công cụ này.',
  parameters: {
    type: 'object',
    properties: {
      sql: { type: 'string', description: 'Câu SELECT / WITH. Tên bảng và tên cột trong ngoặc kép, vd SELECT SUM("so_tien") FROM "doanh_thu".' },
      purpose: { type: 'string', description: 'Truy vấn này tính gì (ngắn gọn, theo ngôn ngữ người hỏi) — hiển thị cho người dùng.' }
    },
    required: ['sql', 'purpose']
  },
  execute: (args, ctx) => {
    const sql = String(args.sql ?? '').trim()
    const purpose = String(args.purpose ?? '').trim()
    if (!sql) return 'LỖI: thiếu tham số "sql".'
    ctx.onStep?.(translate(ctx.lang, 'Đang chạy truy vấn: {p}', { p: purpose || cut(sql.replace(/\s+/g, ' '), 80) }))
    const res = runQuery(ctx.userId, sql, purpose)
    ctx.state.queries.push(res)
    return queryResultText(res)
  }
}
