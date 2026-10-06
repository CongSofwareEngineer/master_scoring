// Gọi electron-builder, tự gắn chứng chỉ ký code Windows (build/cert) nếu có.
//   node scripts/builder.mjs --win nsis --x64 --publish never
// Dùng WIN_CSC_* (chỉ áp dụng cho Windows) để không ảnh hưởng bước ký macOS.
// Nếu đã tự đặt WIN_CSC_LINK / CSC_LINK (chứng chỉ thật) thì giữ nguyên.
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const isWin = args.includes('--win') || args.includes('-w')
const certDir = join(root, 'build', 'cert')
const pfx = join(certDir, 'codesign.pfx')
const pwFile = join(certDir, 'password.txt')
const env = { ...process.env }

if (isWin && !env.WIN_CSC_LINK && !env.CSC_LINK) {
  if (existsSync(pfx) && existsSync(pwFile)) {
    env.WIN_CSC_LINK = pfx
    env.WIN_CSC_KEY_PASSWORD = readFileSync(pwFile, 'utf8').trim()
    console.log('[sign] ký bộ cài Windows bằng chứng chỉ tự ký build/cert/codesign.pfx')
  } else {
    console.warn('[sign] không có build/cert/codesign.pfx — bộ cài Windows sẽ KHÔNG được ký')
  }
}

const bin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder')
const res = spawnSync(bin, args, { stdio: 'inherit', env, shell: process.platform === 'win32' })
if (res.status !== 0) process.exit(res.status ?? 1)

// Gửi kèm chứng chỉ công khai + script cài đặt tin cậy cạnh bộ cài.
if (isWin && env.WIN_CSC_LINK === pfx) {
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const outDir = join(root, 'release', version)
  copyFileSync(join(certDir, 'MasterScoring-CodeSign.cer'), join(outDir, 'MasterScoring-CodeSign.cer'))
  copyFileSync(join(root, 'build', 'trust-cert.bat'), join(outDir, 'trust-cert.bat'))
  console.log(`[sign] đã chép MasterScoring-CodeSign.cer + trust-cert.bat vào ${outDir}`)
}
