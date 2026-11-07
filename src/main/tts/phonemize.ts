// Chữ tiếng Việt → phiên âm IPA kiểu espeak-ng (giọng "vi") cho model Piper, bằng cách tra bảng âm tiết.
// Bảng vi-ipa.json sinh sẵn bởi scripts/gen-vi-ipa.mjs (app không kèm espeak-ng):
//   { "<âm tiết không dấu thanh>": "ipa ngang|huyền|sắc|hỏi|ngã|nặng" } — ô trống = không có dạng đó.
// Thanh ngang lưu dạng cuối mệnh đề (số 7); âm tiết không đứng cuối đoạn đổi 7 → 1 (giống espeak đọc cả câu).
import VI_IPA from './vi-ipa.json'

const TABLE = VI_IPA as Record<string, string>
const TONE: Record<string, number> = { '̀': 2, '́': 3, '̉': 4, '̃': 5, '̣': 6 }

function lookup(syllable: string): string | null {
  let tone = 1
  const base = syllable
    .normalize('NFD')
    .replace(/[̣̀́̉̃]/g, (c) => {
      tone = TONE[c]
      return ''
    })
    .normalize('NFC')
  const row = TABLE[base]
  return row ? row.split('|')[tone - 1] || null : null
}

/** Một đoạn (đã chuẩn hoá bằng normalizeVietnamese) → chuỗi IPA. Âm tiết không có trong bảng → thêm vào skipped, bỏ qua. */
export function vietnameseToIpa(text: string, skipped: Set<string>): string {
  const out: string[] = []
  for (const w of text.normalize('NFC').toLowerCase().split(/[^\p{L}]+/u)) {
    if (!w) continue
    const v = lookup(w)
    if (v) out.push(v)
    else skipped.add(w)
  }
  return out.map((v, i) => (i < out.length - 1 ? v.replace(/7/g, '1') : v)).join(' ')
}
