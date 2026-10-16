// Client LLM của agent: dựng body chuẩn OpenAI Chat Completions có tool calling, gửi qua `postCompletion`
// (Local llama-server hoặc Cloud — cùng một định dạng), rồi đọc `content` + `tool_calls` từ phản hồi.
//
// Body gửi đi:
//   {
//     model, temperature, max_tokens, stream: false, [repeat_penalty — Local],
//     messages: [
//       { role: 'system', content },
//       { role: 'user', content },
//       { role: 'assistant', content: string | null, tool_calls: [{ id, type: 'function', function: { name, arguments: '<JSON>' } }] },
//       { role: 'tool', tool_call_id, content }
//     ],
//     tools: [{ type: 'function', function: { name, description, parameters } }],
//     tool_choice: 'auto' | 'none'
//   }
import { completionBody, messageText, postCompletion, type BackendConfig } from '../ai/client'
import type { AgentMessage, AgentToolCall, ToolDefinition } from './base'

export interface LlmRequest {
  system?: string
  messages: AgentMessage[]
  tools?: ToolDefinition[]
  // 'none' = vẫn khai báo công cụ (bắt buộc khi hội thoại đã có tool call) nhưng yêu cầu trả lời bằng chữ
  toolChoice?: 'auto' | 'none'
  maxTokens?: number
  signal?: AbortSignal
}

export interface LlmResponse {
  text: string | null
  toolCalls: AgentToolCall[]
}

const buildOpenAiMessages = (system: string | undefined, messages: AgentMessage[]): Record<string, unknown>[] => {
  const result: Record<string, unknown>[] = []
  if (system) result.push({ role: 'system', content: system })
  for (const m of messages) {
    if (m.role === 'tool') {
      result.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content ?? '' })
      continue
    }
    if (m.role === 'assistant' && m.toolCalls?.length) {
      // Lượt chỉ gọi công cụ: content null (chuỗi rỗng bị một số nhà cung cấp coi là khối text rỗng → lỗi)
      result.push({
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.arguments ?? {}) }
        }))
      })
      continue
    }
    result.push({ role: m.role, content: m.content ?? '' })
  }
  return result
}

const buildOpenAiTools = (tools: ToolDefinition[]): Record<string, unknown>[] =>
  tools.map((tool) => ({
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.parameters ?? { type: 'object', properties: {} } }
  }))

const safeParse = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value === 'string') {
    try {
      const v = JSON.parse(value)
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
    } catch {
      return {}
    }
  }
  return {}
}

let callSeq = 0
// llama-server / một số nhà cung cấp có thể trả tool call không có id → tự sinh để ghép với lượt 'tool'
const newCallId = (): string => `call_${Date.now().toString(36)}_${(callSeq++).toString(36)}`

// Model Local nhỏ đôi khi viết tool call thành chữ thay vì `tool_calls`:
//   <tool_call>{"name":"run_sql","arguments":{...}}</tool_call>  hoặc cả câu trả lời là JSON {"name":…,"arguments":…}
// Chỉ nhận khi tên trùng công cụ đã khai báo.
function textToolCalls(text: string, tools: ToolDefinition[]): AgentToolCall[] {
  const names = new Set(tools.map((t) => t.name))
  const blocks = [...text.matchAll(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g)].map((m) => m[1])
  if (!blocks.length) {
    const bare = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()
    if (bare.startsWith('{') && bare.endsWith('}')) blocks.push(bare)
  }
  const calls: AgentToolCall[] = []
  for (const b of blocks) {
    const j = safeParse(b)
    const name = String(j.name ?? '')
    if (names.has(name)) calls.push({ id: newCallId(), name, arguments: safeParse(j.arguments ?? j.parameters) })
  }
  return calls
}

export async function callLlm(backend: BackendConfig, request: LlmRequest): Promise<LlmResponse> {
  const tools = request.tools ?? []
  const body = {
    ...completionBody(backend, request.maxTokens),
    messages: buildOpenAiMessages(request.system, request.messages),
    ...(tools.length ? { tools: buildOpenAiTools(tools), tool_choice: request.toolChoice ?? 'auto' } : {})
  }
  const message = await postCompletion(backend, body, request.signal)
  const text = messageText(message.content)
  let toolCalls: AgentToolCall[] = (Array.isArray(message.tool_calls) ? message.tool_calls : [])
    .map((call: any) => ({
      id: String(call?.id || newCallId()),
      name: String(call?.function?.name ?? ''),
      arguments: safeParse(call?.function?.arguments)
    }))
    .filter((call: AgentToolCall) => call.name)
  if (!toolCalls.length && text && tools.length && request.toolChoice !== 'none') {
    toolCalls = textToolCalls(text, tools)
    if (toolCalls.length) return { text: null, toolCalls }
  }
  return { text, toolCalls }
}
