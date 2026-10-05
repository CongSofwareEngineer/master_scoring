import type { TechProfile } from '@shared/types'
import { decodeText } from '../importer/extract'

// Nhận diện công nghệ của bài nộp theo danh sách "detect" của từng Tech Profile.
// Thứ tự ưu tiên: Android → Next.js → C++ → C → profile tuỳ chỉnh.
export function detectProfile(files: Map<string, Buffer>, profiles: TechProfile[]): string | null {
  const paths = [...files.keys()]
  const bases = paths.map((p) => p.split('/').pop()!.toLowerCase())
  const order = ['android', 'nextjs', 'cpp', 'c']
  const sorted = [...profiles].sort((a, b) => {
    const ia = order.indexOf(a.id)
    const ib = order.indexOf(b.id)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
  for (const p of sorted) {
    for (const rule of p.detect) {
      const r = rule.trim()
      if (!r) continue
      if (r.includes(':')) {
        // file:dependency — vd. package.json:next
        const [file, dep] = r.split(':')
        for (const path of paths) {
          if (path.split('/').pop()!.toLowerCase() !== file.toLowerCase() || path.includes('node_modules/')) continue
          try {
            const pkg = JSON.parse(decodeText(files.get(path)!))
            if (pkg?.dependencies?.[dep] || pkg?.devDependencies?.[dep]) return p.id
          } catch {
            /* package.json hỏng */
          }
        }
      } else if (r.startsWith('*.')) {
        if (bases.some((b) => b.endsWith(r.slice(1).toLowerCase()))) return p.id
      } else if (bases.includes(r.toLowerCase())) {
        return p.id
      }
    }
  }
  return null
}
