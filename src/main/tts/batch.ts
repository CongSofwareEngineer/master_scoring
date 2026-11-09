// TTS từ file: xuất hàng loạt — mỗi dòng → voice<N>.wav trong thư mục người dùng đã chọn (ghi đè file trùng tên).
// Thư mục chỉ chọn qua hộp thoại ở main (tts:pickFolder) và giữ theo user trong RAM; renderer chỉ gửi số thứ tự N,
// main tự ghép tên file → renderer không ghi được ra đường dẫn tuỳ ý.
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { TTS_BATCH_MAX_LINES } from '@shared/constants'
import type { TtsBatchEvent, TtsBatchItem, TtsBatchSummary, TtsRequest } from '@shared/types'
import { synthesize } from './engine'
import { installedSource } from './models'
import { vietnameseToIpa } from './phonemize'
import { normalizeVietnamese } from './text'

const folders = new Map<number, string>()
const running = new Map<number, { stop: boolean }>()

export function ttsBatchFolder(userId: number): string | null {
  return folders.get(userId) ?? null
}

export function setTtsBatchFolder(userId: number, folder: string): void {
  folders.set(userId, folder)
}

export function cancelTtsBatch(userId: number): void {
  const r = running.get(userId)
  if (r) r.stop = true
}

function fileName(n: unknown): string {
  const v = Number(n)
  if (!Number.isInteger(v) || v < 1 || v > TTS_BATCH_MAX_LINES) throw new Error('Số thứ tự file không hợp lệ')
  return `voice${v}.wav`
}

/** Đọc lại voice<N>.wav đã xuất (nghe lại trong màn xem trước). */
export async function readTtsBatchFile(userId: number, n: unknown): Promise<Uint8Array> {
  const folder = folders.get(userId)
  if (!folder) throw new Error('Chưa chọn thư mục lưu')
  const buf = await readFile(join(folder, fileName(n))).catch(() => {
    throw new Error(`Không tìm thấy ${fileName(n)} trong thư mục lưu`)
  })
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
}

/** Đọc lần lượt từng dòng → ghi voice<N>.wav. Dòng lỗi bỏ qua, chạy tiếp; Dừng thì ngưng sau dòng đang đọc. */
export async function runTtsBatch(
  userId: number,
  base: Omit<TtsRequest, 'text'>,
  items: TtsBatchItem[],
  emit: (e: TtsBatchEvent) => void
): Promise<TtsBatchSummary> {
  const folder = folders.get(userId)
  if (!folder) throw new Error('Chưa chọn thư mục lưu')
  if (running.has(userId)) throw new Error('Đang xuất file — chờ xong hoặc bấm Dừng')
  if (!Array.isArray(items) || !items.length) throw new Error('Chưa chọn dòng nào để xuất')
  if (items.length > TTS_BATCH_MAX_LINES) throw new Error(`Tối đa ${TTS_BATCH_MAX_LINES} dòng mỗi lần xuất`)
  const list = items.map((it) => ({ name: fileName(it.n), n: Number(it.n), text: String(it.text ?? '') }))
  await mkdir(folder, { recursive: true })
  const flag = { stop: false }
  running.set(userId, flag)
  let done = 0
  let failed = 0
  try {
    for (const it of list) {
      if (flag.stop) break
      emit({ userId, n: it.n, status: 'running' })
      try {
        const r = await synthesize(userId, { ...base, text: it.text }, () => {})
        await writeFile(join(folder, it.name), r.wav)
        done++
        emit({ userId, n: it.n, status: 'done', durationSec: r.durationSec })
      } catch (e: any) {
        // Dừng giữa dòng đang đọc → không tính là lỗi
        if (flag.stop) break
        failed++
        emit({ userId, n: it.n, status: 'error', message: e?.message ?? String(e) })
      }
    }
  } finally {
    running.delete(userId)
  }
  return { folder, done, failed, cancelled: flag.stop }
}

/**
 * Từ model Piper không đọc được trong từng dòng (từ tiếng Anh, viết tắt…) — cảnh báo ở màn xem trước.
 * Model VITS / chưa cài → trả mảng rỗng (VITS đánh vần theo chữ cái, không bỏ từ).
 */
export function checkTtsLines(modelId: string, lines: string[]): string[][] {
  const src = installedSource(String(modelId))
  const list = Array.isArray(lines) ? lines.slice(0, TTS_BATCH_MAX_LINES) : []
  if (src?.format !== 'piper') return list.map(() => [])
  return list.map((l) => {
    const skipped = new Set<string>()
    vietnameseToIpa(normalizeVietnamese(String(l ?? '')), skipped)
    return [...skipped].slice(0, 10)
  })
}
