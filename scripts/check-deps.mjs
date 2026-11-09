// Kiểm tra node_modules có đủ mọi gói trong "dependencies" của package.json (đúng phiên bản nếu ghim cứng) TRƯỚC khi
// build bộ cài. electron-vite để các gói này ở ngoài bundle (externalizeDepsPlugin) và electron-builder chỉ chép những gì
// đang có trong node_modules — thiếu gói (vd. git pull mà chưa `npm ci`) thì build vẫn "thành công" nhưng app lỗi lúc chạy
// ("Cannot find package 'onnxruntime-node'…").
//   node scripts/check-deps.mjs
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const problems = []

for (const [name, want] of Object.entries(pkg.dependencies ?? {})) {
  const file = join(root, 'node_modules', name, 'package.json')
  if (!existsSync(file)) {
    problems.push(`${name}@${want}: chưa cài`)
    continue
  }
  const have = JSON.parse(readFileSync(file, 'utf8')).version
  // Phiên bản ghim cứng (x.y.z) phải khớp tuyệt đối; dạng ^ / ~ chỉ cần có mặt.
  if (/^\d+\.\d+\.\d+$/.test(want) && have !== want) problems.push(`${name}: cần ${want}, đang có ${have}`)
}

if (problems.length) {
  console.error('[check-deps] node_modules không khớp package.json:')
  for (const p of problems) console.error(`  - ${p}`)
  console.error('[check-deps] Chạy `npm ci` (hoặc `npm install`) rồi build lại.')
  process.exit(1)
}
console.log(`[check-deps] OK — đủ ${Object.keys(pkg.dependencies ?? {}).length} gói dependencies`)
