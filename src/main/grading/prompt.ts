// Xây dựng prompt chấm điểm, JSON schema bắt buộc, và kiểm tra JSON AI trả về.
import type { AiSignal, Assignment, AutoResult, Criterion, Issue, Lang, Severity } from '@shared/types'
import type { ChatMessage } from '../ai/client'
import type { LlmAiHint } from '../integrity/aiEstimate'

export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 3.2)
}

export function numbered(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const w = String(lines.length).length
  return lines.map((l, i) => `${String(i + 1).padStart(w, ' ')}| ${l}`).join('\n')
}

export function fileBlock(path: string, text: string): string {
  return `=== FILE: ${path} ===\n${numbered(text)}\n`
}

export function gradingSchema(criteria: Criterion[]): object {
  return {
    type: 'object',
    properties: {
      criteria: {
        type: 'array',
        minItems: criteria.length,
        maxItems: criteria.length,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', enum: criteria.map((c) => c.id) },
            score: { type: 'number' },
            max: { type: 'number' },
            reason: { type: 'string', maxLength: 500 },
            evidence: {
              type: 'array',
              maxItems: 3,
              items: {
                type: 'object',
                properties: { file: { type: 'string' }, line_start: { type: 'integer' }, line_end: { type: 'integer' } },
                required: ['file', 'line_start', 'line_end']
              }
            }
          },
          required: ['id', 'score', 'reason', 'evidence']
        }
      },
      issues: {
        type: 'array',
        maxItems: 8,
        items: {
          type: 'object',
          properties: {
            severity: { type: 'string', enum: ['error', 'warning', 'info'] },
            file: { type: 'string' },
            line: { type: 'integer' },
            message: { type: 'string', maxLength: 300 },
            criterion_id: { type: 'string' }
          },
          required: ['severity', 'message']
        }
      },
      summary: { type: 'string', maxLength: 800 },
      ai_signals: {
        type: 'object',
        properties: {
          level: { type: 'string', enum: ['low', 'medium', 'high'] },
          ai_percent: { type: 'integer' },
          signals: {
            type: 'array',
            maxItems: 5,
            items: {
              type: 'object',
              properties: { file: { type: 'string' }, line: { type: 'integer' }, description: { type: 'string', maxLength: 300 } },
              required: ['description']
            }
          },
          segments: {
            type: 'array',
            maxItems: 8,
            items: {
              type: 'object',
              properties: {
                file: { type: 'string' },
                line_start: { type: 'integer' },
                line_end: { type: 'integer' },
                origin: { type: 'string', enum: ['ai', 'student'] }
              },
              required: ['file', 'line_start', 'line_end', 'origin']
            }
          }
        },
        required: ['level', 'ai_percent', 'signals', 'segments']
      }
    },
    required: ['criteria', 'issues', 'summary', 'ai_signals']
  }
}

const LANG_RULE: Record<Lang, string> = {
  vi: 'BẮT BUỘC viết mọi nội dung chữ (reason, message, summary, description) bằng TIẾNG VIỆT có dấu, không dùng tiếng Anh.',
  en: 'All text fields (reason, message, summary, description) MUST be written in ENGLISH.'
}

const system = (lang: Lang): string => `Bạn là trợ giảng chấm bài lập trình cho sinh viên đại học, chấm công bằng, khách quan và nhất quán.
Quy tắc:
- Chỉ chấm các tiêu chí được liệt kê, mỗi tiêu chí cho điểm từ 0 đến điểm tối đa (bội số của 0.25).
- ${LANG_RULE[lang]}
- Lý do (reason) ngắn gọn (2-3 câu), cụ thể, dẫn chứng bằng file và số dòng có thật (số dòng ở đầu mỗi dòng code).
- Issues: tối đa 8 vấn đề quan trọng nhất, có file và dòng.
- ai_signals: liệt kê DẤU HIỆU CỤ THỂ cho thấy code có thể do AI sinh ra (comment kiểu chatbot, phong cách khác hẳn phần còn lại, kỹ thuật vượt xa nội dung môn học...). Không có dấu hiệu rõ ràng thì level = "low" và signals rỗng. Đây chỉ là tín hiệu tham khảo.
  + ai_percent: ước lượng bao nhiêu % mã nguồn sinh viên tự làm (không tính code khung, file IDE sinh sẵn) là do AI viết, số nguyên 0-100. Không có dấu hiệu thì gần 0.
  + segments: tối đa 8 đoạn code (file, line_start, line_end) bạn KHÁ CHẮC về nguồn gốc: origin "ai" (văn phong AI) hoặc "student" (dấu hiệu gõ tay: viết dính, format lệch, tên biến tiếng Việt, code bị comment lại, lỗi vặt). Không chắc thì để mảng rỗng.
- Chỉ trả về MỘT đối tượng JSON đúng schema, không thêm chữ nào khác.`

