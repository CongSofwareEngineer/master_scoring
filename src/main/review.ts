// Code Review: đọc file trực tiếp từ zip gốc (không lưu code sinh viên vào database).
import type { FileNode } from '@shared/types'
import { gradingProfileId, loadForGrading } from './analysis/detect'
import { decodeText } from './importer/extract'
import { assignmentOwner, getAssignment, getStudent, listProfiles } from './repo'
import { getSettings } from './settings'

const cache = new Map<number, { mtime: number; files: Map<string, Buffer> }>()
const MAX_CACHE = 4

async function load(studentId: number): Promise<Map<string, Buffer>> {
  const s = getStudent(studentId)
  const hit = cache.get(studentId)
  if (hit && hit.mtime === s.zipMtime) {
    cache.delete(studentId)
    cache.set(studentId, hit)
    return hit.files
  }
  if (!s.zipPath) throw new Error('Sinh viên chưa có bài nộp')
  const a = getAssignment(s.assignmentId)
  const st = getSettings(null)
  const { sub } = await loadForGrading(s.zipPath, listProfiles(assignmentOwner(a.id) ?? 0), gradingProfileId(a), {
    maxBytes: st.maxUnzipMb * 1048576,
    maxFiles: st.maxFiles
  })
  cache.set(studentId, { mtime: s.zipMtime, files: sub.files })
  while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!)
  return sub.files
}

export async function listFiles(studentId: number): Promise<FileNode[]> {
  const files = await load(studentId)
  return [...files.entries()].map(([path, b]) => ({ path, size: b.length }))
}

export async function readFile(studentId: number, path: string): Promise<string> {
  const files = await load(studentId)
  const b = files.get(path)
  if (!b) throw new Error('Không tìm thấy file: ' + path)
  return decodeText(b)
}

export async function searchProject(studentId: number, query: string): Promise<{ file: string; line: number; text: string }[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const files = await load(studentId)
  const out: { file: string; line: number; text: string }[] = []
  for (const [path, b] of files) {
    const lines = decodeText(b).split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(q)) {
        out.push({ file: path, line: i + 1, text: lines[i].trim().slice(0, 200) })
        if (out.length >= 300) return out
      }
    }
  }
  return out
}

export function invalidateReview(studentId?: number): void {
  if (studentId) cache.delete(studentId)
  else cache.clear()
}
