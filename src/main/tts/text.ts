// Chuẩn hoá văn bản tiếng Việt trước khi đưa vào model VITS (chỉ đọc được chữ cái có trong vocab):
// đọc số thành chữ, ký hiệu thường gặp, rồi tách thành đoạn theo dấu câu để chèn khoảng lặng.

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín']
const UNITS = ['', 'nghìn', 'triệu', 'tỷ']

// Đọc 3 chữ số. `full` = có nhóm đứng trước (cần đọc "không trăm", "linh").
function readTriple(n: number, full: boolean): string {
  const h = Math.floor(n / 100)
  const t = Math.floor((n % 100) / 10)
  const u = n % 10
  const out: string[] = []
  if (h > 0 || full) out.push(DIGITS[h], 'trăm')
  if (t === 0) {
    if (u > 0 && (h > 0 || full)) out.push('linh')
  } else if (t === 1) out.push('mười')
  else out.push(DIGITS[t], 'mươi')
  if (u > 0) {
    if (u === 1 && t >= 2) out.push('mốt')
    else if (u === 5 && t >= 1) out.push('lăm')
    else out.push(DIGITS[u])
  }
  return out.join(' ')
}

export function readInteger(s: string): string {
  const digits = s.replace(/^0+(?=\d)/, '')
  if (digits.length > 15) return readDigits(s)
  let n = Number(digits)
  if (n === 0) return 'không'
  const groups: number[] = []
  while (n > 0) {
    groups.push(n % 1000)
    n = Math.floor(n / 1000)
  }
  const parts: string[] = []
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i]
    if (g === 0) continue
    const unit = i < 4 ? UNITS[i] : UNITS[(i - 1) % 3 + 1] + ' tỷ'
    parts.push((readTriple(g, i < groups.length - 1) + ' ' + unit).trim())
  }
  return parts.join(' ')
}

function readDigits(s: string): string {
  return [...s].map((c) => DIGITS[Number(c)] ?? '').filter(Boolean).join(' ')
}

// Số dạng "1.234.567" (VN) hoặc "1,234,567"; thập phân "3,5" (VN) / "3.5".
function readNumberToken(tok: string): string {
  if (/^\d{1,3}(\.\d{3})+$/.test(tok)) return readInteger(tok.replace(/\./g, ''))
  if (/^\d{1,3}(,\d{3}){2,}$/.test(tok)) return readInteger(tok.replace(/,/g, ''))
  let m = tok.match(/^(\d+),(\d+)$/)
  if (m) return `${readInteger(m[1])} phẩy ${m[2].length > 2 ? readDigits(m[2]) : readInteger(m[2])}`
  m = tok.match(/^(\d+)\.(\d+)$/)
  if (m) return `${readInteger(m[1])} chấm ${m[2].length > 2 ? readDigits(m[2]) : readInteger(m[2])}`
  // số bắt đầu bằng 0 (số điện thoại, mã) → đọc từng chữ số
  if (/^0\d+$/.test(tok)) return readDigits(tok)
  return readInteger(tok)
}

const SYMBOLS: [RegExp, string][] = [
  [/%/g, ' phần trăm '],
  [/&/g, ' và '],
  [/\+/g, ' cộng '],
  [/=/g, ' bằng '],
  [/@/g, ' a còng '],
  [/#/g, ' thăng '],
  [/\$/g, ' đô la '],
  [/€/g, ' ơ rô '],
  [/₫/g, ' đồng '],
  [/°C/g, ' độ xê '],
  [/°/g, ' độ ']
]

// Chữ Latin không có trong bảng chữ tiếng Việt → phiên gần đúng
const LATIN: Record<string, string> = { f: 'ph', j: 'gi', w: 'u', z: 'd' }

export function normalizeVietnamese(input: string): string {
  let s = input.normalize('NFC')
  // ngày dd/mm/yyyy, dd/mm
  // (không thêm chữ "ngày" nếu văn bản đã có sẵn: "Ngày 07/11/2026")
  const day = (pre: string | undefined): string => (pre ? pre : ' ngày ')
  s = s.replace(/(ngày\s+)?\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/giu, (_m, pre, d, mo, y) => `${day(pre)}${readInteger(d)} tháng ${readInteger(mo)} năm ${readInteger(y)} `)
  s = s.replace(/(ngày\s+)?\b(\d{1,2})\/(\d{1,2})\b/giu, (_m, pre, d, mo) => `${day(pre)}${readInteger(d)} tháng ${readInteger(mo)} `)
  // giờ hh:mm
  s = s.replace(/\b(\d{1,2}):(\d{2})\b/g, (_m, h, mi) => ` ${readInteger(h)} giờ ${Number(mi) ? readInteger(mi) + ' phút' : ''} `)
  // khoảng số "5-10"
  s = s.replace(/(\d)\s*[-–]\s*(\d)/g, '$1 đến $2')
  // số âm
  s = s.replace(/(^|[\s(])-(\d)/g, '$1âm $2')
  s = s.replace(/\d+(?:[.,]\d+)*/g, (tok) => ` ${readNumberToken(tok)} `)
  for (const [re, rep] of SYMBOLS) s = s.replace(re, rep)
  s = s.toLowerCase().replace(/[fjwz]/g, (c) => LATIN[c] ?? c)
  return s
}

export interface TextSegment {
  text: string
  pauseAfter: number // giây lặng sau đoạn
  punct: string // dấu câu kết đoạn cho model Piper: . ! ? , ; : hoặc '' (đoạn bị cắt giữa câu)
}

/** Dấu câu kết đoạn (Piper có ký hiệu cho . , ! ? ; :) — xuống dòng / … coi như dấu chấm, ngoặc / gạch như dấu phẩy. */
function clausePunct(p: string): string {
  const c = /[.!?;:,]/.exec(p)?.[0]
  if (c) return c
  if (/[\n…]/.test(p)) return '.'
  return p ? ',' : ''
}

const MAX_SEGMENT = 280

/** Tách văn bản (đã chuẩn hoá) thành đoạn theo dấu câu; đoạn quá dài cắt theo khoảng trắng. */
export function splitSegments(text: string): TextSegment[] {
  const out: TextSegment[] = []
  const re = /([^.!?…;:\n,()\[\]{}"“”–—]+)([.!?…;:\n,()\[\]{}"“”–—]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const body = m[1].replace(/\s+/g, ' ').trim()
    const punct = m[2]
    const pause = /[\n]/.test(punct) ? 0.5 : /[.!?…;:]/.test(punct) ? 0.35 : punct ? 0.15 : 0.1
    if (!body) {
      if (out.length) {
        const last = out[out.length - 1]
        last.pauseAfter = Math.max(last.pauseAfter, pause)
        last.punct ||= clausePunct(punct)
      }
      continue
    }
    const words = body.split(' ')
    let cur = ''
    for (const w of words) {
      if (cur && cur.length + 1 + w.length > MAX_SEGMENT) {
        out.push({ text: cur, pauseAfter: 0.08, punct: '' })
        cur = w
      } else cur = cur ? cur + ' ' + w : w
    }
    if (cur) out.push({ text: cur, pauseAfter: pause, punct: clausePunct(punct) })
  }
  return out
}
