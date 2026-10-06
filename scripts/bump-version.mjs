// Tăng version trong package.json (+ package-lock.json) trước mỗi lần build.
// Mặc định tăng patch; chọn loại bằng tham số hoặc biến môi trường BUMP:
//   npm run build:win                → 1.0.3 → 1.0.4 (patch)
//   BUMP=minor npm run build:win     → 1.0.3 → 1.1.0
//   BUMP=major npm run build:win     → 1.0.3 → 2.0.0
//   BUMP=none npm run build:win      → giữ nguyên (build lại cùng version)
// Windows (cmd):        set BUMP=minor&& npm run build:win
// Windows (PowerShell): $env:BUMP='minor'; npm run build:win
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const kind = process.argv[2] || process.env.BUMP || 'patch'

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'))
}

function writeJson(p, data) {
  writeFileSync(p, JSON.stringify(data, null, 2) + '\n')
}

const pkgPath = join(root, 'package.json')
const pkg = readJson(pkgPath)

if (kind === 'none') {
  console.log(`[version] giữ nguyên ${pkg.version}`)
  process.exit(0)
}

const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(pkg.version)
if (!m) throw new Error(`Version không hợp lệ: ${pkg.version}`)
let [major, minor, patch] = m.slice(1).map(Number)
if (kind === 'major') (major++, (minor = 0), (patch = 0))
else if (kind === 'minor') (minor++, (patch = 0))
else if (kind === 'patch') patch++
else throw new Error(`Loại bump không hợp lệ: ${kind} (patch | minor | major | none)`)

const next = `${major}.${minor}.${patch}`
pkg.version = next
writeJson(pkgPath, pkg)

const lockPath = join(root, 'package-lock.json')
if (existsSync(lockPath)) {
  const lock = readJson(lockPath)
  lock.version = next
  if (lock.packages?.['']) lock.packages[''].version = next
  writeJson(lockPath, lock)
}

console.log(`[version] ${m[0]} → ${next}`)
