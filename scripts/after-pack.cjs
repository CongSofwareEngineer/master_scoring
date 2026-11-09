// electron-builder afterPack: kiểm tra bản đóng gói có đủ onnxruntime-node (TTS) trước khi tạo bộ cài .exe / .dmg.
// Thiếu → dừng build (không phát hành bộ cài lỗi "Cannot find package 'onnxruntime-node'").
//   - app.asar phải có node_modules/onnxruntime-node + onnxruntime-common (tính cả mục được unpack)
//   - app.asar.unpacked phải có binary onnxruntime_binding.node của đúng nền tảng / kiến trúc
//     (ngoại lệ: macOS x64 — onnxruntime-node 1.31.1 không có bản darwin/x64, chỉ cảnh báo)
const { existsSync, readdirSync } = require('node:fs')
const { join } = require('node:path')

const ARCH = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' }

function resourcesDir(context) {
  if (context.electronPlatformName === 'darwin' || context.electronPlatformName === 'mas') {
    const app = readdirSync(context.appOutDir).find((f) => f.endsWith('.app'))
    return join(context.appOutDir, app ?? `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
  }
  return join(context.appOutDir, 'resources')
}

function asarFiles(asarPath) {
  try {
    const asar = require('@electron/asar')
    return new Set(asar.listPackage(asarPath).map((p) => p.replace(/\\/g, '/').replace(/^\//, '')))
  } catch (e) {
    console.warn(`  • [after-pack] không đọc được app.asar (${e.message}) — bỏ qua kiểm tra trong asar`)
    return null
  }
}

exports.default = async function afterPack(context) {
  const platform = context.electronPlatformName
  const arch = ARCH[context.arch] ?? String(context.arch)
  const res = resourcesDir(context)
  const errors = []

  const files = asarFiles(join(res, 'app.asar'))
  if (files) {
    for (const f of ['node_modules/onnxruntime-node/package.json', 'node_modules/onnxruntime-common/package.json']) {
      if (!files.has(f)) errors.push(`app.asar thiếu ${f}`)
    }
  }

  const binDir = join(res, 'app.asar.unpacked', 'node_modules', 'onnxruntime-node', 'bin', 'napi-v6', platform, arch)
  if (!existsSync(join(binDir, 'onnxruntime_binding.node'))) {
    if (platform === 'darwin' && arch === 'x64') {
      console.warn('  • [after-pack] onnxruntime-node không có bản darwin/x64 — bản Mac Intel sẽ không chạy được TTS')
    } else {
      errors.push(`thiếu binary ${platform}/${arch}: ${binDir}/onnxruntime_binding.node`)
    }
  }

  if (errors.length) {
    throw new Error(
      `[after-pack] Bản đóng gói ${platform}/${arch} thiếu onnxruntime-node (TTS):\n  - ${errors.join('\n  - ')}\n` +
        'Chạy `npm ci` để cài đủ node_modules rồi build lại.'
    )
  }
  console.log(`  • [after-pack] onnxruntime-node OK (${platform}/${arch})`)
}
