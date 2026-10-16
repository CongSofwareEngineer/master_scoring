// Khung agent AI dùng tool calling chuẩn OpenAI (Local llama-server và Cloud dùng chung):
//   base.ts       — kiểu dữ liệu (tin nhắn, công cụ, agent, ngữ cảnh)
//   llm.ts        — dựng body /chat/completions có `tools`, đọc `tool_calls`
//   runAgent.ts   — vòng gọi công cụ tới khi AI trả lời
//   agents/       — registry agent (system prompt + bộ công cụ)
//   tools/        — registry công cụ (hàm thực thi ở main)
export * from './base'
export { callLlm } from './llm'
export { runAgent } from './runAgent'
export { AGENT_NAME, TOOL_NAME } from './constants'
export { AGENT_REGISTRY, getAgent } from './agents'
