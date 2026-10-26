// Giao diện gọi AI chung cho Local và Cloud (chuẩn OpenAI Chat Completions).
// Phần chấm điểm chỉ viết một lần; khác nhau ở URL, key và tên model.
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
  baseUrl: string
  apiKey: string
  model: string
  label: string
}

// Cloud API: một cấu hình chung cho mỗi giáo viên — URL chuẩn OpenAI (DeepSeek, OpenRouter, Ollama, Kilo…),
// API key (bảng secrets, tên CLOUD_SECRET) và tên model.
export interface CloudConfig {
  url: string
  model: string
}

const CLOUD_SECRET = 'cloud:api'

// Bản cũ chọn theo nhà cung cấp (gemini / openai / anthropic / compatible) → chuyển sang 1 URL chung
const LEGACY_URLS: Record<string, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  compatible: ''
}
const LEGACY_MODELS: Record<string, string> = { gemini: 'gemini-2.5-flash', openai: 'gpt-4.1-mini', anthropic: 'claude-sonnet-5-5', compatible: '' }

const normUrl = (u: string): string => u.trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, '')

function writeCloudConfig(userId: number, cfg: CloudConfig): void {
  run(
    "INSERT INTO settings (user_id, key, value) VALUES (?, 'cloudConfig', ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value",
    [userId, JSON.stringify(cfg)]
  )
}

function migrateLegacy(userId: number, raw: any): CloudConfig {
  const names = all<{ name: string }>("SELECT name FROM secrets WHERE user_id = ? AND name LIKE 'cloud:%'", [userId]).map((r) => r.name.slice(6))
  const pick = Object.keys(LEGACY_URLS).find((p) => (p === 'compatible' ? !!raw?.compatibleUrl : names.includes(p)))
  const cfg: CloudConfig = { url: '', model: '' }
  if (pick) {
    cfg.url = pick === 'compatible' ? normUrl(String(raw.compatibleUrl)) : LEGACY_URLS[pick]
    cfg.model = raw?.models?.[pick] || LEGACY_MODELS[pick]
    const key = readSecret(userId, 'cloud:' + pick)
    if (key) saveSecret(userId, CLOUD_SECRET, key)
  }
  for (const p of Object.keys(LEGACY_URLS)) if (names.includes(p)) saveSecret(userId, 'cloud:' + p, '')
  writeCloudConfig(userId, cfg)
  return cfg
}

export function getCloudConfig(userId: number): CloudConfig {
  const row = get<{ value: string }>("SELECT value FROM settings WHERE user_id = ? AND key = 'cloudConfig'", [userId])
  let raw: any = null
  try {
    raw = row ? JSON.parse(row.value) : null
  } catch {
    /* hỏng → coi như chưa có */
  }
  if (raw && typeof raw.url === 'string') return { url: raw.url, model: typeof raw.model === 'string' ? raw.model : '' }
  // Chưa có cấu hình mới: chuyển cấu hình theo nhà cung cấp cũ (nếu có)
  if (raw || listCloudSecrets(userId).length) return migrateLegacy(userId, raw)
  return { url: '', model: '' }
}

function listCloudSecrets(userId: number): string[] {
  return all<{ name: string }>("SELECT name FROM secrets WHERE user_id = ? AND name LIKE 'cloud:%' AND name <> ?", [userId, CLOUD_SECRET]).map((r) => r.name)
}

/** apiKey = null → giữ key cũ; '' → xoá key (API như Ollama không cần key). */
export function saveCloudConfig(userId: number, url: string, model: string, apiKey: string | null): void {
  getCloudConfig(userId) // chuyển cấu hình cũ trước để không ghi đè lẫn nhau
  writeCloudConfig(userId, { url: normUrl(url), model: model.trim() })
  if (apiKey !== null) saveSecret(userId, CLOUD_SECRET, apiKey.trim())
}

export function cloudConfigured(userId: number): boolean {
  const cfg = getCloudConfig(userId)
  return !!cfg.url && !!cfg.model
}

export function cloudHasKey(userId: number): boolean {
  return !!get('SELECT 1 FROM secrets WHERE user_id = ? AND name = ?', [userId, CLOUD_SECRET])
}

