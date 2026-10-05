// So sánh trùng lặp giữa sinh viên cùng assignment — chạy SAU KHI chấm xong cả lớp, tuần tự.
import type { IntegrityOverview, IntegrityPair, SimilarityStats } from '@shared/types'
import { all, nowIso, run, transaction } from '../db'
import { emit } from '../events'
import { getSettings } from '../settings'
import { compare, fingerprintFiles, type Fingerprint } from './fingerprint'
import { loadStarterFiles } from './starter'

const STORE_MIN = 30
const running = new Set<number>()
const lastRun = new Map<number, string>()

async function starterHashes(assignmentId: number): Promise<Set<number>> {
  const files = await loadStarterFiles(assignmentId)
  return files ? new Set(fingerprintFiles(files).h) : new Set()
}

const yieldLoop = (): Promise<void> => new Promise((r) => setImmediate(r))

export async function runIntegrity(assignmentId: number): Promise<void> {
  if (!getSettings(null).similarityEnabled) throw new Error('So sánh trùng lặp đang tắt — bật trong Cài đặt → Chung')
  if (running.has(assignmentId)) return
  running.add(assignmentId)
  emit('integrity:status', { assignmentId, running: true, done: 0, total: 0 })
  try {
    const exclude = await starterHashes(assignmentId)
    const rows = all<{ id: number; fingerprint: string }>(
      `SELECT s.id, r.fingerprint FROM students s JOIN results r ON r.student_id = s.id
       WHERE s.assignment_id = ? AND s.scan_status = 'valid' AND r.fingerprint IS NOT NULL`,
      [assignmentId]
    )
    const fps: { id: number; fp: Fingerprint }[] = []
    for (const r of rows) {
      try {
        fps.push({ id: r.id, fp: JSON.parse(r.fingerprint) })
      } catch {
        /* bỏ qua */
      }
    }
    const pairs: { a: number; b: number; sim: number; matches: unknown }[] = []
    const total = (fps.length * (fps.length - 1)) / 2
    let done = 0
    for (let i = 0; i < fps.length; i++) {
      for (let k = i + 1; k < fps.length; k++) {
        const c = compare(fps[i].fp, fps[k].fp, exclude)
        if (c && c.similarity >= STORE_MIN) pairs.push({ a: fps[i].id, b: fps[k].id, sim: c.similarity, matches: c.matches })
        done++
      }
      emit('integrity:status', { assignmentId, running: true, done, total })
      await yieldLoop()
    }
    transaction(() => {
      run('DELETE FROM integrity_pairs WHERE assignment_id = ?', [assignmentId])
      for (const p of pairs) {
        run('INSERT INTO integrity_pairs (assignment_id, a_id, b_id, similarity, matches) VALUES (?, ?, ?, ?, ?)', [
          assignmentId,
          p.a,
          p.b,
          p.sim,
          JSON.stringify(p.matches)
        ])
      }
    })
    lastRun.set(assignmentId, nowIso())
  } finally {
    running.delete(assignmentId)
    emit('integrity:status', { assignmentId, running: false })
  }
}

const BUCKETS = [
  { label: '≥ 90%', min: 90 },
  { label: '80–90%', min: 80 },
  { label: '70–80%', min: 70 },
  { label: '50–70%', min: 50 },
  { label: '30–50%', min: 30 },
  { label: '< 30%', min: 0 }
]

