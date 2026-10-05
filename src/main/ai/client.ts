// Giao diện gọi AI chung cho Local và Cloud (chuẩn OpenAI Chat Completions).
// Phần chấm điểm chỉ viết một lần; khác nhau ở URL, key và tên model.
import { CLOUD_PROVIDERS } from '@shared/constants'
import type { CloudProvider } from '@shared/types'
import { all, get, run } from '../db'
import { netFetch } from '../netlog'
import { readSecret, saveSecret } from '../secrets'
import { localBaseUrl, getLocalState } from './llama'
import { modelDef } from './models'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface BackendConfig {
  kind: 'local' | 'cloud'
  provider?: CloudProvider
  baseUrl: string
  apiKey: string
  model: string
  label: string
}

export interface CloudConfig {
  compatibleUrl: string
  models: Partial<Record<CloudProvider, string>>
}

export function getCloudConfig(userId: number): CloudConfig {
  const row = get<{ value: string }>("SELECT value FROM settings WHERE user_id = ? AND key = 'cloudConfig'", [userId])
  const def: CloudConfig = { compatibleUrl: '', models: {} }
  if (!row) return def
  try {
    return { ...def, ...JSON.parse(row.value) }
  } catch {
    return def
  }
}

export function saveCloudConfig(userId: number, provider: CloudProvider, apiKey: string | null, model: string, compatibleUrl?: string): void {
  const cfg = getCloudConfig(userId)
  cfg.models[provider] = model
  if (provider === 'compatible' && compatibleUrl !== undefined) cfg.compatibleUrl = compatibleUrl.trim().replace(/\/+$/, '')
  run(
    "INSERT INTO settings (user_id, key, value) VALUES (?, 'cloudConfig', ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value",
    [userId, JSON.stringify(cfg)]
  )
  if (apiKey !== null) saveSecret(userId, 'cloud:' + provider, apiKey)
}

export function configuredProviders(userId: number): CloudProvider[] {
  return all<{ name: string }>("SELECT name FROM secrets WHERE user_id = ? AND name LIKE 'cloud:%'", [userId])
    .map((r) => r.name.slice(6) as CloudProvider)
    .filter((p) => p in CLOUD_PROVIDERS)
}

export function cloudBackend(userId: number, provider: CloudProvider, model?: string): BackendConfig {
  const cfg = getCloudConfig(userId)
  const apiKey = readSecret(userId, 'cloud:' + provider)
  const meta = CLOUD_PROVIDERS[provider]
  const baseUrl = provider === 'compatible' ? cfg.compatibleUrl : meta.baseUrl
  if (!baseUrl) throw new Error('Chưa nhập URL cho OpenAI-compatible')
  if (!apiKey && provider !== 'compatible') throw new Error(`Chưa cấu hình API key cho ${meta.name}`)
  const m = model || cfg.models[provider] || meta.defaultModel
  if (!m) throw new Error('Chưa chọn model Cloud')
  return { kind: 'cloud', provider, baseUrl, apiKey, model: m, label: `Cloud: ${meta.name}` }
}

export function localBackend(): BackendConfig {
  const url = localBaseUrl()
  const st = getLocalState()
  if (!url || st.kind !== 'ready') throw new Error('Local AI chưa sẵn sàng')
  return { kind: 'local', baseUrl: url, apiKey: '', model: modelDef(st.modelId).name, label: 'Local AI' }
}

export class AiError extends Error {
  constructor(
    message: string,
    public code: 'auth' | 'quota' | 'model' | 'network' | 'server' | 'timeout' | 'bad_request'
  ) {
    super(message)
  }
}

