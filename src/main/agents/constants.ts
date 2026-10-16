// Tên agent và tên công cụ (tên công cụ là tên hàm gửi cho LLM — chỉ dùng a-z, 0-9, _).
export const AGENT_NAME = {
  dataAnalyst: 'data_analyst'
} as const

export const TOOL_NAME = {
  runSql: 'run_sql',
  drawChart: 'draw_chart'
} as const

export type AgentName = (typeof AGENT_NAME)[keyof typeof AGENT_NAME]