// Thống kê theo từng sinh viên trên TẤT CẢ cặp đã lưu (≥ 30%), không chỉ cặp vượt ngưỡng.
function similarityStats(assignmentId: number, threshold: number): SimilarityStats {
  const fpCount = all<{ c: number }>(
    `SELECT COUNT(*) AS c FROM students s JOIN results r ON r.student_id = s.id
     WHERE s.assignment_id = ? AND s.scan_status = 'valid' AND r.fingerprint IS NOT NULL`,
    [assignmentId]
  )[0]?.c ?? 0
  const rows = all<{ id: number; a_id: number; b_id: number; similarity: number; a_name: string; a_mssv: string; b_name: string; b_mssv: string }>(
    `SELECT p.id, p.a_id, p.b_id, p.similarity, sa.name AS a_name, sa.mssv AS a_mssv, sb.name AS b_name, sb.mssv AS b_mssv
     FROM integrity_pairs p JOIN students sa ON sa.id = p.a_id JOIN students sb ON sb.id = p.b_id
     WHERE p.assignment_id = ?`,
    [assignmentId]
  )
  const per = new Map<number, SimilarityStats['students'][number]>()
  const touch = (id: number, name: string, mssv: string, other: { id: number; name: string; mssv: string }, sim: number, pairId: number): void => {
    let e = per.get(id)
    if (!e) per.set(id, (e = { id, name, mssv, maxSimilarity: 0, closest: null, over: 0 }))
    if (sim > e.maxSimilarity) {
      e.maxSimilarity = sim
      e.closest = { ...other, pairId }
    }
    if (sim >= threshold) e.over++
  }
  for (const r of rows) {
    touch(r.a_id, r.a_name, r.a_mssv, { id: r.b_id, name: r.b_name, mssv: r.b_mssv }, r.similarity, r.id)
    touch(r.b_id, r.b_name, r.b_mssv, { id: r.a_id, name: r.a_name, mssv: r.a_mssv }, r.similarity, r.id)
  }
  const students = [...per.values()].sort((x, y) => y.maxSimilarity - x.maxSimilarity || y.over - x.over)
  const compared = Math.max(fpCount, students.length)
  const buckets = BUCKETS.map((b) => ({ ...b, count: 0 }))
  for (const s of students) buckets.find((b) => s.maxSimilarity >= b.min)!.count++
  // Bài đã so nhưng không có cặp nào ≥ 30%
  buckets[buckets.length - 1].count += Math.max(0, compared - students.length)
  const flagged = students.filter((s) => s.over > 0).length
  return {
    compared,
    flagged,
    flaggedRate: compared ? Math.round((flagged / compared) * 100) : null,
    maxSimilarity: students.length ? students[0].maxSimilarity : null,
    avgMax: compared ? Math.round((students.reduce((a, s) => a + s.maxSimilarity, 0) / compared) * 10) / 10 : null,
    buckets,
    students
  }
}

const EMPTY_STATS: SimilarityStats = { compared: 0, flagged: 0, flaggedRate: null, maxSimilarity: null, avgMax: null, buckets: [], students: [] }

