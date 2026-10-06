// Điều phối Local AI: Chưa cài → Đang tải → Đang kiểm tra file → Đang khởi động → Sẵn sàng / Lỗi.
import type { AiStatus } from '@shared/types'
import { emit } from '../events'
import { getSettings, updateSettings } from '../settings'
import { configuredProviders } from './client'
import { getLocalState, runtimeAvailable, setLocalState, startLocal, stopLocal } from './llama'
import { currentDownload, downloadModel, isInstalled, pauseDownload } from './models'

export async function aiStatus(userId: number | null): Promise<AiStatus> {
  const s = getSettings(null)
  let local = getLocalState()
  if (local.kind === 'not_installed' && isInstalled(s.activeModelId)) local = { kind: 'stopped', modelId: s.activeModelId }
  return {
    local,
    activeModelId: s.activeModelId,
    cloudConfigured: userId ? configuredProviders(userId) : [],
    runtimeAvailable: await runtimeAvailable()
  }
}

export async function ensureLocalStarted(): Promise<void> {
  const s = getSettings(null)
  const st = getLocalState()
  if (st.kind === 'ready' || st.kind === 'starting' || st.kind === 'downloading' || st.kind === 'verifying') return
  if (!isInstalled(s.activeModelId)) {
    setLocalState({ kind: 'not_installed' })
    return
  }
  await startLocal(s.activeModelId)
}

/** Tải (nếu cần) rồi khởi động model. Chạy nền; trạng thái đẩy qua sự kiện ai:local. */
export async function installAndUse(modelId: string): Promise<void> {
  if (currentDownload()) throw new Error('Đang tải model')
  updateSettings(null, { activeModelId: modelId })
  if (!isInstalled(modelId)) {
    setLocalState({ kind: 'downloading', percent: 0, speed: 0, remainingSec: 0, paused: false, modelId })
    try {
      const done = await downloadModel(
        modelId,
        (p) => setLocalState({ kind: 'downloading', percent: p.percent, speed: p.speed, remainingSec: p.remainingSec, paused: false, modelId }),
        () => setLocalState({ kind: 'verifying', modelId })
      )
      if (!done) {
        const prev = getLocalState()
        setLocalState({
          kind: 'downloading',
          percent: prev.kind === 'downloading' ? prev.percent : 0,
          speed: 0,
          remainingSec: 0,
          paused: true,
          modelId
        })
        return
      }
      emit('ai:runtime-progress', 'Đã tải xong model')
    } catch (e: any) {
      setLocalState({ kind: 'error', message: e?.message ?? String(e), modelId })
      return
    }
  }
  await startLocal(modelId)
}

export function pauseModelDownload(): void {
  pauseDownload()
}

export async function switchModel(modelId: string): Promise<void> {
  if (!isInstalled(modelId)) throw new Error('Model chưa được tải')
  updateSettings(null, { activeModelId: modelId })
  await startLocal(modelId)
}

export async function restartLocal(): Promise<void> {
  await stopLocal()
  await ensureLocalStarted()
}