export function cloudBackend(userId: number): BackendConfig {
  const cfg = getCloudConfig(userId)
  if (!cfg.url) throw new Error('Chưa nhập URL cho Cloud API')
  if (!cfg.model) throw new Error('Chưa nhập tên model cho Cloud API')
  let host = cfg.url
  try {
    host = new URL(cfg.url).host
  } catch {
    throw new Error('URL Cloud API không hợp lệ: ' + cfg.url)
  }
  return { kind: 'cloud', baseUrl: cfg.url, apiKey: readSecret(userId, CLOUD_SECRET), model: cfg.model, label: `Cloud API: ${host}` }
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

// Phần chung của mọi body /chat/completions (chat thường và agent gọi công cụ)
export function completionBody(backend: BackendConfig, maxTokens = 1500): Record<string, any> {
  const body: Record<string, any> = {
    model: backend.model,
    temperature: 0,
    max_tokens: maxTokens,
    stream: false
  }
  // Model nhỏ ở temperature 0 dễ lặp một câu mãi tới hết max_tokens → JSON bị cắt cụt
  if (backend.kind === 'local') body.repeat_penalty = 1.1
  return body
}

// `content` của message có thể là chuỗi hoặc mảng part [{type:'text',text}]
export function messageText(content: unknown): string | null {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((c: any) => (typeof c?.text === 'string' ? c.text : '')).join('')
  return null
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

// Gửi một request /chat/completions tới Local hoặc Cloud, trả về `choices[0].message` (chuẩn OpenAI).
// Xử lý chung: header theo nhà cung cấp, timeout, huỷ, 429 thử lại, bỏ response_format khi không hỗ trợ.
export async function postCompletion(backend: BackendConfig, payload: Record<string, any>, signal?: AbortSignal): Promise<any> {
  const body = { ...payload }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (backend.apiKey) headers.Authorization = `Bearer ${backend.apiKey}`
  if (/(^|\.)anthropic\.com$/i.test(hostOf(backend.baseUrl))) {
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
    signal?.addEventListener('abort', onAbort)
    let res: Response
    try {
      const init: RequestInit = { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal }
      res = backend.kind === 'local' ? await fetch(url, init) : await netFetch(url, init, `Cloud AI (${backend.label})`)
    } catch (e: any) {
      if (signal?.aborted) throw new AiError('Đã huỷ', 'timeout')
      if (ctrl.signal.aborted) throw new AiError('Quá thời gian chờ phản hồi từ AI', 'timeout')
      throw new AiError(
        backend.kind === 'local' ? 'Không kết nối được Local AI: ' + e.message : 'Không có mạng hoặc không kết nối được máy chủ: ' + e.message,
        'network'
      )
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
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
    if (!res.ok) {
      if (body.tools && res.status < 500 && /tool|function|jinja/i.test(text))
        throw new AiError(`Model / nhà cung cấp AI này không hỗ trợ gọi công cụ (tool calling) (HTTP ${res.status}). ${text.slice(0, 300)}`, 'bad_request')
      throw describeHttp(res.status, text, backend.label)
    }
    let message: any
    try {
      message = JSON.parse(text)?.choices?.[0]?.message
    } catch {
      /* xử lý bên dưới */
    }
    if (!message || typeof message !== 'object') throw new AiError('Phản hồi AI không đúng định dạng: ' + text.slice(0, 200), 'server')
    return message
  }
}

export async function chat(backend: BackendConfig, messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const body: Record<string, any> = { ...completionBody(backend, opts.maxTokens), messages }
  if (opts.jsonSchema) {
    if (backend.kind === 'local') {
      body.response_format = { type: 'json_schema', json_schema: { name: 'grading', schema: opts.jsonSchema } }
    } else {
      // Cloud API chung: json_object được hầu hết nhà cung cấp hỗ trợ; không hỗ trợ → postCompletion gửi lại không kèm
      body.response_format = { type: 'json_object' }
    }
  }
  const message = await postCompletion(backend, body, opts.signal)
  const content = messageText(message.content)
  if (content === null) throw new AiError('Phản hồi AI không đúng định dạng: ' + JSON.stringify(message).slice(0, 200), 'server')
  return content
}

export async function testConnection(backend: BackendConfig): Promise<string> {
  const out = await chat(backend, [{ role: 'user', content: 'Reply with the single word: OK' }], { maxTokens: 8 })
  return out.trim().slice(0, 50) || '(trống)'
}
