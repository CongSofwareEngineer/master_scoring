// Chạy tiến trình (compile / test code sinh viên) có giới hạn: thời gian, RAM, dung lượng output.
// Quá giới hạn → kill cả cây tiến trình. Không bao giờ chạy khi app đang có quyền Administrator.
import { spawn } from 'child_process'
import { killTree, processMemoryMb } from '../proc'

export interface RunOptions {
  cwd: string
  input?: string
  timeoutMs: number
  memoryLimitMb?: number
  maxOutputBytes?: number
  env?: NodeJS.ProcessEnv
}

export interface RunResult {
  stdout: string
  stderr: string
  exitCode: number | null
  timeMs: number
  timedOut: boolean
  memExceeded: boolean
  outputExceeded: boolean
  spawnError?: string
}

export function runProcess(cmd: string, args: string[], opts: RunOptions): Promise<RunResult> {
  return new Promise((resolve) => {
    const started = Date.now()
    const maxOut = opts.maxOutputBytes ?? 1024 * 1024
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let memExceeded = false
    let outputExceeded = false
    let finished = false
    let child
    try {
      child = spawn(cmd, args, { cwd: opts.cwd, windowsHide: true, env: opts.env ?? process.env, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (e: any) {
      resolve({ stdout: '', stderr: '', exitCode: null, timeMs: 0, timedOut: false, memExceeded: false, outputExceeded: false, spawnError: e.message })
      return
    }
    const kill = (): void => killTree(child.pid)
    const timer = setTimeout(() => {
      timedOut = true
      kill()
    }, opts.timeoutMs)
    let memTimer: NodeJS.Timeout | null = null
    if (opts.memoryLimitMb && child.pid) {
      memTimer = setInterval(async () => {
        if (finished) return
        const mb = await processMemoryMb(child.pid!)
        if (mb !== null && mb > opts.memoryLimitMb!) {
          memExceeded = true
          kill()
        }
      }, 250)
    }
    child.stdout.on('data', (d: Buffer) => {
      if (stdout.length + d.length > maxOut) {
        outputExceeded = true
        kill()
        return
      }
      stdout += d.toString('utf8')
    })
    child.stderr.on('data', (d: Buffer) => {
      if (stderr.length < maxOut) stderr += d.toString('utf8')
    })
    child.on('error', (e: Error) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      if (memTimer) clearInterval(memTimer)
      resolve({ stdout, stderr, exitCode: null, timeMs: Date.now() - started, timedOut, memExceeded, outputExceeded, spawnError: e.message })
    })
    child.on('close', (code: number | null) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      if (memTimer) clearInterval(memTimer)
      resolve({ stdout, stderr, exitCode: code, timeMs: Date.now() - started, timedOut, memExceeded, outputExceeded })
    })
    child.stdin.on('error', () => {
      /* chương trình không đọc stdin */
    })
    if (opts.input !== undefined) child.stdin.end(opts.input)
    else child.stdin.end()
  })
}
