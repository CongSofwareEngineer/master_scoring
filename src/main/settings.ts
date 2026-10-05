import { DEFAULT_SETTINGS } from '@shared/constants'
import type { AppSettings } from '@shared/types'
import { all, run } from './db'
import { paths } from './paths'

// Cài đặt theo máy (user_id = 0) và cài đặt riêng từng giáo viên.
const PER_USER_KEYS: (keyof AppSettings)[] = ['lang', 'sidebarCollapsed']
const LEGACY_MSSV_PATTERN = '^\\d{2}\\.\\d{2}\\.\\d{3}\\.\\d{3}$'

function readRaw(userId: number): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const row of all<{ key: string; value: string }>('SELECT key, value FROM settings WHERE user_id = ?', [userId])) {
    try {
      out[row.key] = JSON.parse(row.value)
    } catch {
      /* bỏ qua giá trị hỏng */
    }
  }
  return out
}

export function getSettings(userId: number | null): AppSettings {
  const global = readRaw(0)
  const merged: AppSettings = { ...DEFAULT_SETTINGS, ...(global as Partial<AppSettings>) }
  if (userId) {
    const own = readRaw(userId)
    for (const k of PER_USER_KEYS) if (k in own) (merged as any)[k] = own[k]
  }
  // Mẫu MSSV mặc định cũ (dạng 50.01.902.001) → chuyển sang mặc định mới
  if (merged.mssvPattern === LEGACY_MSSV_PATTERN) merged.mssvPattern = DEFAULT_SETTINGS.mssvPattern
  if (!merged.modelsDir) merged.modelsDir = paths.models
  return merged
}

export function updateSettings(userId: number | null, patch: Partial<AppSettings>): AppSettings {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS)) continue
    const owner = userId && PER_USER_KEYS.includes(key as keyof AppSettings) ? userId : 0
    run('INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value', [
      owner,
      key,
      JSON.stringify(value)
    ])
  }
  return getSettings(userId)
}
