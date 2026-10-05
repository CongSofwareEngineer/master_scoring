// Phân tích tĩnh cơ bản theo từng công nghệ. Kết quả là issue có nhãn [Static] (khách quan).
import type { AutoResult, Issue } from '@shared/types'
import { decodeText } from '../importer/extract'

const CODE_EXT = ['.java', '.kt', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.css', '.scss']

function ext(p: string): string {
  const i = p.lastIndexOf('.')
  return i >= 0 ? p.slice(i).toLowerCase() : ''
}

export function isCodeFile(p: string): boolean {
  return CODE_EXT.includes(ext(p))
}

function countLines(text: string): { lines: number; comments: number } {
  let lines = 0
  let comments = 0
  let inBlock = false
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim()
    if (!l) continue
    lines++
    if (inBlock) {
      comments++
      if (l.includes('*/')) inBlock = false
      continue
    }
    if (l.startsWith('//') || l.startsWith('#!')) comments++
    else if (l.startsWith('/*')) {
      comments++
      if (!l.includes('*/')) inBlock = true
    } else if (l.startsWith('<!--')) comments++
  }
  return { lines, comments }
}

// Hàm quá dài (ước lượng theo cặp ngoặc nhọn, cho ngôn ngữ họ C)
function longFunctions(path: string, text: string, maxLines: number): Issue[] {
  const issues: Issue[] = []
  const lines = text.split(/\r?\n/)
  const sig = /^\s*(?:(?:public|private|protected|static|final|async|export|default|inline|virtual|const|override|suspend|fun|function)\s+)*[\w<>[\],\s*&:~]+\s+\**&?(\w+)\s*\([^;{}]*\)\s*(?:const)?\s*(?:throws [\w.,\s]+)?\s*\{?\s*$/
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(sig)
    if (!m || /^(if|for|while|switch|catch|return|else|new)$/.test(m[1])) continue
    let depth = 0
    let started = false
    let end = -1
    for (let k = i; k < Math.min(lines.length, i + 2000); k++) {
      for (const ch of lines[k].replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/.*$/g, '')) {
        if (ch === '{') {
          depth++
          started = true
        } else if (ch === '}') depth--
      }
      if (started && depth <= 0) {
        end = k
        break
      }
      if (!started && k > i + 1) break
    }
    if (end > 0 && end - i + 1 > maxLines) {
      issues.push({
        source: 'Static',
        severity: 'warning',
        file: path,
        line: i + 1,
        message: `Hàm "${m[1]}" dài ${end - i + 1} dòng (> ${maxLines}), nên tách nhỏ.`
      })
      i = end
    }
  }
  return issues
}

function androidChecks(files: Map<string, string>): Issue[] {
  const issues: Issue[] = []
  const manifestPath = [...files.keys()].find((p) => p.endsWith('AndroidManifest.xml') && !p.includes('/build/'))
  if (!manifestPath) {
    issues.push({ source: 'Static', severity: 'error', message: 'Không tìm thấy AndroidManifest.xml' })
    return issues
  }
  const manifest = files.get(manifestPath)!
  const declared = new Set<string>()
  for (const m of manifest.matchAll(/<activity[^>]*android:name\s*=\s*"([^"]+)"/g)) declared.add(m[1].split('.').pop()!)
  const pkg = manifest.match(/package\s*=\s*"([^"]+)"/)?.[1]
  for (const [p, text] of files) {
    if (!/\.(java|kt)$/.test(p)) continue
    const lines = text.split(/\r?\n/)
    lines.forEach((l, idx) => {
      const m = l.match(/class\s+(\w+)\s*(?:extends|:)\s*(AppCompatActivity|Activity|FragmentActivity|ComponentActivity)\b/)
      if (m && !declared.has(m[1])) {
        issues.push({
          source: 'Static',
          severity: 'error',
          file: p,
          line: idx + 1,
          message: `Activity "${m[1]}" chưa được khai báo trong AndroidManifest.xml`
        })
      }
    })
  }
  const layouts = [...files.keys()].filter((p) => /\/res\/layout[^/]*\/[^/]+\.xml$/.test(p))
  if (!layouts.length) issues.push({ source: 'Static', severity: 'warning', message: 'Không có file layout XML (res/layout)' })
  if (!pkg && ![...files.keys()].some((p) => /build\.gradle(\.kts)?$/.test(p))) {
    issues.push({ source: 'Static', severity: 'warning', message: 'Không tìm thấy build.gradle' })
  }
  return issues
}

