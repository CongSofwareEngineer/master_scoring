// Agent kế toán của Trợ lý dữ liệu: trả lời câu hỏi về file Excel / CSV đã nạp. Mọi con số lấy từ run_sql,
// biểu đồ vẽ bằng draw_chart; khi đủ số liệu thì trả lời bằng Markdown.
import { translate } from '@shared/i18n'
import type { DataTable, Lang } from '@shared/types'
import { q } from '../../datachat/session'
import type { AgentContext, AgentDefinition } from '../base'
import { AGENT_NAME, TOOL_NAME } from '../constants'
import { drawChartTool, runSqlTool, type DataAgentState } from '../tools'
import { cut } from '../tools/dataShared'

const SCHEMA_CHAR_BUDGET = 18_000

// Mô tả gọn từng cột (chú giải các khoá đầy= / khác= ở đầu phần DỮ LIỆU của prompt)
function describeTable(t: DataTable, sample: string): string {
  const cols = t.columns.map((c) => {
    const parts = [`${q(c.name)} ${c.type}${c.percent ? ' (%)' : ''} "${c.label}"`, `đầy=${c.filled}`, `khác=${c.distinct}`]
    if (c.type === 'number' && c.sum !== undefined) parts.push(`tổng=${c.sum}, TB=${c.avg}, min=${c.min}, max=${c.max}`)
    if (c.type === 'date' && c.min !== undefined) parts.push(`${c.min} → ${c.max}`)
    if (c.top?.length) parts.push('hay gặp: ' + c.top.slice(0, 6).map((x) => `${cut(x.value, 30)} (${x.count})`).join(', '))
    return '- ' + parts.join('; ')
  })
  const notes = t.notes.map((n) => '! ' + translate('vi', n.text, n.vars))
  return [`Bảng ${q(t.name)} — ${t.label} — ${t.rowCount} dòng${t.truncated ? ' (đã cắt bớt)' : ''}`, ...cols, ...notes, sample ? `Dòng mẫu:\n${sample}` : ''].filter(Boolean).join('\n')
}

// Prompt chỉ giữ vai trò + quy tắc SQL / trả lời; hướng dẫn chọn loại biểu đồ nằm ở mô tả công cụ draw_chart (tools/chart.ts)
function buildSystemPrompt(tables: DataTable[], samples: Map<string, string>, lang: Lang): string {
  let schema = tables.map((t) => describeTable(t, samples.get(t.name) ?? '')).join('\n\n')
  if (schema.length > SCHEMA_CHAR_BUDGET) schema = tables.map((t) => describeTable(t, '')).join('\n\n')
  schema = cut(schema, SCHEMA_CHAR_BUDGET * 1.5)
  const langRule =
    lang === 'en'
      ? 'Write the answer in English; numbers like 1,234,567.5.'
      : 'Trả lời bằng tiếng Việt; số dạng 1.234.567,5.'
  const sql = TOOL_NAME.runSql
  const chart = TOOL_NAME.drawChart
  return `Bạn là kế toán trưởng / chuyên viên phân tích tài chính, chính xác tuyệt đối với số liệu. Admin hỏi về các file Excel / CSV đã nạp vào SQLite (mô tả ở cuối).

CÔNG CỤ
- Cần số liệu → ${sql} (gộp nhiều chỉ số vào một truy vấn để tiết kiệm lượt). Cần trực quan → ${chart}.
- Đủ số liệu → trả lời thẳng bằng Markdown, không gọi thêm công cụ. Câu hỏi không liên quan dữ liệu → trả lời ngắn, không gọi công cụ.

SQL (SQLite)
- Một câu SELECT / WITH. Tên bảng / cột trong NGOẶC KÉP, đúng tên đã cho ("so_tien"). Nháy đơn chỉ cho giá trị chữ ('so_tien' là chuỗi → AVG = 0).
- Mọi con số lấy từ truy vấn trên toàn bảng, không nhẩm trên dòng mẫu.
- Cột date lưu 'YYYY-MM-DD' (theo tháng: strftime('%Y-%m', "cot")). Cột (%) lưu số phần trăm (15% → 15). Lọc chữ: LOWER("cot") LIKE '%abc%'. Số lẻ: ROUND(x, 2).
- Gặp LỖI SQL → sửa rồi gọi lại.

TRẢ LỜI — báo cáo đầy đủ của kế toán trưởng, không cụt một câu
- ${langRule}
- Chia mục ### (bỏ mục không áp dụng):
  1. Kết luận chính — con số trả lời trực tiếp, in đậm.
  2. Chi tiết số liệu — tổng, TB, min / max, số dòng, tỉ trọng %, chênh lệch tuyệt đối và %; nhiều dòng → bảng Markdown ≤ 20 dòng.
  3. Phân tích — so sánh nhóm, xu hướng, bất thường, mức tập trung (vd top 3 chiếm bao nhiêu %), ý nghĩa kinh doanh / kế toán.
  4. Cách tính — bảng / cột, công thức, điều kiện lọc, giả định (câu hỏi mơ hồ → chọn cột hợp lý nhất, ghi rõ).
  5. Cảnh báo — ô trống, số âm bất thường, trùng lặp, dữ liệu bị cắt bớt.
  6. Gợi ý — 1–3 câu hỏi tiếp theo.
- Chạy thêm truy vấn phụ khi cần số cho phần phân tích. Trung bình %: nói rõ trung bình cộng hay gia quyền (có cơ sở thì đưa cả hai).
- Không bịa số ngoài kết quả công cụ.

BIỂU ĐỒ
- Vẽ khi người hỏi muốn xem trực quan, hoặc khi so sánh nhóm / xu hướng / tỉ trọng (có thể 2–3 biểu đồ bổ sung nhau). Không vẽ khi kết quả chỉ 1 con số. Người hỏi chỉ định loại → dùng đúng loại.
- Có biểu đồ vẫn phân tích đầy đủ nhưng không lặp lại cả bảng số liệu.
- Lịch sử có "[Biểu đồ đã vẽ: …]" và người hỏi muốn đổi → gọi lại ${chart} (cùng title) với loại mới.

DỮ LIỆU (mỗi cột: tên kiểu "tiêu đề gốc"; đầy = số ô có dữ liệu; khác = số giá trị khác nhau; thống kê; giá trị hay gặp)
${schema || '(chưa có bảng nào)'}`
}

export const dataAnalystAgent: AgentDefinition<DataAgentState> = {
  name: AGENT_NAME.dataAnalyst,
  description: 'Kế toán trưởng: trả lời câu hỏi về dữ liệu Excel / CSV đã nạp bằng SQL chỉ-đọc, kèm biểu đồ.',
  systemPrompt: (ctx: AgentContext<DataAgentState>) => buildSystemPrompt(ctx.state.tables, ctx.state.samples, ctx.lang),
  tools: [runSqlTool, drawChartTool],
  // 6 vòng gọi công cụ (mỗi vòng có thể gồm nhiều lần gọi), vòng thứ 7 bắt buộc trả lời
  maxToolRounds: 6,
  // Câu trả lời dạng báo cáo dài không bị cắt
  maxTokens: 4096
}
