// Ước lượng % code do AI viết và tách phần sinh viên tự viết.
// 1. Chia mỗi file thành đoạn (hàm / khối code giữa các hàm), kèm comment ngay phía trên hàm.
// 2. Tính đặc trưng phong cách cho từng đoạn → xác suất AI (mô hình logistic, trọng số chọn tay).
//    Dấu hiệu AI: comment kiểu chatbot, Javadoc/JSDoc đầy đủ, tên biến dài kiểu mô tả, cú pháp vượt mức môn học,
//    format đồng đều tuyệt đối, chuỗi thông báo tiếng Anh trau chuốt, emoji...
//    Dấu hiệu sinh viên: format lệch, viết dính "for(int i=0;i<n;i++)", tên biến tiếng Việt, code bị comment lại,
//    dấu vết debug, thói quen kiểu system("pause") / getch()...
// 3. Đoạn có phong cách khác hẳn phần "giống sinh viên" của chính bài đó → tăng xác suất AI (bài trộn).
// 4. Dòng trùng code khung / file sinh tự động → không tính.
// 5. Có nhận định của LLM → trộn vào.
// Đây là ƯỚC LƯỢNG thống kê để giáo viên xem xét, không phải bằng chứng.
import type { AiConfidence, AiEstimate, AiSegment } from '@shared/types'
import { decodeText } from '../importer/extract'
import { kgramSpans } from './fingerprint'

export interface LlmAiHint {
  percent: number | null
  segments: { file: string; lineStart: number; lineEnd: number; origin: 'ai' | 'student' }[]
}

type Lang = 'c' | 'cpp' | 'java' | 'kotlin' | 'js'

const AUTHORED = /\.(java|kt|js|jsx|ts|tsx|mjs|cjs|c|cpp|cc|cxx|h|hpp|hh)$/i

// File do IDE / công cụ sinh ra: coi như code khung.
const GENERATED = [
  /(^|\/)Example(Unit|Instrumented)Test\.(java|kt)$/,
  /(^|\/)(R|BuildConfig)\.java$/,
  /\.d\.ts$/,
  /(^|\/)(next|tailwind|postcss|eslint|vite|jest|babel|prettier|webpack)\.config\.(js|mjs|cjs|ts)$/,
  /\.min\.js$/,
  /(^|\/)(reportWebVitals|setupTests)\.(js|ts)$/
]

function langOf(path: string): Lang {
  const p = path.toLowerCase()
  if (p.endsWith('.java')) return 'java'
  if (p.endsWith('.kt')) return 'kotlin'
  if (/\.(c|h)$/.test(p)) return 'c'
  if (/\.(cpp|cc|cxx|hpp|hh)$/.test(p)) return 'cpp'
  return 'js'
}

// ───────────── Chia đoạn ─────────────