function describeHttp(status: number, body: string, provider?: string): AiError {
  const snippet = body.slice(0, 300)
  if (status === 401 || status === 403) return new AiError(`Sai API key hoặc không có quyền (HTTP ${status}). ${snippet}`, 'auth')
  if (status === 429) return new AiError(`Hết quota hoặc vượt giới hạn tốc độ (HTTP 429). ${snippet}`, 'quota')
  if (status === 404) return new AiError(`Sai tên model hoặc URL (HTTP 404). ${snippet}`, 'model')
  if (status === 400 && /model/i.test(body)) return new AiError(`Model không hợp lệ (HTTP 400). ${snippet}`, 'model')
  if (status >= 500) return new AiError(`Máy chủ ${provider ?? ''} lỗi (HTTP ${status}). ${snippet}`, 'server')
  return new AiError(`Yêu cầu không hợp lệ (HTTP ${status}). ${snippet}`, 'bad_request')
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export interface ChatOptions {
  maxTokens?: number
  jsonSchema?: object
  signal?: AbortSignal
}

export async function chat(backend: BackendConfig, messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const body: any = {
    model: backend.model,
    messages,
    temperature: 0,
    max_tokens: opts.maxTokens ?? 1500,
    stream: false
  }
  // Model nhỏ ở temperature 0 dễ lặp một câu mãi tới hết max_tokens → JSON bị cắt cụt
  if (backend.kind === 'local') body.repeat_penalty = 1.1
  if (opts.jsonSchema) {
    if (backend.kind === 'local') {
      body.response_format = { type: 'json_schema', json_schema: { name: 'grading', schema: opts.jsonSchema } }
    } else if (backend.provider === 'openai' || backend.provider === 'gemini') {
      body.response_format = { type: 'json_schema', json_schema: { name: 'grading', schema: opts.jsonSchema } }
    } else if (backend.provider === 'compatible') {
      body.response_format = { type: 'json_object' }
    }
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (backend.apiKey) headers.Authorization = `Bearer ${backend.apiKey}`
  if (backend.provider === 'anthropic') {
    headers['x-api-key'] = backend.apiKey
    headers['anthropic-version'] = '2023-06-01'
  }
  const url = backend.baseUrl.replace(/\/+$/, '') + '/chat/completions'
  const timeoutMs = backend.kind === 'local' ? 20 * 60_000 : 3 * 60_000
  let attempt = 0
  for (;;) {
    attempt++
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    const onAbort = (): void => ctrl.abort()
    opts.signal?.addEventListener('abort', onAbort)
    let res: Response
    try {
      const init: RequestInit = { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal }
      res = backend.kind === 'local' ? await fetch(url, init) : await netFetch(url, init, `Cloud AI (${backend.label})`)
    } catch (e: any) {
      if (opts.signal?.aborted) throw new AiError('Đã huỷ', 'timeout')
      if (ctrl.signal.aborted) throw new AiError('Quá thời gian chờ phản hồi từ AI', 'timeout')
      throw new AiError(
        backend.kind === 'local' ? 'Không kết nối được Local AI: ' + e.message : 'Không có mạng hoặc không kết nối được máy chủ: ' + e.message,
        'network'
      )
    } finally {
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
    }
    if (res.status === 429 && attempt <= 5) {
      // Rate limit: chờ theo Retry-After hoặc lùi dần
      const ra = Number(res.headers.get('retry-after'))
      await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(60_000, 2000 * 2 ** attempt))
      continue
    }
    if ((res.status === 400 || res.status === 422) && body.response_format && attempt === 1) {
      // Nhà cung cấp không hỗ trợ response_format → gửi lại không kèm
      delete body.response_format
      continue
    }
    const text = await res.text()
    if (!res.ok) throw describeHttp(res.status, text, backend.label)
    try {
      const json = JSON.parse(text)
      const content = json?.choices?.[0]?.message?.content
      if (typeof content === 'string') return content
      if (Array.isArray(content)) return content.map((c: any) => c?.text ?? '').join('')
      throw new Error('no content')
    } catch {
      throw new AiError('Phản hồi AI không đúng định dạng: ' + text.slice(0, 200), 'server')
    }
  }
}

export async function testConnection(backend: BackendConfig): Promise<string> {
  const out = await chat(backend, [{ role: 'user', content: 'Reply with the single word: OK' }], { maxTokens: 8 })
  return out.trim().slice(0, 50) || '(trống)'
}
