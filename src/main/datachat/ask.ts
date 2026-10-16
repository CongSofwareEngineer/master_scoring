// Hỏi đáp của Trợ lý dữ liệu: dựng hội thoại từ phiên, chạy agent kế toán (khung agent ở `../agents`),
// lưu lượt trả lời kèm truy vấn / biểu đồ mà công cụ đã tạo.
import { translate } from '@shared/i18n'
import type { DataChatTurn, Lang } from '@shared/types'
import type { BackendConfig } from '../ai/client'
import { AGENT_NAME, getAgent, runAgent, toConversation, type AgentMessage } from '../agents'
import { cut, sampleRows, type DataAgentState } from '../agents/tools/dataShared'
import { getSession, pushTurn } from './session'

const HISTORY_TURNS = 8
const HISTORY_CHARS = 2500

const turnId = (): string => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

// Lượt chat đã lưu → tin nhắn cho AI; kèm danh sách biểu đồ đã vẽ để hỏi tiếp kiểu "đổi sang biểu đồ tròn"
function historyMessages(history: DataChatTurn[]): AgentMessage[] {
  return history
    .filter((h) => !h.error)
    .map((h) => ({
      role: h.role,
      content:
        cut(h.content, HISTORY_CHARS) +
        (h.charts?.length ? '\n[Biểu đồ đã vẽ: ' + h.charts.map((c) => `${c.type} "${c.title}": ${cut(c.sql, 300)}`).join(' | ') + ']' : '')
    }))
}

// Model đôi khi bọc câu trả lời Markdown trong ```markdown … ```
const unfence = (s: string): string => s.replace(/^```(?:markdown|md)?\s*\n/i, '').replace(/\n```\s*$/, '').trim()

export async function askData(
  userId: number,
  question: string,
  backend: BackendConfig,
  lang: Lang,
  onStep: (msg: string) => void
): Promise<DataChatTurn> {
  const s = await getSession(userId)
  if (s.abort) throw new Error('Đang trả lời câu hỏi trước, vui lòng đợi')
  const text = question.trim()
  if (!text) throw new Error('Câu hỏi trống')
  const tables = s.files.flatMap((f) => f.tables)
  if (!tables.length) throw new Error('Chưa mở file dữ liệu nào')

  const state: DataAgentState = {
    tables,
    samples: new Map(tables.map((t) => [t.name, sampleRows(s.db, t)])),
    queries: [],
    charts: [],
    zeroChecked: false
  }
  const conversation = toConversation(historyMessages(s.history), text, HISTORY_TURNS)
  pushTurn(userId, { id: turnId(), role: 'user', content: text, ts: new Date().toISOString() })

  const ctrl = new AbortController()
  s.abort = ctrl
  let answer = ''
  let error = false
  try {
    const reply = await runAgent(backend, getAgent(AGENT_NAME.dataAnalyst), conversation, { userId, lang, signal: ctrl.signal, onStep, state })
    answer = unfence(reply.text)
    if (!answer && !state.charts.length)
      answer = reply.exhausted
        ? translate(lang, 'AI chưa đưa ra được câu trả lời sau {n} lần truy vấn.', { n: state.queries.length })
        : translate(lang, 'AI không trả lời.')
  } catch (e: any) {
    error = true
    answer = ctrl.signal.aborted ? translate(lang, 'Đã dừng.') : translate(lang, 'Lỗi khi hỏi AI: {e}', { e: e?.message ?? String(e) })
  } finally {
    s.abort = null
  }
  const turn: DataChatTurn = {
    id: turnId(),
    role: 'assistant',
    content: answer,
    ts: new Date().toISOString(),
    queries: state.queries,
    charts: error ? [] : state.charts,
    backend: backend.label,
    error
  }
  pushTurn(userId, turn)
  return turn
}

export async function cancelAsk(userId: number): Promise<void> {
  ;(await getSession(userId)).abort?.abort()
}
