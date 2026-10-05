// Tìm gcc/g++ trên máy; nếu không có thì tải MinGW-w64 portable (WinLibs) — chỉ khi có assignment C/C++.
import { execFile } from 'child_process'
import { createWriteStream, existsSync, statSync } from 'fs'
import { mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { emit } from '../events'
import { netFetch } from '../netlog'
import { paths } from '../paths'
import { getSettings } from '../settings'
import { extractZip } from '../zipUtil'

const isWin = process.platform === 'win32'

function which(cmd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(isWin ? 'where' : 'which', [cmd], { windowsHide: true }, (err, out) => {
      if (err) return resolve(null)
      resolve(out.split(/\r?\n/).find((l) => l.trim())?.trim() ?? null)
    })
  })
}

export async function findCompiler(lang: 'c' | 'cpp'): Promise<string | null> {
  const exe = (lang === 'c' ? 'gcc' : 'g++') + (isWin ? '.exe' : '')
  const custom = getSettings(null).mingwPath
  const candidates: string[] = []
  if (custom) {
    if (existsSync(custom) && statSync(custom).isFile()) candidates.push(custom)
    candidates.push(join(custom, exe), join(custom, 'bin', exe))
  }
  candidates.push(join(paths.runtime, 'mingw', 'bin', exe))
  for (const c of candidates) if (existsSync(c) && statSync(c).isFile()) return c
  return which(lang === 'c' ? 'gcc' : 'g++')
}

let downloading: Promise<void> | null = null

export function downloadMingw(): Promise<void> {
  if (!isWin) return Promise.reject(new Error('Chỉ tải MinGW trên Windows. Trên macOS/Linux hãy cài gcc/clang.'))
  if (!downloading) {
    downloading = doDownload().finally(() => {
      downloading = null
    })
  }
  return downloading
}

async function doDownload(): Promise<void> {
  const progress = (message: string, percent?: number): void => emit('mingw:progress', { message, percent })
  progress('Đang tìm bản MinGW-w64 (WinLibs)...')
  const res = await netFetch(
    'https://api.github.com/repos/brechtsanders/winlibs_mingw/releases?per_page=15',
    { headers: { 'User-Agent': 'MasterScoring', Accept: 'application/vnd.github+json' } },
    'Tải bộ compile MinGW (thông tin bản phát hành)'
  )
  if (!res.ok) throw new Error(`Không truy cập được GitHub (HTTP ${res.status})`)
  const releases: any[] = (await res.json()) as any[]
  const re = /^winlibs-x86_64-posix-seh-gcc-[\d.]+-mingw-w64ucrt-[\d.]+-r\d+\.zip$/
  let asset: any = null
  for (const r of releases) {
    if (r.prerelease) continue
    asset = r.assets.find((a: any) => re.test(a.name))
    if (asset) break
  }
  if (!asset) throw new Error('Không tìm thấy gói MinGW-w64 phù hợp')
  const zip = join(paths.runtime, 'mingw.zip')
  await mkdir(paths.runtime, { recursive: true })
  const dl = await netFetch(asset.browser_download_url, { headers: { 'User-Agent': 'MasterScoring' } }, 'Tải bộ compile MinGW')
  if (!dl.ok || !dl.body) throw new Error(`Tải MinGW thất bại (HTTP ${dl.status})`)
  const ws = createWriteStream(zip)
  const reader = dl.body.getReader()
  let got = 0
  let last = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!ws.write(value)) await new Promise<void>((r) => ws.once('drain', () => r()))
    got += value.length
    if (Date.now() - last > 400) {
      last = Date.now()
      progress(`Đang tải MinGW ${(got / 1048576).toFixed(0)} / ${(asset.size / 1048576).toFixed(0)} MB`, (got / asset.size) * 100)
    }
  }
  await new Promise<void>((r) => ws.end(() => r()))
  const dest = join(paths.runtime, 'mingw')
  await rm(dest, { recursive: true, force: true })
  await extractZip(zip, dest, {
    stripPrefix: true,
    onProgress: (d, t) => {
      if (d % 200 === 0) progress(`Đang giải nén MinGW ${d}/${t}`, (d / t) * 100)
    }
  })
  await rm(zip, { force: true })
  if (!existsSync(join(dest, 'bin', 'g++.exe'))) throw new Error('Gói MinGW tải về không có g++.exe')
  progress('MinGW đã sẵn sàng', 100)
}
