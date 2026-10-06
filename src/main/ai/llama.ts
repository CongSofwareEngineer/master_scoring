// Local AI: chạy llama-server (llama.cpp) như tiến trình phụ — giống LM Studio.
// Chỉ lắng nghe 127.0.0.1, cổng trống chọn tự động, tắt cùng app (watchdog + dọn PID khi khởi động).
import { app } from 'electron'
import { spawn, execFile, type ChildProcess } from 'child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { mkdir, rm } from 'fs/promises'
import net from 'net'
import os from 'os'
import { join } from 'path'
import type { LocalState } from '@shared/types'
import { emit } from '../events'
import { getHardware } from '../hardware'
import { netFetch } from '../netlog'
import { bundledRuntimeDir, paths } from '../paths'
import { attachWatchdog, killTree, processImageName } from '../proc'
import { getSettings } from '../settings'
import { extractZip } from '../zipUtil'
import { modelDef, modelPath, isInstalled } from './models'

type Variant = 'cpu' | 'vulkan'

let child: ChildProcess | null = null
let state: LocalState = { kind: 'not_installed' }
let port = 0
let stderrTail: string[] = []
let stopping = false

export function getLocalState(): LocalState {
  return state
}

export function setLocalState(s: LocalState): void {
  state = s
  emit('ai:local', s)
}

export function localBaseUrl(): string | null {
  return state.kind === 'ready' ? `http://127.0.0.1:${port}/v1` : null
}

const pidFile = (): string => join(paths.runtime, 'llama.pid')

// Dọn llama-server còn sót lại từ lần chạy trước (app bị crash / tắt máy đột ngột).
export async function cleanupStale(): Promise<void> {
  const f = pidFile()
  if (!existsSync(f)) return
  try {
    const pid = parseInt(readFileSync(f, 'utf8'), 10)
    if (pid) {
      const name = await processImageName(pid)
      if (name && /llama-server/i.test(name)) killTree(pid)
    }
  } catch {
    /* bỏ qua */
  }
  try {
    unlinkSync(f)
  } catch {
    /* bỏ qua */
  }
}

function exeName(): string {
  return process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'
}

function findInPath(cmd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(process.platform === 'win32' ? 'where' : 'which', [cmd], { windowsHide: true }, (err, out) => {
      if (err) return resolve(null)
      const first = out.split(/\r?\n/).find((l) => l.trim())
      resolve(first ? first.trim() : null)
    })
  })
}

export async function findServer(variant: Variant): Promise<string | null> {
  const candidates = [join(bundledRuntimeDir(), 'llama', variant, exeName()), join(paths.runtime, 'llama', variant, exeName())]
  // Dev trên macOS: runtime tải bằng `npm run fetch:runtime:mac` nằm theo kiến trúc CPU
  if (process.platform === 'darwin' && !app.isPackaged) {
    candidates.push(join(app.getAppPath(), 'resources', 'runtime-mac', process.arch, 'llama', variant, exeName()))
  }
  for (const c of candidates) if (existsSync(c)) return c
  // Linux / macOS: dùng llama-server cài sẵn (vd. `brew install llama.cpp`)
  if (process.platform !== 'win32') return findInPath('llama-server')
  return null
}

export async function runtimeAvailable(): Promise<boolean> {
  return !!(await findServer('cpu')) || !!(await findServer('vulkan'))
}