const FN_SIG =
  /^\s*(?:(?:public|private|protected|static|final|async|export|default|inline|virtual|const|override|suspend|fun|function|synchronized|abstract)\s+)*[\w<>[\],\s*&:~?]+\s+\**&?(\w+)\s*\([^;{}]*\)?\s*(?:const)?\s*(?:throws [\w.,\s]+)?\s*(?::\s*[\w<>[\],\s|?.]+)?\s*\{?\s*$/
const ARROW_SIG = /^\s*(?:export\s+)?(?:default\s+)?(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*(?::\s*[^=]+)?=>\s*[{(]?\s*$/
const NOT_FN = /^(if|for|while|switch|catch|return|else|new|do|try|sizeof|elif)$/

function stripForBraces(l: string): string {
  return l.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/.*$/g, '')
}

function blockEnd(lines: string[], start: number, limit: number): number {
  let depth = 0
  let started = false
  for (let k = start; k <= limit; k++) {
    for (const ch of stripForBraces(lines[k])) {
      if (ch === '{') {
        depth++
        started = true
      } else if (ch === '}') depth--
    }
    if (started && depth <= 0) return k
    if (!started && k > start + 2) return -1
  }
  return -1
}

// Lùi lên để lấy comment / annotation ngay phía trên hàm.
function leadingStart(lines: string[], start: number, floor: number): number {
  let s = start
  while (s - 1 >= floor) {
    const l = lines[s - 1].trim()
    if (/^(\/\/|\/\*|\*|\*\/|@\w+)/.test(l)) s--
    else break
  }
  return s
}

interface Range {
  start: number // 0-based, gồm cả hai đầu
  end: number
}

function segmentRange(lines: string[], from: number, to: number, depth: number): Range[] {
  const fns: Range[] = []
  for (let i = from; i <= to; i++) {
    const m = lines[i].match(FN_SIG) ?? lines[i].match(ARROW_SIG)
    if (!m || NOT_FN.test(m[1])) continue
    const end = blockEnd(lines, i, to)
    if (end < 0 || end - i < 1) continue
    const prevEnd = fns.length ? fns[fns.length - 1].end : from - 1
    fns.push({ start: Math.max(leadingStart(lines, i, prevEnd + 1), prevEnd + 1), end })
    i = end
  }
  const out: Range[] = []
  let cursor = from
  for (const f of fns) {
    if (f.start > cursor) out.push({ start: cursor, end: f.start - 1 })
    // Hàm rất dài (component React, hàm main lớn): tách tiếp một cấp
    if (depth === 0 && f.end - f.start > 70) {
      const inner = segmentRange(lines, f.start + 1, f.end - 1, 1)
      if (inner.length > 1) {
        out.push({ start: f.start, end: f.start }, ...inner, { start: f.end, end: f.end })
        cursor = f.end + 1
        continue
      }
    }
    out.push(f)
    cursor = f.end + 1
  }
  if (cursor <= to) out.push({ start: cursor, end: to })
  // Gộp các mảnh nhỏ liền nhau (ngoài hàm) để đủ dữ liệu
  const merged: Range[] = []
  for (const r of out) {
    const last = merged[merged.length - 1]
    if (last && codeCount(lines, r) < 3 && codeCount(lines, last) < 12) last.end = r.end
    else merged.push({ ...r })
  }
  return merged
}

function codeCount(lines: string[], r: Range): number {
  let n = 0
  for (let i = r.start; i <= r.end; i++) if (lines[i].trim()) n++
  return n
}

// ───────────── Đặc trưng ─────────────

const CHATBOT =
  /\b(step\s*\d+|helper (function|method)|this (function|method|class|component|hook) (will|is used|handles|returns|takes|checks|calculates)|function to\b|method to\b|handles? the\b|initiali[sz]e[sd]? the\b|validates? (the )?(user )?input|ensures? (that )?|check (if|whether)|edge case|time complexity|space complexity|o\(n( log n)?\)|example usage|usage:|here we|we (need|use|can|will)|main (function|logic|entry)|utility function|in a real (app|application|project)|for simplicity|you can|feel free|make sure|best practice|optional:|note:|important:|returns? (true|false|the)\b|@returns?|@param|@brief|@author|@throws)/i
// ChatGPT trả lời bằng tiếng Việt cũng có văn phong riêng
const VI_CHATBOT =
  /(bước \d+|hàm (này )?(dùng để|có nhiệm vụ|thực hiện|sẽ)|kiểm tra (xem|nếu|điều kiện|tính hợp lệ)|khởi tạo|duyệt qua (từng|tất cả|mảng|danh sách)|trả về (kết quả|giá trị|true|false)|lưu ý:|ví dụ( sử dụng)?:|đảm bảo|xử lý (trường hợp|ngoại lệ|lỗi)|độ phức tạp|hàm (chính|phụ trợ|tiện ích)|nhập dữ liệu từ người dùng)/i
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}\u{274C}]/u
const VI_DIACRITIC = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i
const VI_WORDS =
  /\b(ham|nhap|xuat|tinh|tong|dem|mang|kiem tra|ket qua|chuong trinh|bai|cau|so luong|phan tu|danh sach|sinh vien|hien thi|tim|sap xep|vong lap|bien|gia tri|lam|chay|xong|sua|thu)\b/i
const VI_IDENT =
  /^(tong|dem|mang|ketqua|kq|sl|soluong|nhap|xuat|ds|dssv|sv|tb|diem|ten|tuoi|hoten|chuoi|kytu|vitri|vt|tim|timkiem|sapxep|hoanvi|giatri|gt|so|songuyen|sochan|sole|tich|thuong|hieu|dau|cuoi|dong|cot|matran|ngay|thang|nam|luachon|chon|menu|thoat|kiemtra|kt|ktra|nguyento|hople|nhapmang|xuatmang|tinhtong|danhsach|phantu|pt|bien|dem\d*|tong\d*|a\d|b\d|n\d|arr\d)$/i
const POLISHED_STR =
  /(please (enter|try|provide|select)|invalid (input|choice|option|number|value)|error:|enter (the|a|an|number|your)|must be (a|an|greater|positive|between)|cannot be|successfully|failed to|something went wrong|an error occurred|is not valid|out of range|thank you|goodbye|welcome to|loading\.\.\.)/i
const STUDENT_HABIT =
  /(system\s*\(\s*"(pause|cls)"\s*\)|\bgetch\s*\(|<conio\.h>|fflush\s*\(\s*stdin\s*\)|\bvoid\s+main\s*\(|<bits\/stdc\+\+\.h>|printf\s*\(\s*"(debug|test|check|here|ok)|cout\s*<<\s*"(debug|test|check|here|ok)|System\.out\.println\s*\(\s*"(test|debug|here|ok|aaa)|console\.log\s*\(\s*["'`](test|here|ok|aaa|debug|1|2)["'`]|Log\.d\s*\(\s*"(test|aaa|debug)")/i
const COMMENTED_CODE = /^(\/\/|\/\*|\*)\s*.*(;\s*$|\)\s*\{?\s*$|^\s*(\/\/|\/\*)\s*(int|float|double|char|for|if|while|return|printf|cout|cin|scanf|System\.|console\.|const|let|var)\b)/
const BANNER = /^\s*(\/\/|\/\*|\*)\s*([=\-*#~]{4,}|.*[=\-]{4,}\s*$)/

const ADVANCED: Record<Lang, [RegExp, string][]> = {
  cpp: [
    [/std::numeric_limits/, 'numeric_limits'],
    [/\bconstexpr\b/, 'constexpr'],
    [/\bnoexcept\b/, 'noexcept'],
    [/\[\[\s*(nodiscard|maybe_unused)\s*\]\]/, '[[nodiscard]]'],
    [/std::(optional|variant|unique_ptr|shared_ptr|make_unique|make_shared|string_view|ranges|move|forward)\b/, 'std:: hiện đại'],
    [/\bstatic_cast\s*</, 'static_cast'],
    [/\bconst\s+auto\s*&|\bauto\s*&\s*\w+\s*:/, 'const auto&'],
    [/\[[&=]?\]\s*\([^)]*\)\s*(->\s*\w+\s*)?\{/, 'lambda'],
    [/std::(accumulate|transform|for_each|count_if|find_if|all_of|any_of)\b/, 'thuật toán STL'],
    [/\bthrow\s+std::\w+|catch\s*\(\s*const\s+std::/, 'exception std::'],
    [/cin\.clear\s*\(\s*\)|cin\.ignore\s*\(/, 'xử lý lỗi nhập cin.clear/ignore'],
    [/\btemplate\s*</, 'template'],
    [/\bstd::size_t\b|\bsize_t\b/, 'size_t']
  ],
  c: [
    [/\bsize_t\b/, 'size_t'],
    [/fgets\s*\([^)]*stdin\s*\)[\s\S]{0,80}strcspn|strcspn\s*\(/, 'fgets + strcspn'],
    [/\bEXIT_(FAILURE|SUCCESS)\b/, 'EXIT_FAILURE/SUCCESS'],
    [/\bperror\s*\(/, 'perror'],
    [/while\s*\(\s*scanf\s*\([^)]*\)\s*!=\s*1/, 'kiểm tra scanf != 1'],
    [/while\s*\(\s*\(\s*\w+\s*=\s*getchar\s*\(\s*\)\s*\)\s*!=\s*'\\n'\s*&&/, 'xả bộ đệm getchar'],
    [/sizeof\s*\(\s*\*\s*\w+\s*\)/, 'sizeof(*ptr)'],
    [/\bconst\s+char\s*\*\s*const\b|\bstatic\s+inline\b/, 'const/inline nâng cao'],
    [/#define\s+\w+\s*\(.*\)\s*\(/, 'macro hàm'],
    [/\bstrtol\s*\(|\bstrtod\s*\(/, 'strtol/strtod'],
    [/\bbool\b.*<stdbool\.h>|#include\s*<stdbool\.h>/, 'stdbool.h']
  ],
  java: [
    [/\.stream\s*\(\s*\)/, 'Stream API'],
    [/\bOptional\s*</, 'Optional'],
    [/Objects\.requireNonNull|@NonNull|@Nullable/, '@NonNull / requireNonNull'],
    [/\b(ExecutorService|CompletableFuture|Executors\.)/, 'Executor/CompletableFuture'],
    [/String\.format\s*\(\s*Locale/, 'String.format(Locale)'],
    [/catch\s*\(\s*(NumberFormatException|IllegalArgumentException|IllegalStateException)/, 'catch exception cụ thể'],
    [/\bthrow new Illegal(Argument|State)Exception/, 'throw IllegalArgumentException'],
    [/->\s*\{|::\w+/, 'lambda / method reference'],
    [/\bTextUtils\.isEmpty|\bTAG\s*=\s*\w+\.class\.getSimpleName/, 'TextUtils / TAG chuẩn'],
    [/\bfinal\s+\w+(<[^>]+>)?\s+\w+\s*=/, 'final biến cục bộ'],
    [/\b(record|sealed|var)\s+\w+/, 'cú pháp Java mới']
  ],
  kotlin: [
    [/\?\.let\s*\{|\?:\s*return|\brequireNotNull\b/, 'null-safety nâng cao'],
    [/\b(sealed|data)\s+class\b/, 'sealed/data class'],
    [/\b(viewModelScope|lifecycleScope|Flow<|StateFlow|collectAsState)\b/, 'coroutine/Flow'],
    [/\.(map|filter|fold|associate|groupBy)\s*\{/, 'collection API'],
    [/\brunCatching\b|\bwhen\s*\(.*\)\s*\{[\s\S]*->/, 'runCatching/when']
  ],
  js: [
    [/\buse(Callback|Memo|Reducer)\s*\(/, 'useCallback/useMemo/useReducer'],
    [/\bAbortController\b/, 'AbortController'],
    [/\bPromise\.(all|allSettled|race)\s*\(/, 'Promise.all'],
    [/catch\s*\(\s*(err|error|e)\s*\)\s*\{\s*console\.error\s*\(\s*['"`][A-Z][\w\s]+:?/, 'catch + console.error chuẩn'],
    [/\binterface\s+\w+Props\b|\btype\s+\w+Props\s*=/, 'kiểu Props riêng'],
    [/\baria-\w+=|role=["']/, 'thuộc tính aria/role'],
    [/\bIntl\.|toLocaleString\s*\(\s*['"]/, 'Intl / toLocaleString'],
    [/\bas const\b|\bsatisfies\b|\bRecord</, 'TypeScript nâng cao'],
    [/\bz\.object\s*\(|\bzod\b/, 'zod schema'],
    [/res\.ok\b[\s\S]{0,60}throw new Error/, 'kiểm tra res.ok + throw']
  ]
}

const KEYWORDS = new Set(
  (
    'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import ' +
    'instanceof int interface long native new package private protected public return short static super switch synchronized this throw throws transient try void volatile while ' +
    'auto bool delete friend inline namespace operator register signed sizeof struct template typedef typename union unsigned using virtual include define ' +
    'std cout cin endl printf scanf main vector string map set string String System out println Override ' +
    'async await export from function let var yield of in typeof null undefined true false fun val when object override suspend data lateinit React useState useEffect props'
  ).split(' ')
)

interface SegText {
  code: string[] // dòng code (không trống, không phải comment)
  comments: string[] // nội dung comment (đã bỏ ký hiệu)
  commentRaw: string[] // dòng comment nguyên gốc (đã trim)
  all: string[] // mọi dòng không trống (nguyên gốc)
}

function splitText(lines: string[], r: Range): SegText {
  const out: SegText = { code: [], comments: [], commentRaw: [], all: [] }
  let inBlock = false
  for (let i = r.start; i <= r.end; i++) {
    const raw = lines[i]
    const l = raw.trim()
    if (!l) continue
    out.all.push(raw)
    if (inBlock) {
      out.commentRaw.push(l)
      out.comments.push(l.replace(/^\*+\/?|\*\/$/g, '').trim())
      if (l.includes('*/')) inBlock = false
      continue
    }
    if (l.startsWith('//')) {
      out.commentRaw.push(l)
      out.comments.push(l.replace(/^\/\/+!?/, '').trim())
    } else if (l.startsWith('/*')) {
      out.commentRaw.push(l)
      out.comments.push(l.replace(/^\/\*+|\*\/$/g, '').trim())
      if (!l.includes('*/')) inBlock = true
    } else if (l.startsWith('{/*') && l.endsWith('*/}')) {
      out.commentRaw.push(l)
      out.comments.push(l.slice(3, -3).trim())
    } else {
      out.code.push(raw)
      const tail = raw.match(/\s\/\/\s?(.*)$/)
      if (tail && !/["'`][^"'`]*\/\//.test(raw)) out.comments.push(tail[1].trim())
    }
  }
  return out
}

function strings(code: string[]): string[] {
  const out: string[] = []
  for (const l of code) for (const m of l.matchAll(/"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\]){2,})'|`((?:\\.|[^`\\])*)`/g)) out.push(m[1] ?? m[2] ?? m[3] ?? '')
  return out
}

function identifiers(code: string[]): string[] {
  const set = new Set<string>()
  for (const l of code) {
    const clean = l.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, ' ')
    for (const m of clean.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)) if (!KEYWORDS.has(m[0])) set.add(m[0])
  }
  return [...set]
}

// Tên được khai báo trong đoạn (biến, tham số, hàm) — không tính tên chỉ được gọi tới.
const DECL =
  /\b(?:int|long|short|float|double|char|bool|boolean|byte|void|auto|var|let|const|val|fun|function|size_t|string|String|unsigned|signed|[A-Z][A-Za-z0-9_]*(?:<[^<>()]*>)?(?:\[\])?)\s*[*&]*\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?=[=;,()[:)]|$)/g

function declaredIdentifiers(code: string[]): string[] {
  const set = new Set<string>()
  for (const l of code) {
    const clean = l.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, ' ')
    for (const m of clean.matchAll(DECL)) if (!KEYWORDS.has(m[1])) set.add(m[1])
    // const [a, setA] = useState / destructuring
    for (const m of clean.matchAll(/\b(?:const|let|var)\s*[[{]([^\]}=]+)[\]}]/g)) for (const x of m[1].split(',')) if (/^\s*[A-Za-z_]\w*\s*$/.test(x)) set.add(x.trim())
  }
  return [...set]
}

const isMultiWord = (id: string): boolean => id.length >= 8 && (/[a-z][A-Z]/.test(id) || /[a-z]_[a-z]/.test(id))

interface Style {
  indent: 'tab' | '2' | '4' | null
  kwSpace: boolean | null // "if (" hay "if("
  opSpace: boolean | null // "a = b" hay "a=b"
  braceNewline: boolean | null
  commentLang: 'vi' | 'en' | null
  naming: 'camel' | 'snake' | 'short' | null
}

function majority(yes: number, no: number, min = 2): boolean | null {
  if (yes + no < min) return null
  if (yes >= no * 3) return true
  if (no >= yes * 3) return false
  return null
}

interface Feature {
  key: string
  value: number // 0..1
  weight: number
  label: string
}

interface SegFeatures {
  feats: Feature[]
  style: Style
  advancedNames: string[]
}

function features(t: SegText, lang: Lang, profileId: string): SegFeatures {
  const nCode = Math.max(1, t.code.length)
  const feats: Feature[] = []
  const add = (key: string, value: number, weight: number, label: string): void => {
    if (value > 0) feats.push({ key, value: Math.max(0, Math.min(1, value)), weight, label })
  }
  const formatDamp = profileId === 'nextjs' || profileId === 'android' ? 0.6 : 1
  const advDamp = profileId === 'nextjs' ? 0.5 : 1

  // Comment
  const chat = t.comments.filter((c) => CHATBOT.test(c) || VI_CHATBOT.test(c)).length
  add('chatbot', chat / 2, 2.2, 'Comment kiểu chatbot (Step 1, Helper function, @param...)')
  const docTags = t.comments.filter((c) => /@(param|returns?|throws|brief)\b/.test(c)).length
  add('doc', docTags / 2, 1.0, 'Javadoc/JSDoc đầy đủ @param/@return')
  const enSentence = t.comments.filter((c) => !VI_DIACRITIC.test(c) && !VI_WORDS.test(c) && /^[A-Z][a-z]+(\s+[a-zA-Z'(),.:-]+){3,}/.test(c)).length
  if (t.comments.length) add('en_comment', (enSentence / t.comments.length) * Math.min(1, t.comments.length / 3), 1.0, 'Comment tiếng Anh câu hoàn chỉnh')
  // Comment tiếng Việt không dấu: thói quen gõ nhanh của SV. Có dấu: AI (hỏi bằng tiếng Việt) cũng viết được → yếu.
  const viNoDia = t.comments.filter((c) => VI_WORDS.test(c) && !VI_DIACRITIC.test(c)).length
  const viDia = t.comments.filter((c) => VI_DIACRITIC.test(c) && !VI_CHATBOT.test(c)).length
  const viComment = viNoDia + viDia
  add('vi_comment', viNoDia / 2, -1.2, 'Comment tiếng Việt không dấu')
  add('vi_comment_dia', viDia / 3, -0.3, 'Comment tiếng Việt')
  const density = t.commentRaw.length / nCode
  add('density', (density - 0.1) / 0.2, 0.7, 'Mật độ comment cao')
  add('banner', t.commentRaw.filter((c) => BANNER.test(c)).length / 2, 0.6, 'Comment dạng banner phân đoạn (=====)')
  add('commented_code', t.commentRaw.filter((c) => COMMENTED_CODE.test(c)).length / 2, -1.3, 'Có code bị comment lại (dấu vết sửa thử)')
  add('emoji', t.all.filter((l) => EMOJI.test(l)).length / 2, 0.9, 'Có emoji trong code/chuỗi')

  // Format
  let tabs = 0
  let spaces = 0
  const leads: number[] = []
  let trailing = 0
  let kwTight = 0
  let kwSpaced = 0
  let opTight = 0
  let opSpaced = 0
  let commaTight = 0
  let braceSame = 0
  let braceNext = 0
  for (const l of t.code) {
    const lead = l.match(/^[ \t]*/)![0]
    if (lead.includes('\t')) tabs++
    if (lead.includes(' ')) {
      spaces++
      if (!lead.includes('\t')) leads.push(lead.length)
    }
    if (/[ \t]+$/.test(l)) trailing++
    const s = l
      .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/.*$/g, '""')
      .replace(/(\w)\s*<[\w:\s,*&<>?.[\]]*>/g, '$1') // generic / template: vector<int>, List<String>
    if (/\b(if|for|while|switch|catch)\(/.test(s)) kwTight++
    if (/\b(if|for|while|switch|catch) \(/.test(s)) kwSpaced++
    if (lang !== 'js' || !/<\w|\/>|=>/.test(s)) {
      if (/[\w)\]]=[\w("'-]|[\w)\]](<|>|<=|>=|==|!=|\+=|-=)[\w(]/.test(s)) opTight++
      if (/[\w)\]] (=|<|>|<=|>=|==|!=|\+=|-=) [\w("'-]/.test(s)) opSpaced++
    }
    if (/,\S/.test(s.replace(/,\s*$/, ''))) commaTight++
    if (/\)\s*\{\s*$/.test(s)) braceSame++
    if (/^\s*\{\s*$/.test(s)) braceNext++
  }
  const mixedIndent = tabs && spaces ? Math.min(tabs, spaces) / Math.max(tabs, spaces) : 0
  // Đơn vị thụt lề: 2 nếu có dòng lệch 2 so với bội 4, ngược lại 4. Dòng không chia hết cho đơn vị = lệch.
  const unit = leads.some((n) => n % 4 === 2) ? 2 : 4
  const oddIndent = leads.filter((n) => n % unit !== 0).length
  const indentMix = unit === 2 && leads.filter((n) => n % 4 === 2).length < leads.length * 0.15 ? 0.3 : 0
  const opMix = opTight && opSpaced ? (2 * Math.min(opTight, opSpaced)) / (opTight + opSpaced) : 0
  const kwMix = kwTight && kwSpaced ? (2 * Math.min(kwTight, kwSpaced)) / (kwTight + kwSpaced) : 0
  const braceMix = braceSame && braceNext ? (2 * Math.min(braceSame, braceNext)) / (braceSame + braceNext) : 0
  const inconsistency = mixedIndent + indentMix + opMix + kwMix + braceMix + (oddIndent / nCode) * 3 + (trailing / nCode) * 1.5
  add('inconsistent', inconsistency / 1.2, -1.6 * formatDamp, 'Format không đồng đều (dấu hiệu gõ tay)')
  const tight = (kwTight + opTight + commaTight) / nCode
  add('tight', tight / 0.35, -1.0 * formatDamp, 'Viết dính kiểu "for(int i=0;i<n;i++)"')
  if (t.code.length >= 6 && inconsistency === 0 && tight === 0) add('uniform', Math.min(1, t.code.length / 15), 0.4 * formatDamp, 'Format đồng đều tuyệt đối')

  // Tên định danh
  const ids = identifiers(t.code)
  const decl = declaredIdentifiers(t.code)
  if (decl.length >= 3) {
    const multi = decl.filter(isMultiWord).length / decl.length
    add('descriptive', (multi - 0.25) / 0.35, 1.0, 'Tên biến/hàm dài, mô tả kiểu AI')
  }
  const viIds = [...new Set([...decl, ...ids])].filter((id) => /^[a-z0-9_]+$/.test(id) && (VI_IDENT.test(id) || VI_IDENT.test(id.replace(/_/g, '')))).length
  add('vi_ident', viIds / 2, -1.4, 'Tên biến tiếng Việt / viết tắt')

  // Cú pháp vượt mức
  const text = t.all.join('\n')
  const adv = ADVANCED[lang].filter(([re]) => re.test(text)).map(([, n]) => n)
  add('advanced', adv.length / 2, 1.3 * advDamp, 'Cú pháp nâng cao: ' + adv.slice(0, 3).join(', '))

  // Chuỗi
  const strs = strings(t.code)
  add('polished', strs.filter((s) => POLISHED_STR.test(s)).length / 2, 0.7, 'Chuỗi thông báo tiếng Anh trau chuốt')
  add('vi_nodiacritic', strs.filter((s) => VI_WORDS.test(s) && !VI_DIACRITIC.test(s)).length / 2, -0.6, 'Chuỗi tiếng Việt không dấu')
  add('habit', t.all.filter((l) => STUDENT_HABIT.test(l)).length / 1.5, -1.2, 'Thói quen / dấu vết debug của sinh viên')

  const style: Style = {
    indent: tabs > spaces * 2 ? 'tab' : leads.length >= 3 && tabs * 2 < spaces ? (unit === 2 ? '2' : '4') : null,
    kwSpace: majority(kwSpaced, kwTight),
    opSpace: majority(opSpaced, opTight, 3),
    braceNewline: majority(braceNext, braceSame),
    commentLang: viComment >= 1 && viComment >= enSentence ? 'vi' : enSentence >= 2 ? 'en' : null,
    naming: ids.length >= 4 ? (ids.filter((i) => /[a-z]_[a-z]/.test(i)).length > ids.length / 3 ? 'snake' : ids.filter((i) => i.length <= 3).length > ids.length / 2 ? 'short' : 'camel') : null
  }
  return { feats, style, advancedNames: adv }
}

const BIAS = -0.9
const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z))

function styleMismatch(a: Style, base: Style): number {
  let n = 0
  let diff = 0
  for (const k of Object.keys(a) as (keyof Style)[]) {
    if (a[k] === null || base[k] === null) continue
    n++
    if (a[k] !== base[k]) diff++
  }
  return n >= 3 ? diff / n : 0
}

// Xác suất → phần dòng tính là AI: ≤0.3 coi như SV, ≥0.7 coi như AI, ở giữa tính tỉ lệ.
const share = (p: number): number => Math.max(0, Math.min(1, (p - 0.3) / 0.4))

function lower(c: AiConfidence): AiConfidence {
  return c === 'high' ? 'medium' : 'low'
}

// ───────────── Ước lượng ─────────────

interface WorkSeg {
  file: string
  lang: Lang
  range: Range
  lines: number
  starterLines: number
  generated: boolean
  f: SegFeatures
  z: number
  p: number
}

export function estimateAiCode(files: Map<string, Buffer>, profileId: string, opts: { starter?: Set<number>; llm?: LlmAiHint | null } = {}): AiEstimate {
  const starter = opts.starter ?? new Set<number>()
  const segs: WorkSeg[] = []
  for (const [path, buf] of files) {
    if (!AUTHORED.test(path)) continue
    const text = decodeText(buf)
    const lines = text.replace(/\r\n?/g, '\n').split('\n')
    if (lines.some((l) => l.length > 2000)) continue // file minified
    const lang = langOf(path)
    const generated = GENERATED.some((re) => re.test(path))
    // Dòng trùng code khung
    const starterLine = new Uint8Array(lines.length + 2)
    if (starter.size) for (const g of kgramSpans(text)) if (starter.has(g.h)) for (let l = g.lineStart; l <= g.lineEnd; l++) starterLine[l] = 1
    for (const r of segmentRange(lines, 0, lines.length - 1, 0)) {
      const st = splitText(lines, r)
      const n = st.all.length
      if (!n) continue
      let sl = 0
      for (let i = r.start; i <= r.end; i++) if (lines[i].trim() && starterLine[i + 1]) sl++
      const f = features(st, lang, profileId)
      const z = BIAS + f.feats.reduce((s, x) => s + x.value * x.weight, 0)
      segs.push({ file: path, lang, range: r, lines: n, starterLines: generated ? n : sl, generated, f, z, p: sigmoid(z) })
    }
  }

  const isStarter = (s: WorkSeg): boolean => s.generated || s.starterLines >= s.lines * 0.6
  const authored = segs.filter((s) => !isStarter(s))

  // Bài trộn: đoạn lệch phong cách so với phần "giống sinh viên" của chính bài này
  const baseSegs = authored.filter((s) => s.p < 0.4 && s.lines >= 5)
  if (baseSegs.length >= 2) {
    const pick = <K extends keyof Style>(k: K): Style[K] => {
      const counts = new Map<Style[K], number>()
      for (const s of baseSegs) if (s.f.style[k] !== null) counts.set(s.f.style[k], (counts.get(s.f.style[k]) ?? 0) + s.lines)
      let best: Style[K] = null as Style[K]
      let bestN = 0
      for (const [v, c] of counts) if (c > bestN) (best = v), (bestN = c)
      return best
    }
    const base: Style = { indent: pick('indent'), kwSpace: pick('kwSpace'), opSpace: pick('opSpace'), braceNewline: pick('braceNewline'), commentLang: pick('commentLang'), naming: pick('naming') }
    for (const s of authored) {
      if (baseSegs.includes(s) || s.lines < 5) continue
      const m = styleMismatch(s.f.style, base)
      if (m >= 0.34) {
        s.f.feats.push({ key: 'mismatch', value: m, weight: 1.5, label: 'Phong cách khác hẳn phần còn lại của bài' })
        s.z += m * 1.5
        s.p = sigmoid(s.z)
      }
    }
  }

  // Đoạn quá ngắn: dùng mức trung bình (theo dòng) của file chứa nó
  const fileAvg = new Map<string, number>()
  for (const file of new Set(authored.map((s) => s.file))) {
    const big = authored.filter((s) => s.file === file && s.lines >= 4)
    const w = big.reduce((a, s) => a + s.lines, 0)
    if (w) fileAvg.set(file, big.reduce((a, s) => a + s.p * s.lines, 0) / w)
  }
  for (const s of authored) if (s.lines < 4 && fileAvg.has(s.file)) s.p = fileAvg.get(s.file)!

  const authoredLinesOf = (s: WorkSeg): number => Math.max(0, s.lines - s.starterLines)
  const pct = (list: WorkSeg[], prob: (s: WorkSeg) => number): number => {
    const w = list.reduce((a, s) => a + authoredLinesOf(s), 0)
    return w ? (list.reduce((a, s) => a + share(prob(s)) * authoredLinesOf(s), 0) / w) * 100 : 0
  }
  const heuristicPercent = pct(authored, (s) => s.p)

  // Trộn nhận định LLM theo từng đoạn
  const llm = opts.llm ?? null
  const finalP = new Map<WorkSeg, number>()
  for (const s of authored) {
    let p = s.p
    const hits = (llm?.segments ?? []).filter((x) => x.file === s.file)
    if (hits.length) {
      const segFrom = s.range.start + 1
      const segTo = s.range.end + 1
      let ai = 0
      let st = 0
      for (const h of hits) {
        const ov = Math.min(segTo, h.lineEnd) - Math.max(segFrom, h.lineStart) + 1
        if (ov <= 0) continue
        if (h.origin === 'ai') ai += ov
        else st += ov
      }
      const span = segTo - segFrom + 1
      if ((ai + st) / span >= 0.5) {
        const q = ai >= st ? 0.85 : 0.15
        p = 0.6 * p + 0.4 * q
        s.f.feats.push({ key: 'llm', value: 1, weight: ai >= st ? 1 : -1, label: ai >= st ? 'AI chấm bài nhận định đoạn này do AI viết' : 'AI chấm bài nhận định đoạn này do SV tự viết' })
      }
    }
    finalP.set(s, p)
  }
  let aiPercent = pct(authored, (s) => finalP.get(s)!)
  const llmPercent = llm && llm.percent !== null && Number.isFinite(llm.percent) ? Math.max(0, Math.min(100, llm.percent)) : null
  if (llmPercent !== null) aiPercent = 0.75 * aiPercent + 0.25 * llmPercent

  const totalLines = segs.reduce((a, s) => a + s.lines, 0)
  const starterLines = segs.reduce((a, s) => a + (isStarter(s) ? s.lines : s.starterLines), 0)
  const authoredLines = totalLines - starterLines

  // Độ tin cậy: đủ lượng code + tín hiệu rõ ràng (xác suất xa 0.5) + heuristic và LLM không vênh nhau
  const w = authored.reduce((a, s) => a + authoredLinesOf(s), 0)
  const decisive = w ? authored.reduce((a, s) => a + Math.abs(finalP.get(s)! - 0.5) * 2 * authoredLinesOf(s), 0) / w : 0
  let confidence: AiConfidence = 'low'
  if (authoredLines >= 120 && decisive >= 0.5) confidence = 'high'
  else if ((authoredLines >= 30 && decisive >= 0.45) || (authoredLines >= 60 && decisive >= 0.3)) confidence = 'medium'
  if (authoredLines < 20) confidence = 'low'
  if (llmPercent !== null && Math.abs(llmPercent - heuristicPercent) > 40) confidence = lower(confidence)

  const segments: AiSegment[] = segs
    .map((s) => {
      const starterSeg = isStarter(s)
      const p = starterSeg ? 0 : finalP.get(s)!
      const reasons = starterSeg
        ? [s.generated ? 'File do IDE/công cụ sinh tự động' : 'Trùng code khung giáo viên phát']
        : s.f.feats
            .map((x) => ({ x, c: x.value * x.weight }))
            .filter((y) => Math.abs(y.c) >= 0.35)
            .sort((a, b) => Math.abs(b.c) - Math.abs(a.c))
            .slice(0, 5)
            .map((y) => (y.c > 0 ? '↑ ' : '↓ ') + y.x.label)
      return {
        file: s.file,
        lineStart: s.range.start + 1,
        lineEnd: s.range.end + 1,
        lines: s.lines,
        aiProb: Math.round(p * 100) / 100,
        origin: starterSeg ? 'starter' : p >= 0.5 ? 'ai' : 'student',
        reasons
      } as AiSegment
    })
    .filter((s) => s.lines >= 2)
    .slice(0, 400)

  const byFile = new Map<string, WorkSeg[]>()
  for (const s of segs) byFile.set(s.file, [...(byFile.get(s.file) ?? []), s])
  const filesOut = [...byFile.entries()]
    .map(([file, list]) => {
      const auth = list.filter((s) => !isStarter(s))
      return {
        file,
        lines: list.reduce((a, s) => a + s.lines, 0),
        starterLines: list.reduce((a, s) => a + (isStarter(s) ? s.lines : s.starterLines), 0),
        aiPercent: Math.round(pct(auth, (s) => finalP.get(s)!))
      }
    })
    .sort((a, b) => b.lines - a.lines)

  const ai = authoredLines > 0 ? Math.round(aiPercent) : 0
  return {
    aiPercent: ai,
    studentPercent: authoredLines > 0 ? 100 - ai : 0,
    starterPercent: totalLines ? Math.round((starterLines / totalLines) * 100) : 0,
    confidence,
    totalLines,
    authoredLines,
    heuristicPercent: Math.round(heuristicPercent),
    llmPercent: llmPercent === null ? null : Math.round(llmPercent),
    files: filesOut,
    segments
  }
}

// Mức tín hiệu theo % ước lượng; độ tin cậy thấp thì không xếp "Cao".
export function levelFromEstimate(e: AiEstimate): 'low' | 'medium' | 'high' {
  const lv = e.aiPercent >= 60 ? 'high' : e.aiPercent >= 30 ? 'medium' : 'low'
  return lv === 'high' && e.confidence === 'low' ? 'medium' : lv
}
