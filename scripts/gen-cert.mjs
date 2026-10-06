// Tạo chứng chỉ ký code tự ký (miễn phí) để ký bộ cài Windows:
//   build/cert/codesign.pfx              → khoá + chứng chỉ, electron-builder dùng để ký (KHÔNG chia sẻ)
//   build/cert/password.txt              → mật khẩu của file .pfx (KHÔNG chia sẻ)
//   build/cert/MasterScoring-CodeSign.cer → chứng chỉ công khai, gửi kèm bộ cài để máy người dùng tin tưởng
// Chạy lại an toàn: đã có thì bỏ qua (giữ cùng một chứng chỉ cho mọi bản build — hãy sao lưu thư mục build/cert).
// Cần openssl (macOS có sẵn; Windows: đi kèm Git for Windows). Không có openssl → cảnh báo, build không ký.
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const certDir = join(root, 'build', 'cert')
const pfx = join(certDir, 'codesign.pfx')
const cer = join(certDir, 'MasterScoring-CodeSign.cer')
const pwFile = join(certDir, 'password.txt')

if (existsSync(pfx) && existsSync(pwFile) && existsSync(cer)) {
  console.log('[cert] chứng chỉ ký code đã có, bỏ qua')
  process.exit(0)
}

try {
  execFileSync('openssl', ['version'], { stdio: 'ignore' })
} catch {
  console.warn('[cert] không tìm thấy openssl — bỏ qua tạo chứng chỉ, bộ cài sẽ KHÔNG được ký')
  process.exit(0)
}

mkdirSync(certDir, { recursive: true })
const key = join(certDir, 'codesign.key')
const crt = join(certDir, 'codesign.crt')
const cnf = join(certDir, 'openssl.cnf')
const password = randomBytes(18).toString('base64url')

writeFileSync(
  cnf,
  `[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = Master Scoring
O = Master Scoring
C = VN
[ext]
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
subjectKeyIdentifier = hash
`
)

const run = (args) => {
  try {
    execFileSync('openssl', args, { stdio: 'pipe' })
  } catch (e) {
    process.stderr.write(e.stderr ?? '')
    throw e
  }
}
// 10 năm — chữ ký có timestamp nên vẫn hợp lệ kể cả sau khi chứng chỉ hết hạn.
run(['req', '-x509', '-newkey', 'rsa:3072', '-sha256', '-days', '3650', '-nodes', '-keyout', key, '-out', crt, '-config', cnf])
// Mã hoá 3DES/SHA1 để signtool, osslsigncode và Windows cũ đều đọc được file .pfx.
run([
  'pkcs12', '-export', '-inkey', key, '-in', crt, '-out', pfx, '-name', 'Master Scoring Code Signing',
  '-certpbe', 'PBE-SHA1-3DES', '-keypbe', 'PBE-SHA1-3DES', '-macalg', 'sha1', '-passout', `pass:${password}`
])
run(['x509', '-in', crt, '-outform', 'DER', '-out', cer])
writeFileSync(pwFile, password)
for (const f of [key, crt, cnf]) rmSync(f, { force: true })

console.log(`[cert] đã tạo chứng chỉ ký code tự ký → ${certDir}`)
console.log('[cert] HÃY SAO LƯU thư mục build/cert — mất là các bản sau sẽ khác "nhà phát hành"')