function autoSummary(auto: AutoResult, issues: Issue[]): string {
  const parts: string[] = []
  if (auto.compile) {
    if (!auto.compile.attempted) parts.push(`Biên dịch: không thực hiện (${auto.compile.skippedReason ?? ''})`)
    else parts.push(`Biên dịch: ${auto.compile.ok ? 'THÀNH CÔNG' : 'THẤT BẠI'}`)
  }
  if (auto.tests?.length) {
    const passed = auto.tests.filter((t) => t.passed).length
    parts.push(`Test case: đạt ${passed}/${auto.tests.length}`)
    for (const t of auto.tests.filter((x) => !x.passed).slice(0, 3)) parts.push(`  - ${t.name}: ${t.error ?? 'sai output'}`)
  }
  const st = issues.filter((i) => i.source === 'Static' || i.source === 'Compile').slice(0, 8)
  if (st.length) {
    parts.push('Phân tích tự động:')
    for (const i of st) parts.push(`  - [${i.source}] ${i.file ? `${i.file}:${i.line ?? ''} ` : ''}${i.message}`)
  }
  return parts.join('\n') || '(không có)'
}

export function buildGradingMessages(
  a: Assignment,
  criteria: Criterion[],
  auto: AutoResult,
  issues: Issue[],
  codeBlock: string,
  isSummary: boolean,
  lang: Lang
): ChatMessage[] {
  const crit = criteria.map((c) => `- id="${c.id}" | ${c.name} | tối đa ${c.max} điểm | ${c.description || ''}`).join('\n')
  const user = `# Đề bài
${a.description?.trim() || '(Giáo viên không cung cấp đề bài — chấm theo tên assignment và tiêu chí)'}
Tên bài: ${a.name}

# Tiêu chí cần chấm
${crit}

# Kết quả kiểm tra tự động (khách quan)
${autoSummary(auto, issues)}

# Mã nguồn sinh viên${isSummary ? ' (project lớn: gồm bản tóm tắt từng file và toàn văn các file quan trọng)' : ''}
${codeBlock}

Trả về JSON với "criteria" gồm đủ ${criteria.length} tiêu chí: ${criteria.map((c) => c.id).join(', ')}.
${LANG_RULE[lang]}`
  return [
    { role: 'system', content: system(lang) },
    { role: 'user', content: user }
  ]
}

export function summarizeMessages(path: string, text: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content: 'Bạn tóm tắt mã nguồn cho người chấm bài. Viết tiếng Việt, tối đa 120 từ, dạng gạch đầu dòng: chức năng chính, các hàm/lớp quan trọng (kèm số dòng), điểm bất thường.'
    },
    { role: 'user', content: fileBlock(path, text) }
  ]
}

export function extractJson(text: string): any {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    /* thử tìm khối {...} */
  }
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1))
  if (start >= 0) throw new Error('JSON bị cắt cụt (AI trả lời quá dài, vượt giới hạn token)')
  throw new Error('Không tìm thấy JSON trong phản hồi')
}

export interface ValidatedAi {
  criteria: { id: string; score: number; reason: string; evidence: { file: string; lineStart: number; lineEnd: number }[] }[]
  issues: Issue[]
  summary: string
  aiSignal: AiSignal
  aiHint: LlmAiHint
}

/**
 * Kiểm tra JSON: điểm không vượt max, file/line tồn tại thật.
 * strict = true: lỗi file/line cũng tính là lỗi (để yêu cầu AI trả lại);
 * strict = false (lần cuối): bỏ bằng chứng sai, chỉ lỗi điểm mới tính là lỗi.
 */
