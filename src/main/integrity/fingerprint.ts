// Fingerprint code giống MOSS: chuẩn hoá (bỏ comment/khoảng trắng, thay tên biến) → k-gram token → winnowing.
// Báo cáo Word / Excel / PowerPoint (đã chuyển thành văn bản): token = từ (chữ thường, bỏ dấu), k-gram K_TEXT từ.
import { decodeText } from '../importer/extract'
import { isCodeFile } from '../analysis/static'
import { REPORT_EXTS, fileExtension } from '@shared/submissionName'

export interface Fingerprint {
  files: string[]
  h: number[] // hash
  f: number[] // chỉ số file
  l: number[] // dòng
}

const K = 10
const W = 5
const K_TEXT = 8

const isDocText = (path: string): boolean => REPORT_EXTS.includes(fileExtension(path))

const KEYWORDS = new Set(
  (
    'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import ' +
    'instanceof int interface long native new package private protected public return short static super switch synchronized this throw throws transient try void volatile while ' +
    'auto bool delete friend inline namespace operator register signed sizeof struct template typedef typename union unsigned using virtual include define ' +
    'std cout cin endl printf scanf main vector string map set ' +
    'async await export from function let var yield of in typeof null undefined true false fun val when object override suspend data lateinit'
  ).split(' ')
)

interface Tok {
  t: string
  line: number
}

export function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  let line = 1
  const n = src.length
  while (i < n) {
    const c = src[i]
    if (c === '\n') {
      line++
      i++
      continue
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      i++
      continue
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') line++
        i++
      }
      i += 2
      continue
    }
    if (c === '#' && (i === 0 || src[i - 1] === '\n')) {
      // chỉ thị tiền xử lý: giữ từ khoá, bỏ phần còn lại
      while (i < n && src[i] !== '\n') i++
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c
      const startLine = line
      i++
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') i++
        else if (src[i] === '\n') line++
        i++
      }
      i++
      out.push({ t: 'S', line: startLine })
      continue
    }
    if (/[0-9]/.test(c)) {
      while (i < n && /[0-9a-fA-FxX._]/.test(src[i])) i++
      out.push({ t: 'N', line })
      continue
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i
      while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++
      const word = src.slice(i, j)
      out.push({ t: KEYWORDS.has(word) ? word : 'V', line })
      i = j
      continue
    }
    if (c === '{' || c === '}' || c === ';' || c === ',') {
      out.push({ t: c, line })
      i++
      continue
    }
    out.push({ t: c, line })
    i++
  }
  return out
}

// Văn bản báo cáo: mỗi từ là 1 token (bỏ dấu, chữ thường) → bắt được chép nguyên câu dù đổi hoa/thường, dấu câu.
export function tokenizeWords(src: string): Tok[] {
  const out: Tok[] = []
  src.split('\n').forEach((l, i) => {
    const norm = l.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()
    for (const w of norm.match(/[\p{L}\p{N}]+/gu) ?? []) out.push({ t: w, line: i + 1 })
  })
  return out
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function fingerprintFiles(files: Map<string, Buffer>): Fingerprint {
  const fp: Fingerprint = { files: [], h: [], f: [], l: [] }
  for (const [path, buf] of files) {
    const doc = isDocText(path)
    if (!doc && (!isCodeFile(path) || /\.(css|scss)$/i.test(path))) continue
    const toks = doc ? tokenizeWords(decodeText(buf)) : tokenize(decodeText(buf))
    const kk = doc ? K_TEXT : K
    if (toks.length < kk) continue
    const fi = fp.files.push(path) - 1
    const grams: { h: number; line: number }[] = []
    for (let i = 0; i + kk <= toks.length; i++) {
      let s = ''
      for (let k = 0; k < kk; k++) s += toks[i + k].t + '\u0001'
      grams.push({ h: fnv1a(s), line: toks[i].line })
    }
    let lastPicked = -1
    for (let i = 0; i + W <= grams.length; i++) {
      let minIdx = i
      for (let k = i; k < i + W; k++) if (grams[k].h <= grams[minIdx].h) minIdx = k
      if (minIdx !== lastPicked) {
        fp.h.push(grams[minIdx].h)
        fp.f.push(fi)
        fp.l.push(grams[minIdx].line)
        lastPicked = minIdx
      }
    }
    if (grams.length < W && grams.length) {
      fp.h.push(grams[0].h)
      fp.f.push(fi)
      fp.l.push(grams[0].line)
    }
  }
  return fp
}

// Toàn bộ k-gram (không winnowing) kèm khoảng dòng — dùng để đánh dấu từng dòng trùng code khung.
export function kgramSpans(text: string): { h: number; lineStart: number; lineEnd: number }[] {
  const toks = tokenize(text)
  const out: { h: number; lineStart: number; lineEnd: number }[] = []
  for (let i = 0; i + K <= toks.length; i++) {
    let s = ''
    for (let k = 0; k < K; k++) s += toks[i + k].t + '\u0001'
    out.push({ h: fnv1a(s), lineStart: toks[i].line, lineEnd: toks[i + K - 1].line })
  }
  return out
}

export function kgramSet(files: Map<string, Buffer>): Set<number> {
  const set = new Set<number>()
  for (const [path, buf] of files) {
    if (!isCodeFile(path) || /\.(css|scss)$/i.test(path)) continue
    for (const g of kgramSpans(decodeText(buf))) set.add(g.h)
  }
  return set
}

export interface CompareResult {
  similarity: number
  matches: { fileA: string; lineA: number; fileB: string; lineB: number }[]
}

export function compare(a: Fingerprint, b: Fingerprint, exclude: Set<number>): CompareResult | null {
  const firstA = new Map<number, number>()
  for (let i = 0; i < a.h.length; i++) if (!exclude.has(a.h[i]) && !firstA.has(a.h[i])) firstA.set(a.h[i], i)
  const firstB = new Map<number, number>()
  for (let i = 0; i < b.h.length; i++) if (!exclude.has(b.h[i]) && !firstB.has(b.h[i])) firstB.set(b.h[i], i)
  if (firstA.size < 8 || firstB.size < 8) return null
  const matches: CompareResult['matches'] = []
  let shared = 0
  for (const [h, ia] of firstA) {
    const ib = firstB.get(h)
    if (ib === undefined) continue
    shared++
    if (matches.length < 400) matches.push({ fileA: a.files[a.f[ia]], lineA: a.l[ia], fileB: b.files[b.f[ib]], lineB: b.l[ib] })
  }
  const similarity = ((shared / firstA.size + shared / firstB.size) / 2) * 100
  return { similarity: Math.round(similarity * 10) / 10, matches }
}
