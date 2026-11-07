// Model TTS (VITS ONNX, định dạng transformers.js) — tải từ Hugging Face, sửa repo, xoá.
// Thư mục: <modelsDir>/tts/<id>/ gồm model.onnx, vocab.json, config.json, tokenizer_config.json, source.json.
import { createWriteStream, existsSync, readFileSync, statSync } from 'fs'
import { mkdir, rename, rm, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { TTS_MODELS } from '@shared/constants'
import type { TtsDownloadEvent, TtsModelInfo } from '@shared/types'
import { sha256File } from '../ai/models'
import { diskFreeBytes } from '../hardware'
import { netFetch } from '../netlog'
import { getSettings } from '../settings'

export type TtsModelDef = (typeof TTS_MODELS)[number]

export interface TtsSource {
  repo: string
  file: string // đường dẫn file .onnx trong repo
  sha256: string
  size: number
}

export function ttsModelDef(id: string): TtsModelDef {
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

const REPO_RE = /^[A-Za-z0-9][\w.-]*\/[\w.-]+$/

function repoOverrides(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(join(ttsRoot(), 'repos.json'), 'utf8')) as Record<string, string>
  } catch {
    return {}
  }
}

export function ttsRepo(id: string): string {
  return repoOverrides()[id] ?? ttsModelDef(id).defaultRepo
}

export async function setTtsRepo(id: string, repo: string): Promise<void> {
  ttsModelDef(id)
  const r = repo.trim().replace(/^https?:\/\/huggingface\.co\//i, '').replace(/\/+$/, '')
  if (r && !REPO_RE.test(r)) throw new Error('Repo không hợp lệ — nhập dạng owner/ten-model (vd. Xenova/mms-tts-vie)')
  const all = repoOverrides()
  if (!r || r === ttsModelDef(id).defaultRepo) delete all[id]
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
      defaultRepo: m.defaultRepo,
      sizeLabel: m.sizeLabel,
      license: m.license,
      note: m.note,
      installed: !!src,
      installedRepo: src?.repo ?? null,
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

async function repoFiles(repo: string): Promise<HfEntry[]> {
  const res = await netFetch(`https://huggingface.co/api/models/${repo}/tree/main?recursive=true`, {}, 'Tải model TTS (danh sách file)')
  if (res.status === 401 || res.status === 403 || res.status === 404) {
    throw new Error(`Không truy cập được repo ${repo} trên Hugging Face (HTTP ${res.status}) — repo không tồn tại hoặc đang để private`)
  }
  if (!res.ok) throw new Error(`Không lấy được danh sách file của ${repo} (HTTP ${res.status})`)
  return (await res.json()) as HfEntry[]
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
  const repo = ttsRepo(modelId)
  if (!repo) throw new Error('Model này chưa có repo Hugging Face — nhập repo (owner/ten-model) có bản ONNX rồi tải lại')
  const controller = new AbortController()
  active = { modelId, controller, paused: false }
  const dir = ttsModelDir(modelId)
  try {
    const files = await repoFiles(repo)
    const paths = new Set(files.filter((f) => f.type === 'file').map((f) => f.path))
    const onnxPath =
      ONNX_PREFERRED.find((p) => paths.has(p)) ?? [...paths].find((p) => p.endsWith('.onnx') && !p.includes('fp16'))
    if (!onnxPath) {
      throw new Error(
        `Repo ${repo} không có file .onnx — app cần bản ONNX định dạng transformers.js (onnx/model.onnx + vocab.json + config.json)`
      )
    }
    for (const need of ['vocab.json', 'config.json']) {
      if (!paths.has(need)) throw new Error(`Repo ${repo} thiếu file ${need} (cần cho bộ tách chữ của model VITS)`)
    }
    const entry = files.find((f) => f.path === onnxPath)!
    const size = Number(entry.lfs?.size ?? entry.size)
    const sha = entry.lfs?.oid ? String(entry.lfs.oid).toLowerCase() : ''

    await mkdir(dir, { recursive: true })
    // Nguồn khác bản đang cài → xoá bản cũ trước
    const old = installedSource(modelId)
    if (old && (old.repo !== repo || old.file !== onnxPath)) await unlink(join(dir, 'model.onnx')).catch(() => {})
    await unlink(join(dir, 'source.json')).catch(() => {})

    const base = `https://huggingface.co/${repo}/resolve/main/`
    for (const f of ['vocab.json', 'config.json', 'tokenizer_config.json']) {
      if (!paths.has(f)) continue
      const r = await netFetch(base + f, { signal: controller.signal, redirect: 'follow' }, 'Tải model TTS (cấu hình)')
      if (!r.ok) throw new Error(`Tải ${f} thất bại (HTTP ${r.status})`)
      await writeFile(join(dir, f), Buffer.from(await r.arrayBuffer()))
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
      const res = await netFetch(base + onnxPath + '?download=true', { headers, signal: controller.signal, redirect: 'follow' }, 'Tải model TTS')
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
    const src: TtsSource = { repo, file: onnxPath, sha256: sha, size }
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
