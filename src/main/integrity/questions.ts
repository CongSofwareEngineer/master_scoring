// Câu hỏi vấn đáp: bài có % code AI cao → AI đề xuất câu hỏi để giáo viên hỏi trực tiếp,
// kiểm tra sinh viên có hiểu code mình nộp hay không. Câu hỏi bám vào các đoạn nghi do AI viết.
import type { AiEstimate, AiQuestion, AiQuestions, AiSegment, Assignment, Lang } from '@shared/types'
import { chat, type BackendConfig, type ChatMessage } from '../ai/client'
import { nowIso } from '../db'
import { estimateTokens, extractJson } from '../grading/prompt'
import { assignmentOwner } from '../repo'
import { getSettings } from '../settings'

const COUNT = 6
const MAX_SEG_LINES = 60
const OUTPUT_TOKENS = 1600

const schema = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      minItems: 3,
      maxItems: 8,
      items: {
        type: 'object',
        properties: {
          question: { type: 'string', maxLength: 400 },
          file: { type: 'string' },
          line_start: { type: 'integer' },
          line_end: { type: 'integer' },
          purpose: { type: 'string', maxLength: 250 },
          expected: { type: 'string', maxLength: 500 }
        },
        required: ['question', 'file', 'line_start', 'line_end', 'purpose', 'expected']
      }
    }
  },
  required: ['questions']
}

const LANG_RULE: Record<Lang, string> = {
  vi: 'BẮT BUỘC viết question, purpose, expected bằng TIẾNG VIỆT có dấu.',
  en: 'question, purpose and expected MUST be written in ENGLISH.'
}

// Đoạn ưu tiên đưa vào prompt: nghi AI nhất trước; không có thì lấy đoạn có xác suất AI cao nhất (trừ code khung).
function pickSegments(e: AiEstimate): AiSegment[] {
  const ai = e.segments.filter((g) => g.origin === 'ai')
  const pool = ai.length >= 3 ? ai : e.segments.filter((g) => g.origin !== 'starter')
  return [...pool].sort((x, y) => y.aiProb - x.aiProb)
}

function excerpt(files: Map<string, string>, segs: AiSegment[], budgetTokens: number): { text: string; used: number } {
  const lines = new Map<string, string[]>()
  const parts: string[] = []
  let tokens = 0
  for (const g of segs) {
    const src = files.get(g.file)
    if (src === undefined) continue
    if (!lines.has(g.file)) lines.set(g.file, src.replace(/\r\n?/g, '\n').split('\n'))
    const all = lines.get(g.file)!
    const end = Math.min(g.lineEnd, g.lineStart + MAX_SEG_LINES - 1, all.length)
    const w = String(end).length
    const body = all
      .slice(g.lineStart - 1, end)
      .map((l, i) => `${String(g.lineStart + i).padStart(w, ' ')}| ${l}`)
      .join('\n')
    const block = `=== ${g.file} (dòng ${g.lineStart}–${end}, khả năng AI ${Math.round(g.aiProb * 100)}%) ===\n${body}\n`
    const t = estimateTokens(block)
    if (tokens + t > budgetTokens) {
      if (parts.length) continue
      // đoạn đầu tiên quá dài: vẫn đưa vào, cắt bớt
      parts.push(block.slice(0, Math.floor(budgetTokens * 3.2)))
      tokens = budgetTokens
      break
    }
    parts.push(block)
    tokens += t
  }
  return { text: parts.join('\n'), used: parts.length }
}

function messages(a: Assignment, aiPercent: number, code: string, lang: Lang): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `Bạn là giảng viên lập trình, chuẩn bị buổi vấn đáp ngắn (5–10 phút) để kiểm tra sinh viên có THỰC SỰ HIỂU code mình đã nộp hay không.
Bài này có dấu hiệu một phần code do AI viết. Mục đích là xác minh mức độ hiểu bài, KHÔNG buộc tội.
Quy tắc:
- Đúng ${COUNT} câu hỏi, mỗi câu gắn với một đoạn code cụ thể trong phần trích (file và số dòng có thật, số dòng ở đầu mỗi dòng code).
- Đa dạng loại câu hỏi: giải thích luồng xử lý của hàm/đoạn code; vì sao dùng cú pháp / thư viện / cấu trúc dữ liệu đó (đặc biệt chỗ vượt mức môn học); dự đoán kết quả với một input cụ thể; nếu yêu cầu đổi một chi tiết thì sửa ở đâu, sửa thế nào; trường hợp biên / lỗi có thể xảy ra.
- Câu hỏi ngắn, trả lời được bằng lời trong 1–2 phút. Không hỏi lý thuyết chung chung, không hỏi "em có dùng AI không".
- purpose: câu hỏi kiểm tra điều gì (1 câu). expected: gợi ý câu trả lời đúng (1–3 câu) để giảng viên đối chiếu.
- ${LANG_RULE[lang]}
- Chỉ trả về MỘT đối tượng JSON đúng schema, không thêm chữ nào khác.`
    },
    {
      role: 'user',
      content: `# Đề bài
${a.description?.trim() || '(không có mô tả)'}
Tên bài: ${a.name}

# Ước lượng: ~${aiPercent}% code do AI viết. Các đoạn nghi ngờ nhất:
${code}

Trả về JSON {"questions": [...]} gồm ${COUNT} câu hỏi. ${LANG_RULE[lang]}`
    }
  ]
}

