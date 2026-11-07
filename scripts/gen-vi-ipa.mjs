// Sinh bảng âm tiết tiếng Việt → phiên âm IPA kiểu espeak-ng (giọng "vi") cho model Piper:
//   src/main/tts/vi-ipa.json = { "<âm tiết không dấu thanh>": "ipa thanh 1|thanh 2|…|thanh 6" }
// Chỉ chạy trên máy dev khi cần sinh lại bảng — app KHÔNG kèm espeak-ng (18 MB, GPL-3), chỉ tra bảng.
// Thanh ngang (1) lưu dạng cuối mệnh đề (số 7); lúc đọc, âm tiết không đứng cuối đoạn đổi 7 → 1.
//
// Cách chạy (cần mạng để tải danh sách từ):
//   npm i --no-save espeak-ng@1.0.2   (hoặc đặt ESPEAK_NG_JS=<đường dẫn espeak-ng/dist/espeak-ng.js>)
//   node scripts/gen-vi-ipa.mjs
import { writeFileSync } from 'fs'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const WORDLIST = 'https://raw.githubusercontent.com/duyet/vietnamese-wordlist/master/Viet74K.txt'
const esPath = process.env.ESPEAK_NG_JS ?? createRequire(join(root, 'package.json')).resolve('espeak-ng/dist/espeak-ng.js')
const ESpeakNg = (await import(pathToFileURL(esPath).href)).default

async function ipa(text) {
  const es = await ESpeakNg({
    arguments: ['--phonout', 'out', '-q', '-b', '1', '--ipa', '-v', 'vi', '-f', '/in.txt'],
    preRun: [(m) => m.FS.writeFile('/in.txt', text)] // truyền qua file: argv làm hỏng chữ có dấu
  })
  return es.FS.readFile('out', { encoding: 'utf8' })
}

const MARK = { 2: '̀', 3: '́', 4: '̉', 5: '̃', 6: '̣' }
const SYL_RE = /^(ngh|ng|nh|ch|gh|gi|kh|ph|qu|th|tr|[bcdđghklmnpqrstvx])?([aăâeêioôơuưy]+)(ch|ng|nh|[cmnpt])?$/
const base = (s) => s.normalize('NFD').replace(/[̣̀́̉̃]/g, '').normalize('NFC')

// Đặt dấu thanh kiểu mới (hoà, thuỷ)
function place(b, tone) {
  if (tone === 1) return b
  const m = SYL_RE.exec(b)
  if (!m) return null
  const [, on = '', nuc, coda = ''] = m
  const chars = [...nuc]
  const sp = chars.findIndex((c) => 'ăâêôơư'.includes(c))
  const idx = nuc.includes('ươ')
    ? nuc.indexOf('ơ')
    : sp >= 0
      ? sp
      : chars.length === 1
        ? 0
        : coda || chars.length === 3 || ['oa', 'oe', 'uy'].includes(nuc)
          ? 1
          : 0
  chars[idx] = (chars[idx] + MARK[tone]).normalize('NFC')
  return on + chars.join('') + coda
}

const res = await fetch(WORDLIST)
if (!res.ok) throw new Error('Không tải được danh sách từ: HTTP ' + res.status)
const bases = new Set()
for (const w of (await res.text()).toLowerCase().normalize('NFC').split(/[\s\-]+/)) {
  const b = base(w)
  if (SYL_RE.test(b)) bases.add(b)
}
const items = []
for (const b of bases) {
  const stop = /(c|ch|p|t)$/.test(b) && !/(ng|nh)$/.test(b) // vần tắc chỉ có sắc / nặng
  for (let t = 1; t <= 6; t++) {
    if (stop && t !== 3 && t !== 6) continue
    const s = place(b, t)
    if (s) items.push([b, t, s])
  }
}
const table = {}
const CHUNK = 2000
for (let i = 0; i < items.length; i += CHUNK) {
  const chunk = items.slice(i, i + CHUNK)
  const lines = (await ipa(chunk.map((x) => x[2] + '.').join('\n') + '\n')).split('\n').filter((l) => l !== '')
  if (lines.length !== chunk.length) throw new Error(`Lệch số dòng ở lô ${i}: ${lines.length} ≠ ${chunk.length}`)
  chunk.forEach(([b, t], j) => {
    const v = lines[j].trim()
    // espeak đọc như tiếng Anh / đánh vần / không nhận ra nguyên âm (không có dấu trọng âm) → bỏ
    if (/[( ]/.test(v) || !/[ˈˌ]/.test(v)) return
    ;(table[b] ??= ['', '', '', '', '', ''])[t - 1] = v
  })
}
// espeak không nhận ra vài âm tiết thanh ngang (vd. "gi", "gin" → "z", "zn") → suy từ thanh huyền (2 → 7)
for (const v of Object.values(table)) {
  if (!v[0] && v[1] && (v[1].match(/2/g) ?? []).length === 1) v[0] = v[1].replace('2', '7')
}
const out = Object.fromEntries(Object.keys(table).sort().map((b) => [b, table[b].join('|')]))
writeFileSync(join(root, 'src/main/tts/vi-ipa.json'), JSON.stringify(out))
console.log(`Đã ghi ${Object.keys(out).length} âm tiết (${items.length} dạng có thanh) → src/main/tts/vi-ipa.json`)