export function validateAi(
  raw: any,
  criteria: Criterion[],
  fileLines: Map<string, number>,
  strict: boolean
): { ok: true; value: ValidatedAi } | { ok: false; errors: string[] } {
  const errors: string[] = []
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['Phản hồi không phải đối tượng JSON'] }
  const list: any[] = Array.isArray(raw.criteria) ? raw.criteria : []
  const out: ValidatedAi['criteria'] = []
  const resolveFile = (f: unknown): string | null => {
    if (typeof f !== 'string' || !f) return null
    const norm = f.replace(/\\/g, '/').replace(/^\.?\//, '')
    if (fileLines.has(norm)) return norm
    const hit = [...fileLines.keys()].find((k) => k.endsWith('/' + norm) || norm.endsWith('/' + k))
    return hit ?? null
  }
  for (const c of criteria) {
    const item = list.find((x) => x && x.id === c.id)
    if (!item) {
      errors.push(`Thiếu tiêu chí id="${c.id}"`)
      continue
    }
    const score = Number(item.score)
    if (!Number.isFinite(score)) {
      errors.push(`Điểm tiêu chí "${c.id}" không phải số`)
      continue
    }
    if (score < 0 || score > c.max + 1e-9) {
      errors.push(`Điểm tiêu chí "${c.id}" = ${score} nằm ngoài khoảng 0..${c.max}`)
      continue
    }
    const evidence: ValidatedAi['criteria'][number]['evidence'] = []
    for (const ev of Array.isArray(item.evidence) ? item.evidence : []) {
      const file = resolveFile(ev?.file)
      const ls = Number(ev?.line_start)
      const le = Number(ev?.line_end ?? ev?.line_start)
      const max = file ? fileLines.get(file)! : 0
      if (!file || !Number.isInteger(ls) || ls < 1 || ls > max) {
        if (strict) errors.push(`Bằng chứng của "${c.id}" trỏ tới file/dòng không tồn tại: ${ev?.file}:${ev?.line_start}`)
        continue
      }
      evidence.push({ file, lineStart: ls, lineEnd: Math.min(Math.max(le || ls, ls), max) })
    }
    out.push({ id: c.id, score: Math.round(score * 4) / 4, reason: String(item.reason ?? '').slice(0, 2000), evidence })
  }
  const issues: Issue[] = []
  for (const it of Array.isArray(raw.issues) ? raw.issues.slice(0, 15) : []) {
    if (!it?.message) continue
    const sev: Severity = ['error', 'warning', 'info'].includes(it.severity) ? it.severity : 'warning'
    const file = resolveFile(it.file)
    let line = Number(it.line)
    if (file && (!Number.isInteger(line) || line < 1 || line > fileLines.get(file)!)) {
      if (strict && it.line !== undefined) errors.push(`Issue trỏ tới dòng không tồn tại: ${it.file}:${it.line}`)
      line = NaN
    }
    issues.push({
      source: 'AI',
      severity: sev,
      file: file ?? undefined,
      line: file && Number.isInteger(line) ? line : undefined,
      message: String(it.message).slice(0, 500),
      criterionId: criteria.some((c) => c.id === it.criterion_id) ? it.criterion_id : undefined
    })
  }
  const sigRaw = raw.ai_signals ?? {}
  const level: AiSignal['level'] = ['low', 'medium', 'high'].includes(sigRaw.level) ? sigRaw.level : 'low'
  const signals: AiSignal['signals'] = []
  for (const s of Array.isArray(sigRaw.signals) ? sigRaw.signals.slice(0, 10) : []) {
    if (!s?.description) continue
    const file = resolveFile(s.file)
    const line = Number(s.line)
    signals.push({
      file: file ?? undefined,
      line: file && Number.isInteger(line) && line >= 1 && line <= fileLines.get(file)! ? line : undefined,
      description: String(s.description).slice(0, 500)
    })
  }
  // Phần ước lượng % AI: không bao giờ bắt AI trả lại vì phần này — sai thì bỏ
  const pct = Number(sigRaw.ai_percent)
  const segments: LlmAiHint['segments'] = []
  for (const g of Array.isArray(sigRaw.segments) ? sigRaw.segments.slice(0, 12) : []) {
    const file = resolveFile(g?.file)
    const ls = Number(g?.line_start)
    const le = Number(g?.line_end ?? g?.line_start)
    if (!file || !['ai', 'student'].includes(g?.origin) || !Number.isInteger(ls) || ls < 1) continue
    const max = fileLines.get(file)!
    if (ls > max) continue
    segments.push({ file, lineStart: ls, lineEnd: Math.min(Math.max(Number.isInteger(le) ? le : ls, ls), max), origin: g.origin })
  }
  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    value: {
      criteria: out,
      issues,
      summary: String(raw.summary ?? '').slice(0, 3000),
      aiSignal: { level: signals.length ? level : 'low', signals },
      aiHint: { percent: Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : null, segments }
    }
  }
}