// Tải llama-server khi bộ cài không kèm sẵn (Windows: zip; macOS: tar.gz bản Metal).
export async function downloadRuntime(variant: Variant, onProgress: (msg: string) => void): Promise<string> {
  const isMac = process.platform === 'darwin'
  if (process.platform !== 'win32' && !isMac) throw new Error('Trên Linux hãy cài llama.cpp (llama-server) vào PATH')
  const res = await netFetch(
    'https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=10',
    { headers: { 'User-Agent': 'MasterScoring', Accept: 'application/vnd.github+json' } },
    'Tải llama-server (thông tin bản phát hành)'
  )
  if (!res.ok) throw new Error(`Không truy cập được GitHub (HTTP ${res.status})`)
  const releases: any[] = (await res.json()) as any[]
  const re = isMac
    ? new RegExp(`^llama-.*-bin-macos-${process.arch === 'arm64' ? 'arm64' : 'x64'}\\.tar\\.gz$`)
    : new RegExp(`^llama-.*-bin-win-${variant}-x64\\.zip$`)
  let asset: any = null
  for (const r of releases) {
    asset = r.assets.find((a: any) => re.test(a.name))
    if (asset) break
  }
  if (!asset) throw new Error('Không tìm thấy bản llama-server phù hợp')
  const dir = join(paths.runtime, 'llama', variant)
  const archive = join(paths.runtime, `llama-${variant}${isMac ? '.tar.gz' : '.zip'}`)
  await mkdir(paths.runtime, { recursive: true })
  const dl = await netFetch(asset.browser_download_url, { headers: { 'User-Agent': 'MasterScoring' } }, 'Tải llama-server')
  if (!dl.ok || !dl.body) throw new Error(`Tải llama-server thất bại (HTTP ${dl.status})`)
  const { createWriteStream } = await import('fs')
  const ws = createWriteStream(archive)
  const reader = dl.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!ws.write(value)) await new Promise<void>((r) => ws.once('drain', () => r()))
  }
  await new Promise<void>((r) => ws.end(() => r()))
  await rm(dir, { recursive: true, force: true })
  if (isMac) {
    await mkdir(dir, { recursive: true })
    await new Promise<void>((resolve, reject) =>
      execFile('tar', ['-xzf', archive, '-C', dir, '--strip-components', '1'], (err) => (err ? reject(err) : resolve()))
    )
  } else {
    await extractZip(archive, dir, { flatten: true })
  }
  await rm(archive, { force: true })
  const exe = join(dir, exeName())
  if (!existsSync(exe)) throw new Error('Gói tải về không có llama-server')
  onProgress('Đã tải xong llama-server')
  return exe
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const p = (srv.address() as net.AddressInfo).port
      srv.close(() => resolve(p))
    })
  })
}

async function chooseVariant(): Promise<Variant> {
  // macOS: một bản duy nhất (CPU + Metal)
  if (process.platform === 'darwin') return 'cpu'
  const s = getSettings(null)
  if (s.llamaVariant === 'cpu' || s.llamaVariant === 'vulkan') return s.llamaVariant
  const hw = await getHardware(s.modelsDir)
  if (hw.discreteGpu && (await findServer('vulkan'))) return 'vulkan'
  return 'cpu'
}

// Số layer đưa lên GPU cho bản "cpu": Apple Silicon dùng Metal (unified memory) → đưa toàn bộ.
function cpuVariantGpuLayers(modelId: string): number {
  if (process.platform === 'darwin' && process.arch === 'arm64') {
    const s = getSettings(null)
    return s.gpuLayers >= 0 ? s.gpuLayers : modelDef(modelId).layers + 1
  }
  return 0
}

function describeExit(code: number | null): string {
  const tail = stderrTail.slice(-6).join('\n')
  if (code === 3221225781 || code === -1073741515) {
    return 'Thiếu Visual C++ Runtime (vcruntime140.dll). Hãy cài "Microsoft Visual C++ Redistributable x64" rồi thử lại.'
  }
  if (code === 3221225501 || code === -1073741795) return 'CPU không hỗ trợ tập lệnh của bản llama-server này. Hãy chọn bản CPU trong Settings → AI Models.'
  if (/out of memory|failed to allocate|ErrorOutOfDeviceMemory/i.test(tail)) return 'Không đủ bộ nhớ (RAM/VRAM) để nạp model. Hãy giảm context hoặc chuyển sang chạy CPU.'
  if (/failed to load model|error loading model/i.test(tail)) return 'Không nạp được file model (file hỏng?). Hãy xoá model và tải lại.\n' + tail
  return `llama-server dừng bất thường (mã ${code}).\n${tail}`
}

