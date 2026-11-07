// Model TTS — tải từ Hugging Face, sửa nguồn, xoá. Hai định dạng (tự nhận khi tải):
//  - vits  (transformers.js): model.onnx + vocab.json + config.json [+ tokenizer_config.json] — đọc thẳng chữ cái.
//  - piper: model.onnx + piper.json (= file <tên>.onnx.json của repo) — đọc phiên âm IPA (bảng vi-ipa.json).
// Thư mục: <modelsDir>/tts/<id>/ ; có source.json + model.onnx = đã cài.
import { createWriteStream, existsSync, readFileSync, statSync } from 'fs'
import { mkdir, rename, rm, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { TTS_MODELS } from '@shared/constants'
import type { TtsDownloadEvent, TtsFormat, TtsModelInfo, TtsModelPreset, TtsSpeaker } from '@shared/types'
import { sha256File } from '../ai/models'
import { diskFreeBytes } from '../hardware'
import { netFetch } from '../netlog'
import { getSettings } from '../settings'

export interface TtsSource {
  repo: string // nguồn đã tải: owner/name[/đường-dẫn.onnx]
  file: string // đường dẫn file .onnx trong repo
  sha256: string
  size: number
  format?: TtsFormat // thiếu (bản cài cũ) = vits
}

export function ttsModelDef(id: string): TtsModelPreset {
  const m = TTS_MODELS.find((x) => x.id === id)
  if (!m) throw new Error('Model TTS không tồn tại: ' + id)
  return m
}

export function ttsRoot(): string {
  return join(getSettings(null).modelsDir, 'tts')
}

export function ttsModelDir(id: string): string {
  return join(ttsRoot(), ttsModelDef(id).id)
}

// owner/name hoặc owner/name/đường/dẫn/file.onnx
const SPEC_RE = /^[A-Za-z0-9][\w.-]*\/[\w.-]+(\/[^\s?#]+\.onnx)?$/

function defaultSpec(m: TtsModelPreset): string {
  return m.defaultRepo && m.defaultFile ? `${m.defaultRepo}/${m.defaultFile}` : m.defaultRepo
}

/** Tách nguồn thành repo + file .onnx (nếu có). */
function parseSpec(spec: string): { repo: string; file: string | null } {
  const parts = spec.split('/')
  return { repo: parts.slice(0, 2).join('/'), file: parts.length > 2 ? parts.slice(2).join('/') : null }
}

/** Chuẩn hoá nguồn người dùng nhập: owner/name[/file.onnx] hoặc URL huggingface.co/owner/name[/blob|resolve/main/file.onnx]. */
function normalizeSpec(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\/huggingface\.co\//i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .replace(/^([^/]+\/[^/]+)\/(?:blob|resolve|tree)\/[^/]+(?=\/|$)/, '$1')
}

function repoOverrides(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(join(ttsRoot(), 'repos.json'), 'utf8')) as Record<string, string>
  } catch {
    return {}
  }
}

export function ttsRepo(id: string): string {
  return repoOverrides()[id] ?? defaultSpec(ttsModelDef(id))
}

export async function setTtsRepo(id: string, repo: string): Promise<void> {
  const def = ttsModelDef(id)
  const r = normalizeSpec(repo)
  if (r && !SPEC_RE.test(r)) {
    throw new Error('Nguồn không hợp lệ — nhập dạng owner/ten-model hoặc owner/ten-model/duong-dan/file.onnx (vd. Xenova/mms-tts-vie)')
  }
  const all = repoOverrides()
  if (!r || r === defaultSpec(def)) delete all[id]
  else all[id] = r
  await mkdir(ttsRoot(), { recursive: true })
  await writeFile(join(ttsRoot(), 'repos.json'), JSON.stringify(all, null, 2))
}

export function installedSource(id: string): TtsSource | null {
  const dir = ttsModelDir(id)
  try {
    if (!existsSync(join(dir, 'model.onnx'))) return null
    return JSON.parse(readFileSync(join(dir, 'source.json'), 'utf8')) as TtsSource
  } catch {
    return null
  }
}

/** Người đọc của bản đang cài (chỉ Piper). Tên / giới tính lấy từ TTS_MODELS khi tải từ nguồn mặc định. */
export function ttsSpeakers(id: string): TtsSpeaker[] {
  const src = installedSource(id)
  if (!src || src.format !== 'piper') return []
  let cfg: any
  try {
    cfg = JSON.parse(readFileSync(join(ttsModelDir(id), 'piper.json'), 'utf8'))
  } catch {
    return []
  }
  const n = Math.max(1, Number(cfg.num_speakers) || 1)
  const def = ttsModelDef(id)
  if (src.repo === defaultSpec(def) && def.speakers?.length) return def.speakers.filter((s) => s.id < n)
  const named = Object.entries((cfg.speaker_id_map ?? {}) as Record<string, number>)
    .filter(([, v]) => Number.isInteger(v) && v < n)
    .map(([name, v]) => ({ id: v, name }))
    .sort((a, b) => a.id - b.id)
  if (named.length) return named
  return Array.from({ length: n }, (_, i) => ({ id: i, name: `#${i}` }))
}

function partialBytes(id: string): number {
  const p = join(ttsModelDir(id), 'model.onnx.part')
  return existsSync(p) ? statSync(p).size : 0
}

export function listTtsModels(): TtsModelInfo[] {
  return TTS_MODELS.map((m) => {
    const src = installedSource(m.id)
    const onnx = join(ttsModelDir(m.id), 'model.onnx')
    return {
      id: m.id,
      name: m.name,
      repo: ttsRepo(m.id),
      defaultRepo: defaultSpec(m),
      sizeLabel: m.sizeLabel,
      license: m.license,
      note: m.note,
      installed: !!src,
      installedRepo: src?.repo ?? null,
      format: src ? (src.format ?? 'vits') : null,
      speakers: src ? ttsSpeakers(m.id) : [],
      bytes: src && existsSync(onnx) ? statSync(onnx).size : 0,
      partial: partialBytes(m.id)
    }
  })
}

interface HfEntry {
  type: string
  path: string
  size: number
  lfs?: { oid: string; size: number }
}

const ONNX_PREFERRED = ['onnx/model.onnx', 'model.onnx', 'onnx/model_quantized.onnx', 'model_quantized.onnx']
const CONFIG_FILES = ['vocab.json', 'config.json', 'tokenizer_config.json', 'piper.json']

const encPath = (p: string): string => p.split('/').map(encodeURIComponent).join('/')

/** Danh sách file của repo: dir = một thư mục (không đệ quy, root = ''), null = cả repo (đệ quy). Theo trang (Link rel="next"). */
async function repoFiles(repo: string, dir: string | null): Promise<HfEntry[]> {
  let url: string | null =
    dir === null
      ? `https://huggingface.co/api/models/${repo}/tree/main?recursive=true`
      : `https://huggingface.co/api/models/${repo}/tree/main${dir ? '/' + encPath(dir) : ''}`
  const out: HfEntry[] = []
  for (let page = 0; url && page < 20; page++) {
    const res = await netFetch(url, {}, 'Tải model TTS (danh sách file)')
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Không truy cập được repo ${repo} trên Hugging Face (HTTP ${res.status}) — repo không tồn tại hoặc đang để private`)
    }
    if (res.status === 404) {
      throw new Error(dir ? `Repo ${repo} không có thư mục ${dir} (HTTP 404)` : `Repo ${repo} không tồn tại trên Hugging Face (HTTP 404)`)
    }
    if (!res.ok) throw new Error(`Không lấy được danh sách file của ${repo} (HTTP ${res.status})`)
    out.push(...((await res.json()) as HfEntry[]))
    url = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get('link') ?? '')?.[1] ?? null
  }
  return out
}

/** Chọn file .onnx + nhận định dạng từ danh sách file. */
function pickModel(repo: string, files: HfEntry[], wanted: string | null): { onnxPath: string; format: TtsFormat } {
  const paths = new Set(files.filter((f) => f.type === 'file').map((f) => f.path))
  const hasVits = paths.has('vocab.json') && paths.has('config.json')
  if (wanted) {
    if (!paths.has(wanted)) throw new Error(`Repo ${repo} không có file ${wanted}`)
    if (paths.has(wanted + '.json')) return { onnxPath: wanted, format: 'piper' }
    if (hasVits) return { onnxPath: wanted, format: 'vits' }
    throw new Error(`Không thấy file cấu hình của ${wanted} (Piper cần ${wanted}.json; VITS cần vocab.json + config.json)`)
  }
  const onnx = [...paths].filter((p) => p.endsWith('.onnx') && !p.includes('fp16'))
  if (hasVits && onnx.length) return { onnxPath: ONNX_PREFERRED.find((p) => paths.has(p)) ?? onnx[0], format: 'vits' }
  const piper = onnx.filter((p) => paths.has(p + '.json')).sort()
  if (piper.length) return { onnxPath: piper[0], format: 'piper' }
  if (!onnx.length) {
    throw new Error(
      `Repo ${repo} không có file .onnx (repo chỉ có .safetensors / .pth là bản PyTorch, app không chạy được) — cần bản ONNX: VITS (onnx/model.onnx + vocab.json + config.json) hoặc Piper (<tên>.onnx + <tên>.onnx.json)`
    )
  }
  throw new Error(`Repo ${repo} thiếu file cấu hình (VITS cần vocab.json + config.json; Piper cần <tên>.onnx.json)`)
}

let active: { modelId: string; controller: AbortController; paused: boolean } | null = null

export function currentTtsDownload(): { modelId: string } | null {
  return active ? { modelId: active.modelId } : null
}

export function pauseTtsDownload(): void {
  if (!active) return
  active.paused = true
  active.controller.abort()
}

/** Tải model TTS. true = xong, false = tạm dừng. Báo tiến trình qua onEvent. */
export async function downloadTtsModel(modelId: string, onEvent: (e: TtsDownloadEvent) => void): Promise<boolean> {
  if (active) throw new Error('Đang tải một model TTS khác')
  ttsModelDef(modelId)
  const spec = ttsRepo(modelId)
  if (!spec) throw new Error('Model này chưa có nguồn Hugging Face — bấm Sửa repo, nhập owner/ten-model có bản ONNX rồi tải lại')
  const { repo, file: wanted } = parseSpec(spec)
  const controller = new AbortController()
  active = { modelId, controller, paused: false }
  const dir = ttsModelDir(modelId)
  try {
    // Có chỉ định file → chỉ liệt kê thư mục chứa nó (+ root nếu ở thư mục con, cho VITS) — repo nhiều giọng rất lớn
    let files: HfEntry[]
    if (wanted) {
      const sub = wanted.includes('/') ? wanted.slice(0, wanted.lastIndexOf('/')) : ''
      files = await repoFiles(repo, sub)
      if (sub && !files.some((f) => f.path === wanted + '.json')) files = files.concat(await repoFiles(repo, ''))
    } else files = await repoFiles(repo, null)
    const { onnxPath, format } = pickModel(repo, files, wanted)
    const paths = new Set(files.map((f) => f.path))
    const entry = files.find((f) => f.path === onnxPath)!
    const size = Number(entry.lfs?.size ?? entry.size)
    const sha = entry.lfs?.oid ? String(entry.lfs.oid).toLowerCase() : ''

    await mkdir(dir, { recursive: true })
    // Nguồn khác bản đang cài → xoá bản cũ trước
    const old = installedSource(modelId)
    if (old && (old.repo !== spec || old.file !== onnxPath)) await unlink(join(dir, 'model.onnx')).catch(() => {})
    await unlink(join(dir, 'source.json')).catch(() => {})
    for (const f of CONFIG_FILES) await unlink(join(dir, f)).catch(() => {})

    const base = `https://huggingface.co/${repo}/resolve/main/`
    const configs: [string, string][] =
      format === 'piper'
        ? [[onnxPath + '.json', 'piper.json']]
        : (['vocab.json', 'config.json', 'tokenizer_config.json'].filter((f) => paths.has(f)).map((f) => [f, f]) as [string, string][])
    for (const [remote, local] of configs) {
      const r = await netFetch(base + encPath(remote), { signal: controller.signal, redirect: 'follow' }, 'Tải model TTS (cấu hình)')
      if (!r.ok) throw new Error(`Tải ${remote} thất bại (HTTP ${r.status})`)
      await writeFile(join(dir, local), Buffer.from(await r.arrayBuffer()))
    }

    const finalPath = join(dir, 'model.onnx')
    const partPath = finalPath + '.part'
    let start = existsSync(partPath) ? statSync(partPath).size : 0
    if (start > size) {
      await unlink(partPath)
      start = 0
    }
    const free = await diskFreeBytes(dir)
    if (free !== null && free < size - start + 50 * 1024 * 1024) {
      throw new Error(`Ổ đĩa không đủ dung lượng: cần ~${Math.ceil((size - start) / 1024 ** 2)} MB. Hãy đổi thư mục lưu model.`)
    }
    if (start < size) {
      const headers: Record<string, string> = { 'User-Agent': 'MasterScoring' }
      if (start > 0) headers.Range = `bytes=${start}-`
      const res = await netFetch(base + encPath(onnxPath) + '?download=true', { headers, signal: controller.signal, redirect: 'follow' }, 'Tải model TTS')
      if (res.status === 200 && start > 0) start = 0
      else if (!res.ok) throw new Error(`Tải model thất bại (HTTP ${res.status})`)
      if (!res.body) throw new Error('Không nhận được dữ liệu')
      const ws = createWriteStream(partPath, { flags: start > 0 ? 'a' : 'w' })
      let received = start
      let last = 0
      const reader = res.body.getReader()
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (!ws.write(value)) await new Promise<void>((r) => ws.once('drain', () => r()))
          received += value.length
          const now = Date.now()
          if (now - last > 400) {
            last = now
            onEvent({ modelId, phase: 'downloading', received, total: size, percent: (received / size) * 100 })
          }
        }
      } finally {
        await new Promise<void>((r) => ws.end(() => r()))
      }
      if (received < size) throw new Error('Kết nối bị ngắt trước khi tải xong. Bấm Tải để tải tiếp phần còn lại.')
    }
    if (sha) {
      onEvent({ modelId, phase: 'verifying', received: size, total: size, percent: 100 })
      const digest = await sha256File(partPath)
      if (digest !== sha) {
        await unlink(partPath).catch(() => {})
        throw new Error('File tải về không đúng SHA-256 (có thể bị hỏng). Hãy tải lại.')
      }
    }
    await rename(partPath, finalPath)
    const src: TtsSource = { repo: spec, file: onnxPath, sha256: sha, size, format }
    await writeFile(join(dir, 'source.json'), JSON.stringify(src, null, 2))
    onEvent({ modelId, phase: 'done', received: size, total: size, percent: 100 })
    return true
  } catch (e: any) {
    if (controller.signal.aborted && active?.paused) {
      onEvent({ modelId, phase: 'paused', received: partialBytes(modelId), total: 0, percent: 0 })
      return false
    }
    onEvent({ modelId, phase: 'error', received: 0, total: 0, percent: 0, message: e?.message ?? String(e) })
    throw e
  } finally {
    active = null
  }
}

export async function deleteTtsModel(id: string): Promise<void> {
  ttsModelDef(id)
  await rm(ttsModelDir(id), { recursive: true, force: true })
}
