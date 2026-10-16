import { translate } from '@shared/i18n'
import type { DataChart, DataChartType } from '@shared/types'
import { runQuery } from '../../datachat/session'
import type { AgentTool } from '../base'
import { TOOL_NAME } from '../constants'
import { MAX_CHARTS, cut, queryResultText, type DataAgentState } from './dataShared'

export const CHART_TYPES: DataChartType[] = ['bar', 'hbar', 'stacked', 'hstacked', 'line', 'area', 'multiaxis', 'combo', 'pie', 'doughnut', 'polar', 'radar', 'scatter', 'bubble', 'table']
// Tên khác model hay dùng → loại của app
const CHART_ALIASES: Record<string, DataChartType> = {
  column: 'bar',
  vbar: 'bar',
  grouped: 'bar',
  horizontal: 'hbar',
  stacked_bar: 'stacked',
  donut: 'doughnut',
  polararea: 'polar',
  polar_area: 'polar',
  spider: 'radar',
  mixed: 'combo',
  multitype: 'combo',
  dual_axis: 'multiaxis'
}

function chartType(v: unknown): DataChartType {
  const k = String(v ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if ((CHART_TYPES as string[]).includes(k)) return k as DataChartType
  return CHART_ALIASES[k] ?? CHART_ALIASES[k.replace(/_/g, '')] ?? 'bar'
}

// Chạy SQL của biểu đồ; kết quả không vẽ được loại yêu cầu → hạ loại hoặc hiện dạng bảng
function buildChart(userId: number, type: DataChartType, title: string, sql: string): DataChart {
  const r = runQuery(userId, sql, title)
  const xy = type === 'scatter' || type === 'bubble'
  // 1 dòng nhiều cột số (SELECT AVG("eth") AS ETH, AVG("btc") AS BTC) → xoay thành mỗi cột 1 nhóm để vẽ được
  if (!r.error && type !== 'table' && !xy && r.total === 1) {
    const nums = r.columns.map((c, j) => ({ c, v: r.rows[0][j] })).filter((x) => typeof x.v === 'number')
    if (nums.length >= 2) {
      r.columns = ['', title || 'Giá trị']
      r.rows = nums.map((x) => [x.c, x.v])
      r.total = r.rows.length
    }
  }
  if (!r.error && type !== 'table') {
    const isNum = (j: number): boolean => r.rows.some((row) => typeof row[j] === 'number')
    const numCols = r.columns.filter((_, j) => j > 0 && isNum(j)).length
    if (xy) {
      // scatter cần 2 cột số (cột đầu là số cũng được tính là X), bubble cần 3
      const all = numCols + (isNum(0) ? 1 : 0)
      if (r.total < 2 || all < 2) type = 'table'
      else if (type === 'bubble' && all < 3) type = 'scatter'
    } else if (r.columns.length < 2 || !numCols || r.total < 2) type = 'table'
    else if (type === 'radar' && r.total < 3) type = 'bar'
    else if ((type === 'multiaxis' || type === 'combo' || type === 'stacked' || type === 'hstacked') && numCols < 2)
      type = type === 'hstacked' ? 'hbar' : type === 'stacked' || type === 'combo' ? 'bar' : 'line'
  }
  return { ...r, type, title }
}

// Vẽ biểu đồ / bảng trực quan: AI chỉ đưa loại + SQL, app tự chạy SQL lấy số liệu (AI không ghi số vào biểu đồ)
export const drawChartTool: AgentTool<DataAgentState> = {
  name: TOOL_NAME.drawChart,
  description:
    `Vẽ biểu đồ / bảng trực quan kèm câu trả lời (tối đa ${MAX_CHARTS} mỗi câu hỏi). App tự chạy "sql" lấy số liệu: cột đầu = nhãn, ` +
    'các cột số sau = chuỗi dữ liệu (tối đa 6), đặt alias dễ đọc theo ngôn ngữ người hỏi (vd SUM("so_tien") AS "Doanh thu"). ' +
    'So sánh giữa các cột (vd "eth", "btc") → một dòng SELECT AVG("eth") AS "ETH", AVG("btc") AS "BTC", app tự xoay mỗi cột thành 1 nhóm. ' +
    'Gọi lại với cùng "title" để thay biểu đồ đó (sửa SQL, đổi loại).',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: CHART_TYPES,
        // Hướng dẫn chọn loại (system prompt agent không lặp lại phần này)
        description:
          'bar: ≤ 12 nhóm (nhiều cột số = cột nhóm). hbar: nhiều nhóm / tên dài, ≤ 30, ORDER BY giá trị DESC. ' +
          'stacked / hstacked: tổng + cơ cấu theo nhóm (≥ 2 cột số). line: theo thời gian, ORDER BY thời gian. area: như line, nhấn độ lớn / tích luỹ. ' +
          'multiaxis: 2 chỉ số khác đơn vị theo thời gian (số 1 trục trái, số 2 trục phải). combo: số 1 dạng cột, các số sau dạng đường. ' +
          'pie / doughnut: tỉ trọng 1 cột số không âm (> 6 phần app gộp "Khác"). polar: ≤ 12 nhóm của 1 cột số không âm. ' +
          'radar: 3–12 dòng tiêu chí × 1–6 cột số đối tượng. scatter: nhãn, X, Y (≤ 200 điểm). bubble: như scatter + cột số 3 = kích thước. ' +
          'table: số liệu chi tiết chính xác.'
      },
      title: { type: 'string', description: 'Tiêu đề biểu đồ, theo ngôn ngữ người hỏi.' },
      sql: { type: 'string', description: 'Câu SELECT / WITH lấy số liệu vẽ.' }
    },
    required: ['type', 'title', 'sql']
  },
  execute: (args, ctx) => {
    const s = ctx.state
    const title = cut(String(args.title ?? '').trim(), 120)
    const sql = String(args.sql ?? '').trim()
    if (!sql) return 'LỖI: thiếu tham số "sql".'
    const existing = s.charts.findIndex((c) => c.title === title)
    if (existing < 0 && s.charts.length >= MAX_CHARTS) return `LỖI: đã đủ ${MAX_CHARTS} biểu đồ cho câu hỏi này, không vẽ thêm.`
    ctx.onStep?.(translate(ctx.lang, 'Đang vẽ biểu đồ…'))
    const requested = chartType(args.type)
    const chart = buildChart(ctx.userId, requested, title, sql)
    if (chart.error) return `LỖI SQL của biểu đồ "${title}": ${chart.error}\nHãy sửa SQL rồi gọi lại ${TOOL_NAME.drawChart}.`
    // Biểu đồ toàn số 0 thường là SQL sai (vd tên cột trong nháy đơn) → bắt AI kiểm tra lại 1 lần
    const vals = chart.rows.flatMap((row) => row.slice(1)).filter((v) => typeof v === 'number')
    if (!s.zeroChecked && vals.length && vals.every((v) => v === 0)) {
      s.zeroChecked = true
      return `CẢNH BÁO: biểu đồ "${title}" có mọi giá trị đều bằng 0 nên CHƯA được vẽ — kiểm tra lại: tên cột phải trong nháy kép ("eth"), không dùng nháy đơn. Sửa SQL rồi gọi lại (nếu đúng là 0 thì gọi lại y như cũ).`
    }
    if (existing >= 0) s.charts[existing] = chart
    else s.charts.push(chart)
    const downgraded = chart.type !== requested ? ` (dữ liệu không hợp loại "${requested}" → đã vẽ dạng "${chart.type}")` : ''
    return `ĐÃ VẼ biểu đồ "${title}" loại "${chart.type}"${downgraded}. Số liệu dùng để vẽ:\n${queryResultText(chart, 20)}`
  }
}
