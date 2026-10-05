import { AUTO_PROFILE_ID } from '@shared/constants'
import type { TechProfile } from '@shared/types'
import { decodeText, loadSubmission, matchesIgnore, type ExtractLimits, type Submission } from '../importer/extract'

// Profile dạng framework/project: nhận diện bằng file đánh dấu (package.json, Manifest...), ưu tiên theo thứ tự.
const FRAMEWORK_PROFILES = ['android', 'nextjs', 'react-native', 'reactjs']
// Ngôn ngữ thuần + profile tuỳ chỉnh: chọn profile có nhiều mã nguồn khớp nhất; bằng nhau thì theo thứ tự này.
const LANGUAGE_PRIORITY = ['cpp', 'c', 'python', 'php', 'csharp', 'javascript', 'css']

// File chỉ đọc để nhận diện công nghệ, không đưa vào chấm.
const DETECT_ONLY = ['package.json']

function rank(id: string, order: string[]): number {
  const i = order.indexOf(id)
  return i < 0 ? 99 : i
}

// Mức khớp của 1 quy tắc "detect": 0 = không khớp; với *.ext / tên file là tổng dung lượng file khớp.
function ruleWeight(rule: string, files: Map<string, Buffer>): number {
  const r = rule.trim().toLowerCase()
  if (!r) return 0
  let w = 0
  if (r.includes(':')) {
    // file:dependency — vd. package.json:next
    const [file, dep] = r.split(':')
    for (const [path, buf] of files) {
      if (path.split('/').pop()!.toLowerCase() !== file || path.includes('node_modules/')) continue
      try {
        const pkg = JSON.parse(decodeText(buf))
        const has = (deps: Record<string, string> | undefined): boolean => !!deps && Object.keys(deps).some((k) => k.toLowerCase() === dep)
        if (has(pkg?.dependencies) || has(pkg?.devDependencies)) return 1
      } catch {
        /* package.json hỏng */
      }
    }
    return 0
  }
  for (const [path, buf] of files) {
    const base = path.split('/').pop()!.toLowerCase()
    if (r.startsWith('*.') ? base.endsWith(r.slice(1)) : base === r) w += Math.max(1, buf.length)
  }
  return w
}

// Nhận diện công nghệ của bài nộp theo danh sách "detect" của từng Tech Profile.
export function detectProfile(files: Map<string, Buffer>, profiles: TechProfile[]): string | null {
  const candidates = profiles.filter((p) => p.id !== AUTO_PROFILE_ID)
  const frameworks = candidates.filter((p) => FRAMEWORK_PROFILES.includes(p.id)).sort((a, b) => rank(a.id, FRAMEWORK_PROFILES) - rank(b.id, FRAMEWORK_PROFILES))
  for (const p of frameworks) if (p.detect.some((r) => ruleWeight(r, files) > 0)) return p.id

  const scores = new Map<string, number>()
  for (const p of candidates) {
    if (FRAMEWORK_PROFILES.includes(p.id)) continue
    const s = p.detect.reduce((sum, r) => sum + ruleWeight(r, files), 0)
    if (s > 0) scores.set(p.id, s)
  }
  const best = [...scores.entries()].sort((a, b) => b[1] - a[1] || rank(a[0], LANGUAGE_PRIORITY) - rank(b[0], LANGUAGE_PRIORITY))[0]?.[0] ?? null
  // Project C++ có nhiều file .h vẫn là C++
  if (best === 'c' && scores.has('cpp')) return 'cpp'
  return best
}

function filterFiles(files: Map<string, Buffer>, ignore: string[]): Map<string, Buffer> {
  return new Map([...files].filter(([p]) => !matchesIgnore(p, ignore) && !DETECT_ONLY.includes(p.split('/').pop()!.toLowerCase())))
}

// Đọc bài nộp để chấm theo profile của assignment.
// - Đã chọn sẵn công nghệ: lọc theo profile đó, không nhận diện.
// - "Tự động nhận diện": đọc rộng, nhận diện công nghệ, rồi lọc lại theo profile nhận diện được
//   (không nhận diện được → giữ profile auto, chấm theo tiêu chí chung).
export async function loadForGrading(
  zipPath: string,
  profiles: TechProfile[],
  profileId: string,
  limits: ExtractLimits
): Promise<{ sub: Submission; profile: TechProfile; detected: string | null }> {
  const chosen = profiles.find((p) => p.id === profileId) ?? profiles.find((p) => p.id === AUTO_PROFILE_ID) ?? profiles[0]
  if (chosen.id !== AUTO_PROFILE_ID) {
    const sub = await loadSubmission(zipPath, chosen, limits)
    return { sub: { ...sub, files: filterFiles(sub.files, []) }, profile: chosen, detected: null }
  }
  const sub = await loadSubmission(zipPath, { ...chosen, extensions: profiles.flatMap((p) => p.extensions) }, limits)
  const detected = detectProfile(sub.files, profiles)
  const profile = profiles.find((p) => p.id === detected) ?? chosen
  return { sub: { ...sub, files: filterFiles(sub.files, profile.ignore) }, profile, detected }
}