export function getOverview(assignmentId: number): IntegrityOverview {
  const { similarityThreshold: threshold, similarityEnabled } = getSettings(null)
  const pairRows = similarityEnabled
    ? all<any>(
        `SELECT p.id, p.a_id, p.b_id, p.similarity, sa.name AS a_name, sa.mssv AS a_mssv, sb.name AS b_name, sb.mssv AS b_mssv
         FROM integrity_pairs p JOIN students sa ON sa.id = p.a_id JOIN students sb ON sb.id = p.b_id
         WHERE p.assignment_id = ? AND p.similarity >= ? ORDER BY p.similarity DESC`,
        [assignmentId, threshold]
      )
    : []
  const pairs: IntegrityPair[] = pairRows.map((r) => ({
    id: r.id,
    aId: r.a_id,
    bId: r.b_id,
    aName: r.a_name,
    bName: r.b_name,
    aMssv: r.a_mssv,
    bMssv: r.b_mssv,
    similarity: r.similarity,
    matches: []
  }))
  // Gom nhóm (cluster) bằng union-find
  const parent = new Map<number, number>()
  const find = (x: number): number => {
    if (!parent.has(x)) parent.set(x, x)
    const p = parent.get(x)!
    if (p === x) return x
    const r = find(p)
    parent.set(x, r)
    return r
  }
  for (const p of pairs) parent.set(find(p.aId), find(p.bId))
  const groups = new Map<number, Set<number>>()
  for (const p of pairs) {
    for (const id of [p.aId, p.bId]) {
      const root = find(id)
      if (!groups.has(root)) groups.set(root, new Set())
      groups.get(root)!.add(id)
    }
  }
  const info = new Map<number, { name: string; mssv: string }>()
  for (const p of pairs) {
    info.set(p.aId, { name: p.aName, mssv: p.aMssv })
    info.set(p.bId, { name: p.bName, mssv: p.bMssv })
  }
  const clusters = [...groups.values()]
    .filter((g) => g.size >= 3)
    .map((g) => ({
      members: [...g].map((id) => ({ id, ...info.get(id)! })),
      maxSimilarity: Math.max(...pairs.filter((p) => g.has(p.aId)).map((p) => p.similarity))
    }))
    .sort((x, y) => y.members.length - x.members.length)

  const sig = all<any>(
    `SELECT s.id, s.name, s.mssv, r.ai_signal, r.ai_penalty, r.ai_questions FROM students s JOIN results r ON r.student_id = s.id
     WHERE s.assignment_id = ? AND s.scan_status = 'valid' AND r.ai_signal IS NOT NULL`,
    [assignmentId]
  )
  const order = { high: 0, medium: 1, low: 2 }
  const aiSignals = sig
    .map((r) => {
      try {
        const s = JSON.parse(r.ai_signal)
        const pen = r.ai_penalty ? JSON.parse(r.ai_penalty) : null
        const q = r.ai_questions ? JSON.parse(r.ai_questions) : null
        return {
          id: r.id,
          name: r.name,
          mssv: r.mssv,
          level: s.level,
          count: (s.signals ?? []).length,
          aiPercent: s.estimate?.aiPercent ?? null,
          studentPercent: s.estimate?.studentPercent ?? null,
          confidence: s.estimate?.confidence ?? null,
          deduct: pen?.applied ? pen.deduct : null,
          questions: q?.items?.length ?? 0
        }
      } catch {
        return null
      }
    })
    .filter((x): x is NonNullable<typeof x> => !!x && x.level in order)
    .sort((x, y) => (y.aiPercent ?? -1) - (x.aiPercent ?? -1) || order[x.level] - order[y.level] || y.count - x.count)

  return {
    similarityEnabled,
    stats: similarityEnabled ? similarityStats(assignmentId, threshold) : EMPTY_STATS,
    pairs,
    clusters,
    aiSignals,
    lastRun: lastRun.get(assignmentId) ?? null,
    running: running.has(assignmentId)
  }
}

export function getPair(pairId: number): IntegrityPair {
  const r = all<any>(
    `SELECT p.*, sa.name AS a_name, sa.mssv AS a_mssv, sb.name AS b_name, sb.mssv AS b_mssv
     FROM integrity_pairs p JOIN students sa ON sa.id = p.a_id JOIN students sb ON sb.id = p.b_id WHERE p.id = ?`,
    [pairId]
  )[0]
  if (!r) throw new Error('Không tìm thấy cặp so sánh')
  return {
    id: r.id,
    aId: r.a_id,
    bId: r.b_id,
    aName: r.a_name,
    bName: r.b_name,
    aMssv: r.a_mssv,
    bMssv: r.b_mssv,
    similarity: r.similarity,
    matches: JSON.parse(r.matches || '[]')
  }
}

export function isIntegrityRunning(assignmentId: number): boolean {
  return running.has(assignmentId)
}

// Reset assignment: xoá kết quả so sánh cũ để trang Liêm chính không hiện số liệu của lần chấm trước.
export function clearIntegrity(assignmentId: number): void {
  run('DELETE FROM integrity_pairs WHERE assignment_id = ?', [assignmentId])
  lastRun.delete(assignmentId)
}
