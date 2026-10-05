// Sao lưu / khôi phục dữ liệu, xem dung lượng đang dùng, dọn thư mục tạm.
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { rm, writeFile } from 'fs/promises'
import { join } from 'path'
import type { StorageUsage } from '@shared/types'
import { ensureDefaultAccount } from './auth'
import { exportDb, flush, reopenDbFrom } from './db'
import { paths } from './paths'
import { getSettings } from './settings'

function dirSize(dir: string): number {
  if (!existsSync(dir)) return 0
  let total = 0
  const stack = [dir]
  while (stack.length) {
    const d = stack.pop()!
    let entries
    try {
      entries = readdirSync(d, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const p = join(d, e.name)
      try {
        if (e.isDirectory()) stack.push(p)
        else total += statSync(p).size
      } catch {
        /* bỏ qua */
      }
    }
  }
  return total
}

export function storageUsage(): StorageUsage {
  return {
    data: dirSize(paths.data),
    models: dirSize(getSettings(null).modelsDir),
    runtime: dirSize(paths.runtime),
    work: dirSize(paths.work),
    logs: dirSize(paths.logs),
    root: paths.root
  }
}

export async function cleanWork(): Promise<void> {
  for (const e of readdirSync(paths.work)) await rm(join(paths.work, e), { recursive: true, force: true }).catch(() => {})
}

export async function backupTo(file: string): Promise<void> {
  flush()
  await writeFile(file, exportDb())
}

export async function restoreFrom(file: string): Promise<void> {
  const buf = readFileSync(file)
  if (buf.subarray(0, 16).toString('latin1') !== 'SQLite format 3\u0000') throw new Error('File sao lưu không hợp lệ')
  // Giữ bản hiện tại phòng khi cần quay lại
  await writeFile(join(paths.data, `app.before-restore-${Date.now()}.db`), exportDb())
  await reopenDbFrom(buf)
  await ensureDefaultAccount()
}