function nextChecks(files: Map<string, string>): Issue[] {
  const issues: Issue[] = []
  const keys = [...files.keys()]
  const hasApp = keys.some((p) => /(^|\/)(src\/)?app\/.*page\.(t|j)sx?$/.test(p))
  const hasPages = keys.some((p) => /(^|\/)(src\/)?pages\/.*\.(t|j)sx?$/.test(p))
  if (!hasApp && !hasPages) issues.push({ source: 'Static', severity: 'error', message: 'Không tìm thấy thư mục app/ hoặc pages/ chứa route' })
  for (const [p, text] of files) {
    const base = p.split('/').pop()!
    if (base.startsWith('.env') && !base.endsWith('.example') && !base.endsWith('.sample')) {
      text.split(/\r?\n/).forEach((l, idx) => {
        if (/^\s*[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD|PRIVATE)[A-Z0-9_]*\s*=\s*\S{8,}/i.test(l)) {
          issues.push({
            source: 'Static',
            severity: 'warning',
            file: p,
            line: idx + 1,
            message: 'File .env chứa khoá bí mật bị nộp kèm (lộ key)'
          })
        }
      })
    }
    if (/\.(t|j)sx?$/.test(p)) {
      text.split(/\r?\n/).forEach((l, idx) => {
        if (/(api[_-]?key|secret|password)\s*[:=]\s*["'`][A-Za-z0-9_\-]{16,}["'`]/i.test(l)) {
          issues.push({ source: 'Static', severity: 'warning', file: p, line: idx + 1, message: 'Có vẻ hard-code khoá bí mật trong mã nguồn' })
        }
      })
    }
  }
  return issues
}

function cChecks(files: Map<string, string>): Issue[] {
  const issues: Issue[] = []
  const sources = [...files.entries()].filter(([p]) => /\.(c|cpp|cc|cxx)$/.test(p))
  if (!sources.length) {
    issues.push({ source: 'Static', severity: 'error', message: 'Không tìm thấy file mã nguồn C/C++' })
    return issues
  }
  const mains = sources.filter(([, t]) => /\bint\s+main\s*\(|\bvoid\s+main\s*\(/.test(t))
  if (!mains.length) issues.push({ source: 'Static', severity: 'error', message: 'Không tìm thấy hàm main()' })
  for (const [p, text] of sources) {
    text.split(/\r?\n/).forEach((l, idx) => {
      if (/\bgets\s*\(/.test(l)) issues.push({ source: 'Static', severity: 'warning', file: p, line: idx + 1, message: 'Dùng gets() không an toàn' })
      if (/#include\s*<conio\.h>/.test(l)) issues.push({ source: 'Static', severity: 'info', file: p, line: idx + 1, message: 'Dùng conio.h (không chuẩn)' })
      if (/system\s*\(\s*"pause"\s*\)/.test(l)) issues.push({ source: 'Static', severity: 'info', file: p, line: idx + 1, message: 'system("pause") làm treo khi chạy test tự động' })
    })
  }
  return issues
}

export function runStatic(profileId: string, raw: Map<string, Buffer>): { issues: Issue[]; stats: NonNullable<AutoResult['stats']> } {
  const files = new Map<string, string>()
  for (const [p, b] of raw) files.set(p, decodeText(b))
  let lines = 0
  let comments = 0
  let codeFiles = 0
  const issues: Issue[] = []
  for (const [p, text] of files) {
    if (!isCodeFile(p)) continue
    codeFiles++
    const c = countLines(text)
    lines += c.lines
    comments += c.comments
    if (/\.(java|kt|js|jsx|ts|tsx|c|cpp|cc|cxx)$/.test(p)) issues.push(...longFunctions(p, text, 80))
  }
  if (codeFiles === 0) issues.push({ source: 'Static', severity: 'error', message: 'Không tìm thấy file mã nguồn' })
  if (profileId === 'android') issues.push(...androidChecks(files))
  else if (profileId === 'nextjs') issues.push(...nextChecks(files))
  else if (profileId === 'c' || profileId === 'cpp') issues.push(...cChecks(files))
  return { issues, stats: { files: codeFiles, lines, commentLines: comments } }
}

// Điểm tiêu chí "Phân tích tĩnh": trừ dần theo mức độ issue.
export function staticScore(max: number, issues: Issue[]): { score: number; reason: string } {
  const st = issues.filter((i) => i.source === 'Static')
  const errors = st.filter((i) => i.severity === 'error').length
  const warnings = st.filter((i) => i.severity === 'warning').length
  const ratio = Math.max(0, 1 - errors * 0.3 - warnings * 0.1)
  const score = Math.round(max * ratio * 4) / 4
  const reason = errors || warnings ? `Phân tích tĩnh: ${errors} lỗi, ${warnings} cảnh báo.` : 'Không phát hiện vấn đề khi phân tích tĩnh.'
  return { score, reason }
}
