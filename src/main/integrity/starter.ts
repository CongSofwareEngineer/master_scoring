// Code khung (starter code) giáo viên phát: dùng để loại trừ khi so trùng lặp và khi ước lượng % code AI.
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import { loadForGrading } from '../analysis/detect'
import { ALWAYS_IGNORE, matchesIgnore } from '../importer/extract'
import { assignmentOwner, getAssignment, listProfiles } from '../repo'
import { getSettings } from '../settings'
import { kgramSet } from './fingerprint'

function readFolder(dir: string, ignore: string[]): Map<string, Buffer> {
  const out = new Map<string, Buffer>()
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name)
      const rel = relative(dir, full).replace(/\\/g, '/')
      if (e.isDirectory()) {
        if (!matchesIgnore(rel + '/x', ignore)) walk(full)
      } else if (!matchesIgnore(rel, ignore) && statSync(full).size < 512 * 1024) {
        out.set(rel, readFileSync(full))
      }
    }
  }
  walk(dir)
  return out
}

export async function loadStarterFiles(assignmentId: number): Promise<Map<string, Buffer> | null> {
  const a = getAssignment(assignmentId)
  if (!a.starterDir || !existsSync(a.starterDir)) return null
  const profiles = listProfiles(assignmentOwner(assignmentId) ?? 0)
  const s = getSettings(null)
  if (statSync(a.starterDir).isFile()) {
    return (await loadForGrading(a.starterDir, profiles, a.profileId, { maxBytes: s.maxUnzipMb * 1048576, maxFiles: s.maxFiles })).sub.files
  }
  const profile = profiles.find((p) => p.id === a.profileId)
  return readFolder(a.starterDir, [...(profile?.ignore ?? []), ...ALWAYS_IGNORE])
}

// Tập k-gram của code khung, cache theo assignment (đổi folder / sửa file thì tính lại).
const cache = new Map<number, { key: string; set: Set<number> }>()

export async function starterKgrams(assignmentId: number): Promise<Set<number>> {
  const a = getAssignment(assignmentId)
  let key = ''
  try {
    key = a.starterDir && existsSync(a.starterDir) ? `${a.starterDir}|${statSync(a.starterDir).mtimeMs}` : ''
  } catch {
    key = ''
  }
  const hit = cache.get(assignmentId)
  if (hit && hit.key === key) return hit.set
  const files = key ? await loadStarterFiles(assignmentId) : null
  const set = files ? kgramSet(files) : new Set<number>()
  cache.set(assignmentId, { key, set })
  return set
}
