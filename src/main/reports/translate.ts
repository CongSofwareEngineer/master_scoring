// Dịch nội dung AI đã sinh (lý do chấm, nhận xét chung, issue) sang ngôn ngữ đang chọn khi xuất báo cáo.
// Bài chấm trước khi đổi ngôn ngữ — hoặc model nhỏ lỡ trả lời sai ngôn ngữ — vẫn xuất ra đúng một ngôn ngữ.
import type { Lang } from '@shared/types'
import { chat, type BackendConfig, type ChatMessage } from '../ai/client'
import { extractJson } from '../grading/prompt'

const VI_CHAR = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi

/** Đoạn văn có đang viết khác ngôn ngữ `lang` không (heuristic theo dấu tiếng Việt). */
export function isWrongLanguage(text: string, lang: Lang): boolean {
  const t = text.trim()
  if (!t) return false
  const vi = t.match(VI_CHAR)?.length ?? 0
  // Vài ký tự có dấu có thể chỉ là chuỗi trong code sinh viên ("Nhập số") → chưa coi là tiếng Việt
  if (lang === 'en') return vi >= 3
  return vi === 0 && (t.match(/[A-Za-z]{2,}/g)?.length ?? 0) >= 3
}

const LANG_NAME: Record<Lang, string> = { vi: 'Vietnamese (with full diacritics)', en: 'English' }
const BATCH_CHARS = 2400
const BATCH_ITEMS = 12

// Bộ nhớ đệm trong phiên: xuất lại không phải dịch lại
const cache = new Map<string, string>()

function messages(items: string[], lang: Lang): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `You translate teacher feedback on student programming assignments into ${LANG_NAME[lang]}.
Rules:
- Translate every item. Keep the same number of items, in the same order.
- Keep code, identifiers, file names, paths, line numbers, numbers and quoted program output exactly as they are.
- Keep the meaning and tone. Do not add, drop or summarize information.
- Return ONLY one JSON object: {"items": ["...", ...]}.`
    },
    { role: 'user', content: JSON.stringify({ items }) }
  ]
}

function schema(n: number): object {
  return {
    type: 'object',
    properties: { items: { type: 'array', minItems: n, maxItems: n, items: { type: 'string' } } },
    required: ['items']
  }
}

async function translateBatch(batch: string[], lang: Lang, backend: BackendConfig): Promise<string[]> {
  const chars = batch.reduce((s, t) => s + t.length, 0)
  const content = await chat(backend, messages(batch, lang), { maxTokens: Math.min(4000, Math.ceil(chars / 1.5) + 300), jsonSchema: schema(batch.length) })
  const items = extractJson(content)?.items
  if (!Array.isArray(items) || items.length !== batch.length || items.some((x) => typeof x !== 'string' || !x.trim())) {
    throw new Error('AI trả về bản dịch không hợp lệ')
  }
  return items.map((x: string) => x.trim())
}

function batches(texts: string[]): string[][] {
  const out: string[][] = []
  let cur: string[] = []
  let size = 0
  for (const t of texts) {
    if (cur.length && (size + t.length > BATCH_CHARS || cur.length >= BATCH_ITEMS)) {
      out.push(cur)
      cur = []
      size = 0
    }
    cur.push(t)
    size += t.length
  }
  if (cur.length) out.push(cur)
  return out
}

export interface TranslateOutcome {
  map: Map<string, string>
  failed: number
  error?: string
}

/**
 * Dịch các đoạn văn sang `lang`. Lỗi AI không làm hỏng việc xuất: đoạn dịch không được giữ nguyên văn
 * và được đếm vào `failed` để UI cảnh báo.
 */
export async function translateTexts(texts: string[], lang: Lang, getBackend: () => BackendConfig): Promise<TranslateOutcome> {
  const map = new Map<string, string>()
  const todo: string[] = []
  for (const t of new Set(texts)) {
    const hit = cache.get(lang + '\0' + t)
    if (hit !== undefined) map.set(t, hit)
    else todo.push(t)
  }
  if (!todo.length) return { map, failed: 0 }
  let backend: BackendConfig
  try {
    backend = getBackend()
  } catch (e: any) {
    return { map, failed: todo.length, error: e?.message ?? String(e) }
  }
  let failed = 0
  let error: string | undefined
  const save = (src: string, dst: string): void => {
    cache.set(lang + '\0' + src, dst)
    map.set(src, dst)
  }
  for (const batch of batches(todo)) {
    try {
      const out = await translateBatch(batch, lang, backend)
      batch.forEach((t, i) => save(t, out[i]))
      continue
    } catch (e: any) {
      error = e?.message ?? String(e)
    }
    // Cả lô hỏng (thường do model nhỏ đếm sai số phần tử) → dịch lẻ từng đoạn
    for (const t of batch) {
      try {
        save(t, (await translateBatch([t], lang, backend))[0])
      } catch (e: any) {
        failed++
        error = e?.message ?? String(e)
      }
    }
  }
  return { map, failed, error: failed ? error : undefined }
}
