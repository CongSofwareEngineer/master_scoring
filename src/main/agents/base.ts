// Kiểu dữ liệu dùng chung của khung agent: tin nhắn hội thoại (chuẩn tool calling OpenAI), công cụ, agent.
// Chạy ở main process; không phụ thuộc chức năng cụ thể nào (dữ liệu riêng của từng agent nằm ở `state`).
import type { Lang } from '@shared/types'

export type AgentRole = 'system' | 'user' | 'assistant' | 'tool'

export interface AgentToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

// Một lượt hội thoại gửi cho LLM
export interface AgentMessage {
  role: AgentRole
  content?: string | null
  // Lượt 'tool': id của tool call mà kết quả này trả lời
  toolCallId?: string
  // Lượt 'tool': tên công cụ (để log / debug)
  name?: string
  // Lượt 'assistant' có yêu cầu gọi công cụ
  toolCalls?: AgentToolCall[]
}

// Ngữ cảnh truyền cho mọi lần thực thi công cụ. `state` = dữ liệu riêng của agent (vd bảng đã nạp, truy vấn đã chạy).
export interface AgentContext<S = unknown> {
  userId: number
  lang: Lang
  signal?: AbortSignal
  onStep?: (msg: string) => void
  state: S
}

// Mô tả tham số của công cụ (JSON Schema rút gọn)
export interface ToolParameter {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array'
  description?: string
  enum?: string[]
  properties?: Record<string, ToolParameter>
  required?: string[]
  items?: ToolParameter
}

export interface ToolDefinition {
  name: string
  description: string
  parameters?: ToolParameter
}

// Công cụ đã đăng ký: metadata gửi cho LLM + hàm thực thi ở main. Trả về chuỗi = nội dung lượt 'tool' gửi lại AI.
export interface AgentTool<S = unknown> extends ToolDefinition {
  execute: (args: Record<string, unknown>, ctx: AgentContext<S>) => Promise<string> | string
}

// Agent chuyên biệt: system prompt + tập công cụ được phép gọi
export interface AgentDefinition<S = unknown> {
  name: string
  description: string
  systemPrompt: string | ((ctx: AgentContext<S>) => string)
  tools: AgentTool<S>[]
  // Số vòng gọi công cụ tối đa; vòng kế tiếp bắt buộc trả lời bằng chữ
  maxToolRounds?: number
  // max_tokens mỗi lượt gọi LLM
  maxTokens?: number
}

export interface AgentReply {
  text: string
  messages: AgentMessage[]
  // true = hết số vòng gọi công cụ, câu trả lời bị ép ra ở vòng cuối
  exhausted: boolean
}

// Lịch sử lưu → hội thoại gửi LLM: chỉ giữ lượt user / assistant có chữ (bỏ lượt tool và lượt chỉ chứa tool call),
// lấy `max` lượt gần nhất rồi thêm câu hỏi mới. Giữ prompt gọn và context có giới hạn.
export const toConversation = (history: AgentMessage[], message: string, max = 10): AgentMessage[] => {
  const clean = history.filter(
    (m) => m.role === 'user' || (m.role === 'assistant' && typeof m.content === 'string' && m.content.length > 0 && !m.toolCalls?.length)
  )
  return [...clean.slice(-max), { role: 'user', content: message }]
}
