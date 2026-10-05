// Mọi kết nối ra Internet đi qua netFetch để ghi nhật ký (Settings → Kết nối mạng).
import type { NetLogEntry } from '@shared/types'
import { all, nowIso, run } from './db'

export async function netFetch(url: string, init: RequestInit, purpose: string): Promise<Response> {
  const safeUrl = url.replace(/([?&](key|api_key|token)=)[^&]+/gi, '$1***')
  const { lastId } = run('INSERT INTO netlog (ts, url, purpose, status) VALUES (?, ?, ?, ?)', [nowIso(), safeUrl, purpose, '...'])
  try {
    const res = await fetch(url, init)
    run('UPDATE netlog SET status = ? WHERE id = ?', [String(res.status), lastId])
    return res
  } catch (e: any) {
    run('UPDATE netlog SET status = ? WHERE id = ?', ['lỗi: ' + (e?.message ?? e), lastId])
    throw e
  }
}

export function listNetLog(limit = 500): NetLogEntry[] {
  return all<NetLogEntry>('SELECT id, ts, url, purpose, status FROM netlog ORDER BY id DESC LIMIT ?', [limit])
}

export function clearNetLog(): void {
  run('DELETE FROM netlog')
}