function validate(raw: any, fileLines: Map<string, number>, back: (f: string) => string): AiQuestion[] {
  const resolve = (f: unknown): string | null => {
    if (typeof f !== 'string' || !f) return null
    const norm = f.replace(/\\/g, '/').replace(/^\.?\//, '')
    if (fileLines.has(norm)) return norm
    return [...fileLines.keys()].find((k) => k.endsWith('/' + norm) || norm.endsWith('/' + k)) ?? null
  }
  const out: AiQuestion[] = []
  for (const q of Array.isArray(raw?.questions) ? raw.questions.slice(0, 10) : []) {
    const question = String(q?.question ?? '').trim()
    if (!question) continue
    const item: AiQuestion = {
      question: question.slice(0, 600),
      purpose: String(q?.purpose ?? '').trim().slice(0, 400),
      expected: String(q?.expected ?? '').trim().slice(0, 800)
    }
    const file = resolve(q?.file)
    const ls = Number(q?.line_start)
    const le = Number(q?.line_end ?? q?.line_start)
    if (file && Number.isInteger(ls) && ls >= 1 && ls <= fileLines.get(file)!) {
      item.file = back(file)
      item.lineStart = ls
      item.lineEnd = Math.min(Math.max(Number.isInteger(le) ? le : ls, ls), fileLines.get(file)!)
    }
    out.push(item)
  }
  return out
}

/**
 * files: mã nguồn gốc (đường dẫn thật). anon: ẩn danh khi gửi Cloud — đường dẫn file được ánh xạ ngược trong kết quả.
 */
export async function generateQuestions(opts: {
  a: Assignment
  files: Map<string, string>
  estimate: AiEstimate
  backend: BackendConfig
  signal?: AbortSignal
  anon?: (t: string) => string
}): Promise<AiQuestions> {
  const { a, estimate, backend, signal } = opts
  const anon = opts.anon ?? ((t: string): string => t)
  const s = getSettings(null)
  // Ngôn ngữ là cài đặt riêng từng giáo viên → lấy của chủ assignment
  const lang = getSettings(assignmentOwner(a.id) ?? null).lang
  const files = new Map<string, string>()
  const backMap = new Map<string, string>()
  for (const [p, t] of opts.files) {
    files.set(anon(p), anon(t))
    backMap.set(anon(p), p)
  }
  const segs = pickSegments(estimate).map((g) => ({ ...g, file: anon(g.file) }))
  const ctx = backend.kind === 'local' ? s.contextSize : 32_000
  const base = estimateTokens(messages({ ...a, description: anon(a.description) }, estimate.aiPercent, '', lang).map((m) => m.content).join('\n'))
  const budget = Math.max(600, Math.min(12_000, ctx - OUTPUT_TOKENS - base - 200))
  const { text, used } = excerpt(files, segs, budget)
  if (!used) throw new Error('Không có đoạn code nào để đặt câu hỏi')

  const msgs = messages({ ...a, description: anon(a.description) }, estimate.aiPercent, text, lang)
  const fileLines = new Map<string, number>()
  for (const [p, t] of files) fileLines.set(p, t.split('\n').length)
  let lastError = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal?.aborted) throw new Error('Đã huỷ')
    const content = await chat(backend, msgs, { maxTokens: OUTPUT_TOKENS, jsonSchema: schema, signal })
    try {
      const items = validate(extractJson(content), fileLines, (f) => backMap.get(f) ?? f)
      if (items.length) return { generatedAt: nowIso(), model: backend.model, aiPercent: estimate.aiPercent, items }
      lastError = 'AI không trả về câu hỏi nào'
    } catch (e: any) {
      lastError = e.message
    }
    msgs.push(
      { role: 'assistant', content: content.slice(0, 600) },
      { role: 'user', content: `Phản hồi chưa hợp lệ (${lastError}). Chỉ trả về MỘT đối tượng JSON {"questions": [...]} đúng schema. ${LANG_RULE[lang]}` }
    )
  }
  throw new Error('AI không tạo được câu hỏi: ' + lastError)
}
