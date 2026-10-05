// Tải các thành phần runtime được đóng gói sẵn trong bộ cài:
//   node scripts/fetch-runtime.mjs win   → llama-server.exe (CPU + GPU Vulkan) → resources/runtime/llama/{cpu,vulkan}
//                                           + Visual C++ Redistributable x64     → build/vc_redist.x64.exe
//   node scripts/fetch-runtime.mjs mac   → llama-server (Metal) cho Apple Silicon + Intel
//                                           → resources/runtime-mac/{arm64,x64}/llama/cpu
// Chạy lại an toàn: phần nào đã có sẽ bỏ qua. Lỗi mạng chỉ cảnh báo, không chặn build
// (khi đó app sẽ tự tải llama-server lúc cài Local AI lần đầu).
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import yauzl from 'yauzl'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = process.argv[2] || 'win'
const buildDir = join(root, 'build')

async function download(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': 'MasterScoring-build' } })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} ${url}`)
  mkdirSync(dirname(dest), { recursive: true })
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
}

function extractZipFlat(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err)
      zip.readEntry()
      zip.on('entry', (entry) => {
        const name = entry.fileName.replace(/\\/g, '/')
        if (name.endsWith('/') || name.includes('..')) return zip.readEntry()
        const out = join(destDir, name.split('/').pop())
        zip.openReadStream(entry, (e, rs) => {
          if (e) return reject(e)
          mkdirSync(destDir, { recursive: true })
          rs.pipe(createWriteStream(out)).on('finish', () => zip.readEntry()).on('error', reject)
        })
      })
      zip.on('end', resolve)
      zip.on('error', reject)
    })
  })
}

async function llamaReleases(patterns) {
  const res = await fetch('https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=10', {
    headers: { 'User-Agent': 'MasterScoring-build', Accept: 'application/vnd.github+json' }
  })
  if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`)
  for (const r of await res.json()) {
    const found = {}
    for (const [k, re] of Object.entries(patterns)) found[k] = r.assets.find((a) => re.test(a.name))
    if (Object.values(found).every(Boolean)) return { tag: r.tag_name, assets: found }
  }
  throw new Error('Không tìm thấy bản phát hành llama.cpp phù hợp')
}

// Gói Windows kèm nhiều tool (llama-cli, llama-bench...) — chỉ giữ llama-server.exe và DLL cần thiết.
function pruneWin(dir) {
  for (const f of readdirSync(dir)) {
    const lower = f.toLowerCase()
    const extraExe = lower.endsWith('.exe') && lower !== 'llama-server.exe'
    const extraImpl = lower.endsWith('-impl.dll') && lower !== 'llama-server-impl.dll'
    if (extraExe || extraImpl) rmSync(join(dir, f), { force: true })
  }
}

async function fetchLlamaWin() {
  const runtimeDir = join(root, 'resources', 'runtime', 'llama')
  const variants = ['cpu', 'vulkan']
  if (variants.every((v) => existsSync(join(runtimeDir, v, 'llama-server.exe')))) {
    for (const v of variants) pruneWin(join(runtimeDir, v))
    console.log('[runtime] llama-server (Windows) đã có, bỏ qua')
    return
  }
  const rel = await llamaReleases({ cpu: /^llama-.*-bin-win-cpu-x64\.zip$/, vulkan: /^llama-.*-bin-win-vulkan-x64\.zip$/ })
  console.log(`[runtime] llama.cpp ${rel.tag} (Windows)`)
  for (const v of variants) {
    const asset = rel.assets[v]
    const dir = join(runtimeDir, v)
    const tmp = join(root, 'resources', 'runtime', `${v}.zip`)
    console.log(`[runtime] tải ${asset.name} (${(asset.size / 1048576).toFixed(1)} MB)`)
    await download(asset.browser_download_url, tmp)
    rmSync(dir, { recursive: true, force: true })
    await extractZipFlat(tmp, dir)
    rmSync(tmp, { force: true })
    pruneWin(dir)
    if (!existsSync(join(dir, 'llama-server.exe'))) throw new Error(`Thiếu llama-server.exe trong ${asset.name}`)
  }
  writeFileSync(join(runtimeDir, 'VERSION'), rel.tag)
}

// macOS: gói .tar.gz có symlink → chỉ giữ llama-server + thư viện nó cần (bỏ symlink, chép file thật).
async function fetchLlamaMac() {
  const base = join(root, 'resources', 'runtime-mac')
  const archs = ['arm64', 'x64']
  if (archs.every((a) => existsSync(join(base, a, 'llama', 'cpu', 'llama-server')))) {
    console.log('[runtime] llama-server (macOS) đã có, bỏ qua')
    return
  }
  const rel = await llamaReleases({ arm64: /^llama-.*-bin-macos-arm64\.tar\.gz$/, x64: /^llama-.*-bin-macos-x64\.tar\.gz$/ })
  console.log(`[runtime] llama.cpp ${rel.tag} (macOS)`)
  for (const arch of archs) {
    const asset = rel.assets[arch]
    const tmpDir = join(base, `_tmp-${arch}`)
    const tgz = join(base, `${arch}.tar.gz`)
    const dest = join(base, arch, 'llama', 'cpu')
    console.log(`[runtime] tải ${asset.name} (${(asset.size / 1048576).toFixed(1)} MB)`)
    await download(asset.browser_download_url, tgz)
    rmSync(tmpDir, { recursive: true, force: true })
    mkdirSync(tmpDir, { recursive: true })
    execFileSync('tar', ['-xzf', tgz, '-C', tmpDir, '--strip-components', '1'])
    rmSync(dest, { recursive: true, force: true })
    mkdirSync(dest, { recursive: true })
    const keep = readdirSync(tmpDir).filter((f) => f === 'llama-server' || f === 'LICENSE' || /^lib[^.]+\.0\.dylib$/.test(f) || /^libllama-server-impl\.dylib$/.test(f))
    for (const f of keep) {
      copyFileSync(join(tmpDir, f), join(dest, f)) // copyFileSync đi theo symlink → chép file thật
      if (f !== 'LICENSE') chmodSync(join(dest, f), 0o755)
    }
    rmSync(tmpDir, { recursive: true, force: true })
    rmSync(tgz, { force: true })
    if (!existsSync(join(dest, 'llama-server'))) throw new Error(`Thiếu llama-server trong ${asset.name}`)
    writeFileSync(join(base, arch, 'llama', 'VERSION'), rel.tag)
  }
}

async function fetchVcRedist() {
  const dest = join(buildDir, 'vc_redist.x64.exe')
  if (existsSync(dest)) {
    console.log('[runtime] vc_redist.x64.exe đã có, bỏ qua')
    return
  }
  console.log('[runtime] tải Visual C++ Redistributable x64')
  await download('https://aka.ms/vs/17/release/vc_redist.x64.exe', dest)
}

const tasks = target === 'mac' ? [['llama-server (macOS)', fetchLlamaMac]] : [['llama-server (Windows)', fetchLlamaWin], ['vc_redist', fetchVcRedist]]
mkdirSync(join(root, 'resources', 'runtime'), { recursive: true })
mkdirSync(join(root, 'resources', 'runtime-mac', 'arm64'), { recursive: true })
mkdirSync(join(root, 'resources', 'runtime-mac', 'x64'), { recursive: true })
for (const [name, fn] of tasks) {
  try {
    await fn()
  } catch (e) {
    console.warn(`[runtime] CẢNH BÁO: không tải được ${name}: ${e.message}`)
    console.warn('[runtime] Bộ cài vẫn build được; app sẽ tự tải thành phần này khi cần.')
  }
}
