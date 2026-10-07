// Tải các thành phần runtime được đóng gói sẵn trong bộ cài:
//   node scripts/fetch-runtime.mjs win   → llama-server.exe (CPU + GPU Vulkan) → resources/runtime/llama/{cpu,vulkan}
//                                           + 7-Zip (7z.exe + 7z.dll)            → resources/runtime/7zip
//                                           + Visual C++ Redistributable x64     → build/vc_redist.x64.exe
//   node scripts/fetch-runtime.mjs mac   → llama-server (Metal) cho Apple Silicon + Intel
//                                           → resources/runtime-mac/{arm64,x64}/llama/cpu
//                                           + 7-Zip (7zz)                        → resources/runtime-mac/{arm64,x64}/7zip
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

// 7-Zip: đọc bài nộp .rar .7z .tar.gz .iso .dmg .arj... (bản chính thức từ 7-zip.org, giấy phép LGPL + unRAR).
const SEVEN_ZIP_VER = '2501' // 7-Zip 25.01
const sevenZipUrl = (name) => `https://www.7-zip.org/a/${name}`

// 7-Zip chạy được trên máy build — dùng để bóc bộ cài 7-Zip Windows (là file 7z SFX).
async function hostSevenZip(tmp) {
  if (process.platform === 'win32') {
    const exe = join(tmp, '7zr.exe')
    await download(sevenZipUrl('7zr.exe'), exe)
    return exe
  }
  const name = process.platform === 'darwin' ? `7z${SEVEN_ZIP_VER}-mac.tar.xz` : `7z${SEVEN_ZIP_VER}-linux-${process.arch === 'arm64' ? 'arm64' : 'x64'}.tar.xz`
  const txz = join(tmp, name)
  await download(sevenZipUrl(name), txz)
  execFileSync('tar', ['-xJf', txz, '-C', tmp, '7zz'])
  chmodSync(join(tmp, '7zz'), 0o755)
  return join(tmp, '7zz')
}

async function fetchSevenZipWin() {
  const dest = join(root, 'resources', 'runtime', '7zip')
  if (existsSync(join(dest, '7z.exe')) && existsSync(join(dest, '7z.dll'))) {
    console.log('[runtime] 7-Zip (Windows) đã có, bỏ qua')
    return
  }
  const tmp = join(root, 'resources', 'runtime', '_tmp-7zip')
  rmSync(tmp, { recursive: true, force: true })
  mkdirSync(tmp, { recursive: true })
  try {
    console.log(`[runtime] tải 7-Zip ${SEVEN_ZIP_VER} (Windows x64)`)
    const installer = join(tmp, `7z${SEVEN_ZIP_VER}-x64.exe`)
    await download(sevenZipUrl(`7z${SEVEN_ZIP_VER}-x64.exe`), installer)
    const bin = await hostSevenZip(tmp)
    rmSync(dest, { recursive: true, force: true })
    execFileSync(bin, ['x', installer, `-o${dest}`, '-y', '-bso0', '-bsp0', '7z.exe', '7z.dll', 'License.txt'])
    if (!existsSync(join(dest, '7z.exe')) || !existsSync(join(dest, '7z.dll'))) throw new Error('Thiếu 7z.exe / 7z.dll trong bộ cài 7-Zip')
    writeFileSync(join(dest, 'VERSION'), SEVEN_ZIP_VER)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

// macOS: 7zz là universal binary (arm64 + x64) → chép vào cả 2 kiến trúc.
async function fetchSevenZipMac() {
  const base = join(root, 'resources', 'runtime-mac')
  const archs = ['arm64', 'x64']
  if (archs.every((a) => existsSync(join(base, a, '7zip', '7zz')))) {
    console.log('[runtime] 7-Zip (macOS) đã có, bỏ qua')
    return
  }
  const tmp = join(base, '_tmp-7zip')
  rmSync(tmp, { recursive: true, force: true })
  mkdirSync(tmp, { recursive: true })
  try {
    console.log(`[runtime] tải 7-Zip ${SEVEN_ZIP_VER} (macOS)`)
    const txz = join(tmp, '7z-mac.tar.xz')
    await download(sevenZipUrl(`7z${SEVEN_ZIP_VER}-mac.tar.xz`), txz)
    execFileSync('tar', ['-xJf', txz, '-C', tmp, '7zz', 'License.txt'])
    for (const arch of archs) {
      const dest = join(base, arch, '7zip')
      mkdirSync(dest, { recursive: true })
      copyFileSync(join(tmp, '7zz'), join(dest, '7zz'))
      copyFileSync(join(tmp, 'License.txt'), join(dest, 'License.txt'))
      chmodSync(join(dest, '7zz'), 0o755)
      writeFileSync(join(dest, 'VERSION'), SEVEN_ZIP_VER)
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
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

const tasks =
  target === 'mac'
    ? [['llama-server (macOS)', fetchLlamaMac], ['7-Zip (macOS)', fetchSevenZipMac]]
    : [['llama-server (Windows)', fetchLlamaWin], ['7-Zip (Windows)', fetchSevenZipWin], ['vc_redist', fetchVcRedist]]
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
