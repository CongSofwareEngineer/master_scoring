// API key được mã hoá bằng Electron safeStorage — trên Windows chính là DPAPI (gắn với tài khoản Windows).
import { safeStorage } from 'electron'
import { all, get, run } from './db'

export function saveSecret(userId: number, name: string, value: string): void {
  if (!value) {
    run('DELETE FROM secrets WHERE user_id = ? AND name = ?', [userId, name])
    return
  }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Hệ điều hành không hỗ trợ mã hoá an toàn (DPAPI)')
  const enc = safeStorage.encryptString(value).toString('base64')
  run('INSERT INTO secrets (user_id, name, value) VALUES (?, ?, ?) ON CONFLICT(user_id, name) DO UPDATE SET value = excluded.value', [
    userId,
    name,
    enc
  ])
}

export function readSecret(userId: number, name: string): string {
  const row = get<{ value: string }>('SELECT value FROM secrets WHERE user_id = ? AND name = ?', [userId, name])
  if (!row) return ''
  try {
    return safeStorage.decryptString(Buffer.from(row.value, 'base64'))
  } catch {
    return ''
  }
}

export function listSecretNames(userId: number): string[] {
  return all<{ name: string }>('SELECT name FROM secrets WHERE user_id = ?', [userId]).map((r) => r.name)
}
