// Quản lý model GGUF: tải từ Hugging Face (tạm dừng / tiếp tục / tải lại phần dở), kiểm tra SHA-256,
// kiểm tra dung lượng ổ trống, nhập file .gguf có sẵn.
import { createHash } from 'crypto'
import { createReadStream, createWriteStream, existsSync, statSync } from 'fs'
import { copyFile, mkdir, rename, unlink } from 'fs/promises'
import { join } from 'path'
import { MODELS } from '@shared/constants'
import type { ModelInfo } from '@shared/types'
import { diskFreeBytes } from '../hardware'
import { netFetch } from '../netlog'
import { getSettings } from '../settings'

export type ModelDef = (typeof MODELS)[number]

export function modelDef(id: string): ModelDef {
  const m = MODELS.find((x) => x.id === id)
  if (!m) throw new Error('Model không tồn tại: ' + id)
  return m
}

export function modelsDir(): string {
  return getSettings(null).modelsDir
}

export function modelPath(id: string): string {
  return join(modelsDir(), modelDef(id).file)
}

export function isInstalled(id: string): boolean {
  const p = modelPath(id)
  return existsSync(p) && statSync(p).size > 1024 * 1024
}

export function listModels(): ModelInfo[] {
  return MODELS.map((m) => ({
    id: m.id,
    name: m.name,
    repo: m.repo,
    file: m.file,
    sizeLabel: m.sizeLabel,
    approxBytes: m.approxBytes,
    note: m.note,
    installed: isInstalled(m.id),
    path: modelPath(m.id)
  }))
}

export interface DownloadProgress {
  modelId: string
  received: number
  total: number
  percent: number
  speed: number
  remainingSec: number
}

interface ActiveDownload {
  modelId: string
  controller: AbortController
  paused: boolean
}

let active: ActiveDownload | null = null

export function currentDownload(): { modelId: string; paused: boolean } | null {
  return active ? { modelId: active.modelId, paused: active.paused } : null
}

async function fetchMeta(def: ModelDef): Promise<{ sha256: string; size: number }> {
  const res = await netFetch(`https://huggingface.co/api/models/${def.repo}/tree/main`, {}, 'Tải model GGUF (thông tin file)')
  if (!res.ok) throw new Error(`Không lấy được thông tin model từ Hugging Face (HTTP ${res.status})`)
  const list: any[] = (await res.json()) as any[]
  const entry = list.find((e) => e.path === def.file)
  if (!entry?.lfs?.oid) throw new Error('Không tìm thấy file model trên Hugging Face')
  return { sha256: String(entry.lfs.oid).toLowerCase(), size: Number(entry.lfs.size ?? entry.size) }
}

export async function sha256File(path: string, onProgress?: (done: number, total: number) => void): Promise<string> {
  const total = statSync(path).size
  const hash = createHash('sha256')
  let done = 0
  let last = 0
  await new Promise<void>((resolve, reject) => {
    const rs = createReadStream(path, { highWaterMark: 4 * 1024 * 1024 })
    rs.on('data', (chunk) => {
      hash.update(chunk as Buffer)
      done += (chunk as Buffer).length
      const now = Date.now()
      if (now - last > 300) {
        last = now
        onProgress?.(done, total)
      }
    })
    rs.on('end', () => resolve())
    rs.on('error', reject)
  })
  return hash.digest('hex')
}

/**
 * Tải model. Trả về true nếu hoàn tất + đúng SHA-256, false nếu bị tạm dừng.
 */
