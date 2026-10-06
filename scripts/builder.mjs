// Gọi electron-builder, tự gắn chứng chỉ ký code Windows (build/cert) nếu có.
//   node scripts/builder.mjs --win nsis --x64 --publish never
// Dùng WIN_CSC_* (chỉ áp dụng cho Windows) để không ảnh hưởng bước ký macOS.
// Nếu đã tự đặt WIN_CSC_LINK / CSC_LINK (chứng chỉ thật) thì giữ nguyên.
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

// Chứng chỉ công khai nhúng vào bộ cài (build/installer.nsh) để NSIS tự thêm vào store
// của user lúc cài — người dùng chỉ cần chạy 1 file .exe, không cần .cer / trust-cert.bat kèm.
const embeddedCer = join(root, 'build', 'embedded-signer.cer')
const cer = join(certDir, 'MasterScoring-CodeSign.cer')
const selfSigned = isWin && env.WIN_CSC_LINK === pfx && existsSync(cer)
if (selfSigned) {
  copyFileSync(cer, embeddedCer)
} else {
  rmSync(embeddedCer, { force: true })
}

const bin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder')
const res = spawnSync(bin, args, { stdio: 'inherit', env, shell: process.platform === 'win32' })
if (res.status !== 0) process.exit(res.status ?? 1)

// Gửi kèm chứng chỉ công khai + script cài đặt tin cậy cạnh bộ cài (phương án thủ công).
if (selfSigned) {
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const outDir = join(root, 'release', version)
  copyFileSync(cer, join(outDir, 'MasterScoring-CodeSign.cer'))
  copyFileSync(join(root, 'build', 'trust-cert.bat'), join(outDir, 'trust-cert.bat'))

  // setup.bat: người dùng tải 2 file (Setup.exe + setup.bat) rồi chạy 1 lần —
  //   1) nhúng chứng chỉ (base64) + certutil -user -addstore (không cần Admin)
  //   2) Unblock-File gỡ Mark-of-the-Web → SmartScreen ("More info → Run anyway") không kích hoạt
  //   3) chạy bộ cài (truyền nguyên tham số, vd. `setup.bat /S` để cài im lặng)
  // Văn bản ASCII để cmd không lỗi mã hoá; dòng CRLF để Windows đọc được.
  const b64 = readFileSync(cer).toString('base64')
  const certLines = (b64.match(/.{1,64}/g) ?? []).map((l) => `echo ${l}`).join('\r\n')
  const bat = [
    '@echo off',
    'setlocal',
    'set "DIR=%~dp0"',
    '',
    'echo [1/3] Installing the signing certificate (current user, no Admin)...',
    '> "%TEMP%\\ms-signer.b64" (',
    certLines,
    ')',
    'certutil -f -decode "%TEMP%\\ms-signer.b64" "%TEMP%\\ms-signer.cer" >nul',
    'if errorlevel 1 goto :fail',
    'certutil -user -f -addstore Root "%TEMP%\\ms-signer.cer" >nul',
    'certutil -user -f -addstore TrustedPublisher "%TEMP%\\ms-signer.cer" >nul',
    'del /q "%TEMP%\\ms-signer.b64" "%TEMP%\\ms-signer.cer" >nul 2>&1',
    '',
    'echo [2/3] Removing the "downloaded from internet" mark so Windows does not warn...',
    'powershell -NoProfile -Command "Get-ChildItem -LiteralPath $env:DIR -Filter \'MasterScoring-Setup-*.exe\' | Unblock-File" >nul 2>&1',
    '',
    'echo [3/3] Starting the installer...',
    'set "SETUP="',
    'for %%f in ("%DIR%MasterScoring-Setup-*.exe") do if exist "%%~ff" set "SETUP=%%~ff"',
    'if not defined SETUP goto :nofile',
    '"%SETUP%" %*',
    'exit /b %errorlevel%',
    '',
    ':fail',
    'echo [ERROR] Could not install the signing certificate.',
    'goto :end',
    '',
    ':nofile',
    'echo [ERROR] MasterScoring-Setup-*.exe not found next to setup.bat.',
    'goto :end',
    '',
    ':end',
    'echo.',
    'pause',
    'exit /b 1',
    '',
  ].join('\r\n')
  writeFileSync(join(outDir, 'setup.bat'), bat)

  console.log(`[sign] đã chép MasterScoring-CodeSign.cer + trust-cert.bat + sinh setup.bat vào ${outDir}`)
}
