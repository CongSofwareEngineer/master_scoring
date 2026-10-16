// Vòng gọi công cụ của một agent: hỏi LLM → nếu AI yêu cầu công cụ thì thực thi ở main và gửi kết quả lại
// (lượt 'tool') → lặp tới khi AI trả lời bằng chữ. Hết số vòng → vòng cuối ép trả lời (tool_choice 'none').
import { translate } from '@shared/i18n'
import type { BackendConfig } from '../ai/client'
import type { AgentContext, AgentDefinition, AgentMessage, AgentReply } from './base'
import { callLlm } from './llm'

const DEFAULT_MAX_TOOL_ROUNDS = 6
const FINAL_NUDGE = 'Đã hết lượt gọi công cụ. Hãy trả lời ngay bằng chữ dựa trên các kết quả đã có, không gọi thêm công cụ.'

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export async function runAgent<S>(backend: BackendConfig, agent: AgentDefinition<S>, history: AgentMessage[], ctx: AgentContext<S>): Promise<AgentReply> {
  const system = typeof agent.systemPrompt === 'function' ? agent.systemPrompt(ctx) : agent.systemPrompt
  const messages: AgentMessage[] = [...history]
  const maxRounds = agent.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS

  for (let round = 0; ; round++) {
    const last = round >= maxRounds
    if (last) messages.push({ role: 'user', content: FINAL_NUDGE })
    ctx.onStep?.(translate(ctx.lang, round === 0 ? 'AI đang phân tích câu hỏi…' : 'AI đang đọc kết quả…'))
    const result = await callLlm(backend, {
      system,
      messages,
      tools: agent.tools,
      toolChoice: last ? 'none' : 'auto',
      maxTokens: agent.maxTokens,
      signal: ctx.signal
    })

    if (last || !result.toolCalls.length) {
      return { text: result.text?.trim() ?? '', messages, exhausted: last }
    }

    messages.push({ role: 'assistant', content: result.text, toolCalls: result.toolCalls })
    for (const call of result.toolCalls) {
      if (ctx.signal?.aborted) throw new Error('Đã huỷ')
      const tool = agent.tools.find((t) => t.name === call.name)
      let output: string
      try {
        output = tool ? await tool.execute(call.arguments, ctx) : `LỖI: công cụ "${call.name}" không tồn tại. Công cụ có: ${agent.tools.map((t) => t.name).join(', ')}.`
      } catch (e) {
        output = `LỖI khi chạy công cụ "${call.name}": ${errMsg(e)}`
      }
      messages.push({ role: 'tool', name: call.name, toolCallId: call.id, content: output })
    }
  }
}