async function launch(modelId: string, variant: Variant, gpuLayers: number): Promise<void> {
  const exe = (await findServer(variant)) ?? (await downloadRuntime(variant, (m) => emit('ai:runtime-progress', m)))
  const s = getSettings(null)
  port = await freePort()
  const args = ['-m', modelPath(modelId), '--host', '127.0.0.1', '--port', String(port), '-c', String(s.contextSize), '-np', '1']
  const threads = s.threads > 0 ? s.threads : Math.max(1, Math.min(8, os.cpus().length - 1))
  args.push('-t', String(threads))
  args.push('-ngl', String(gpuLayers))
  stderrTail = []
  stopping = false
  const proc = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  child = proc
  attachWatchdog(proc)
  if (proc.pid) writeFileSync(pidFile(), String(proc.pid))
  const onData = (d: Buffer): void => {
    for (const line of d.toString().split(/\r?\n/)) {
      if (!line.trim()) continue
      stderrTail.push(line)
      if (stderrTail.length > 60) stderrTail.shift()
    }
  }
  proc.stdout?.on('data', onData)
  proc.stderr?.on('data', onData)

  const exited = new Promise<number | null>((resolve) => proc.once('exit', (code) => resolve(code)))
  proc.once('exit', (code) => {
    if (child === proc) child = null
    try {
      unlinkSync(pidFile())
    } catch {
      /* bỏ qua */
    }
    if (!stopping && state.kind === 'ready') setLocalState({ kind: 'error', message: describeExit(code), modelId })
  })

  const deadline = Date.now() + 5 * 60_000
  for (;;) {
    const r = await Promise.race([exited.then((c) => ({ exit: c })), new Promise((res) => setTimeout(() => res(null), 700))])
    if (r && typeof r === 'object' && 'exit' in r) throw new Error(describeExit((r as any).exit))
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`)
      if (res.ok) break
    } catch {
      /* chưa sẵn sàng */
    }
    if (Date.now() > deadline) {
      killTree(proc.pid)
      throw new Error('llama-server khởi động quá lâu (quá 5 phút).')
    }
  }
  const label =
    variant === 'vulkan' ? `GPU Vulkan (${gpuLayers} layer)` : process.platform === 'darwin' && gpuLayers > 0 ? `Apple Metal (${gpuLayers} layer)` : 'CPU'
  setLocalState({ kind: 'ready', modelId, variant: label, port })
}

export async function startLocal(modelId?: string): Promise<void> {
  const s = getSettings(null)
  const id = modelId ?? s.activeModelId
  if (!isInstalled(id)) {
    setLocalState({ kind: 'not_installed' })
    return
  }
  await stopLocal()
  setLocalState({ kind: 'starting', modelId: id })
  const variant = await chooseVariant()
  try {
    if (variant === 'vulkan') {
      const layers = s.gpuLayers >= 0 ? s.gpuLayers : modelDef(id).layers + 1
      try {
        await launch(id, 'vulkan', layers)
        return
      } catch (e) {
        if (s.llamaVariant === 'vulkan') throw e
        // GPU không đủ VRAM / lỗi driver → tự chuyển về CPU
        await stopLocal()
        setLocalState({ kind: 'starting', modelId: id })
      }
    }
    await launch(id, 'cpu', cpuVariantGpuLayers(id))
  } catch (e: any) {
    setLocalState({ kind: 'error', message: e?.message ?? String(e), modelId: id })
  }
}

export async function stopLocal(): Promise<void> {
  const proc = child
  if (!proc) return
  stopping = true
  const exited = new Promise<void>((r) => proc.once('exit', () => r()))
  killTree(proc.pid)
  await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))])
  child = null
  if (state.kind === 'ready' || state.kind === 'starting') setLocalState({ kind: 'stopped', modelId: (state as any).modelId })
}

export function stopLocalSync(): void {
  if (child) {
    stopping = true
    killTree(child.pid)
    child = null
  }
}