export async function downloadModel(
  modelId: string,
  onProgress: (p: DownloadProgress) => void,
  onVerifying: (percent: number) => void
): Promise<boolean> {
  if (active) throw new Error('Đang tải một model khác')
  const def = modelDef(modelId)
  const dir = modelsDir()
  await mkdir(dir, { recursive: true })
  const finalPath = join(dir, def.file)
  const partPath = finalPath + '.part'
  const controller = new AbortController()
  active = { modelId, controller, paused: false }
  try {
    const meta = await fetchMeta(def)
    let start = existsSync(partPath) ? statSync(partPath).size : 0
    if (start > meta.size) {
      await unlink(partPath)
      start = 0
    }
    const free = await diskFreeBytes(dir)
    const need = meta.size - start + 200 * 1024 * 1024
    if (free !== null && free < need) {
      throw new Error(
        `Ổ đĩa không đủ dung lượng: cần ~${(need / 1024 ** 3).toFixed(1)} GB, còn trống ${(free / 1024 ** 3).toFixed(1)} GB. Hãy đổi thư mục lưu model.`
      )
    }
    if (start < meta.size) {
      const url = `https://huggingface.co/${def.repo}/resolve/main/${encodeURIComponent(def.file)}?download=true`
      const headers: Record<string, string> = { 'User-Agent': 'MasterScoring' }
      if (start > 0) headers.Range = `bytes=${start}-`
      const res = await netFetch(url, { headers, signal: controller.signal, redirect: 'follow' }, 'Tải model GGUF')
      if (res.status === 200 && start > 0) start = 0 // server không hỗ trợ Range → tải lại từ đầu
      else if (!res.ok) throw new Error(`Tải model thất bại (HTTP ${res.status})`)
      if (!res.body) throw new Error('Không nhận được dữ liệu')
      const ws = createWriteStream(partPath, { flags: start > 0 ? 'a' : 'w' })
      let received = start
      let lastTick = Date.now()
      let lastBytes = received
      let speed = 0
      const reader = res.body.getReader()
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (!ws.write(value)) await new Promise<void>((r) => ws.once('drain', () => r()))
          received += value.length
          const now = Date.now()
          if (now - lastTick >= 500) {
            const inst = ((received - lastBytes) * 1000) / (now - lastTick)
            speed = speed ? speed * 0.7 + inst * 0.3 : inst
            lastTick = now
            lastBytes = received
            onProgress({
              modelId,
              received,
              total: meta.size,
              percent: (received / meta.size) * 100,
              speed,
              remainingSec: speed > 0 ? (meta.size - received) / speed : 0
            })
          }
        }
      } finally {
        await new Promise<void>((r) => ws.end(() => r()))
      }
      if (received < meta.size) throw new Error('Kết nối bị ngắt trước khi tải xong. Bấm "Thử lại" để tải tiếp phần còn lại.')
    }
    onVerifying(0)
    const digest = await sha256File(partPath, (d, t) => onVerifying((d / t) * 100))
    if (digest !== meta.sha256) {
      await unlink(partPath).catch(() => {})
      throw new Error('File tải về không đúng SHA-256 (có thể bị hỏng). Hãy tải lại.')
    }
    await rename(partPath, finalPath)
    return true
  } catch (e: any) {
    if (controller.signal.aborted && active?.paused) return false
    throw e
  } finally {
    active = null
  }
}

export function pauseDownload(): void {
  if (!active) return
  active.paused = true
  active.controller.abort()
}

export function hasPartial(modelId: string): number {
  const p = modelPath(modelId) + '.part'
  return existsSync(p) ? statSync(p).size : 0
}

export async function importModelFile(modelId: string, source: string): Promise<void> {
  if (!source.toLowerCase().endsWith('.gguf')) throw new Error('Chỉ nhận file .gguf')
  const head = Buffer.alloc(4)
  const fh = await (await import('fs/promises')).open(source, 'r')
  try {
    await fh.read(head, 0, 4, 0)
  } finally {
    await fh.close()
  }
  if (head.toString('ascii') !== 'GGUF') throw new Error('File không phải định dạng GGUF hợp lệ')
  const dest = modelPath(modelId)
  await mkdir(modelsDir(), { recursive: true })
  const free = await diskFreeBytes(modelsDir())
  const size = statSync(source).size
  if (free !== null && free < size + 100 * 1024 * 1024) throw new Error('Ổ đĩa không đủ dung lượng để chép model')
  await copyFile(source, dest + '.part')
  await rename(dest + '.part', dest)
}

export async function deleteModel(modelId: string): Promise<void> {
  const p = modelPath(modelId)
  await unlink(p).catch(() => {})
  await unlink(p + '.part').catch(() => {})
}
