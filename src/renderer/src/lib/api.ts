import type { ApiResult } from '@shared/types'

// Gọi IPC sang main process; lỗi được ném ra dạng Error để UI hiển thị toast.
export async function call<T = any>(channel: string, ...args: unknown[]): Promise<T> {
  const r = (await window.api.invoke(channel, ...args)) as ApiResult<T>
  if (!r || typeof r !== 'object') throw new Error('Phản hồi không hợp lệ từ ứng dụng')
  if (!r.ok) throw new Error(r.error)
  return r.data
}

export function on<T = any>(event: string, cb: (payload: T) => void): () => void {
  return window.api.on(event, cb as (p: unknown) => void)
}

export const platform = window.api.platform
