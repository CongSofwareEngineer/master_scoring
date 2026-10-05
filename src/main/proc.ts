// Tiện ích tiến trình trên Windows: kill cả cây tiến trình, watchdog khi app bị crash, kiểm tra quyền Admin.
import { execFile, spawn, type ChildProcess } from 'child_process'

const isWin = process.platform === 'win32'

export function killTree(pid: number | undefined): void {
  if (!pid) return
  try {
    if (isWin) {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    } else {
      process.kill(pid, 'SIGKILL')
    }
  } catch {
    /* tiến trình đã kết thúc */
  }
}

// Watchdog: tiến trình PowerShell ẩn chờ app (PID hiện tại) kết thúc — kể cả crash — rồi kill tiến trình con.
export function attachWatchdog(child: ChildProcess): void {
  if (!child.pid) return
  if (!isWin) {
    // macOS/Linux: shell nền chờ app kết thúc rồi kill tiến trình con
    try {
      const w = spawn('/bin/sh', ['-c', `while kill -0 ${process.pid} 2>/dev/null; do sleep 2; done; kill -9 ${child.pid} 2>/dev/null`], {
        detached: true,
        stdio: 'ignore'
      })
      w.unref()
    } catch {
      /* bỏ qua */
    }
    return
  }
  const script = `try { Wait-Process -Id ${process.pid} -ErrorAction SilentlyContinue } catch {}; taskkill /PID ${child.pid} /T /F | Out-Null`
  try {
    const w = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script], {
      detached: true,
      windowsHide: true,
      stdio: 'ignore'
    })
    w.unref()
  } catch {
    /* PowerShell không khả dụng: vẫn còn cơ chế dọn PID lúc khởi động */
  }
}

// Bộ nhớ (MB) của 1 tiến trình — dùng để giới hạn RAM khi chạy test.
export function processMemoryMb(pid: number): Promise<number | null> {
  return new Promise((resolve) => {
    if (!isWin) {
      execFile('ps', ['-o', 'rss=', '-p', String(pid)], (err, out) => {
        if (err) return resolve(null)
        const kb = parseInt(out.trim(), 10)
        resolve(Number.isFinite(kb) ? kb / 1024 : null)
      })
      return
    }
    execFile('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { windowsHide: true }, (err, out) => {
      if (err) return resolve(null)
      const m = out.match(/"([\d.,\s]+)\s*K"/i)
      if (!m) return resolve(null)
      const kb = parseInt(m[1].replace(/[^\d]/g, ''), 10)
      resolve(Number.isFinite(kb) ? kb / 1024 : null)
    })
  })
}

export function processImageName(pid: number): Promise<string | null> {
  return new Promise((resolve) => {
    if (!isWin) {
      execFile('ps', ['-p', String(pid), '-o', 'comm='], (err, out) => resolve(err ? null : out.trim().split('/').pop() || null))
      return
    }
    execFile('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { windowsHide: true }, (err, out) => {
      if (err) return resolve(null)
      const m = out.match(/^"([^"]+)"/m)
      resolve(m ? m[1] : null)
    })
  })
}

let elevatedCache: boolean | null = null
export function isElevated(): Promise<boolean> {
  if (!isWin) return Promise.resolve(false)
  if (elevatedCache !== null) return Promise.resolve(elevatedCache)
  return new Promise((resolve) => {
    execFile('fltmc', [], { windowsHide: true }, (err) => {
      elevatedCache = !err
      resolve(elevatedCache)
    })
  })
}
