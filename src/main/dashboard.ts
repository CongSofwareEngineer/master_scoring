import { round2 } from '@shared/constants'
import type { DashboardData } from '@shared/types'
import { getOverview } from './integrity/service'
import { getAssignment, getResult, listStudents } from './repo'

export function dashboardData(assignmentId: number): DashboardData {
  const a = getAssignment(assignmentId)
  const all = listStudents(assignmentId)
  const valid = all.filter((s) => s.scanStatus === 'valid')
  const graded = valid.filter((s) => (s.status === 'completed' || s.status === 'reviewed') && s.total !== null)
  const scores = graded.map((s) => s.total as number).sort((x, y) => x - y)
  const avg = scores.length ? round2(scores.reduce((s, v) => s + v, 0) / scores.length) : null
  const median = scores.length
    ? scores.length % 2
      ? scores[(scores.length - 1) / 2]
      : round2((scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2)
    : null
  const histogram = new Array(10).fill(0)
  for (const v of scores) histogram[Math.min(9, Math.floor(v))]++

  const sums = new Map<string, { sum: number; n: number }>()
  let compileFailed = 0
  for (const s of graded) {
    const r = getResult(s.id)
    if (r.auto.compile?.attempted && !r.auto.compile.ok) compileFailed++
    for (const c of r.criteria) {
      const v = c.id in r.overrides ? r.overrides[c.id] : c.score
      if (v === null || v === undefined) continue
      const e = sums.get(c.id) ?? { sum: 0, n: 0 }
      e.sum += v
      e.n++
      sums.set(c.id, e)
    }
  }
  const criteriaAvg = a.rubric.map((c) => {
    const e = sums.get(c.id)
    return { id: c.id, name: c.name, max: c.max, avg: e && e.n ? round2(e.sum / e.n) : 0 }
  })

  const aiFlagged = graded.filter((s) => s.aiLevel === 'medium' || s.aiLevel === 'high').length
  const withPct = graded.filter((s) => s.aiPercent !== null)
  const aiAvgPercent = withPct.length ? Math.round(withPct.reduce((a, s) => a + s.aiPercent!, 0) / withPct.length) : null
  const aiPenalized = graded.filter((s) => (s.aiDeduct ?? 0) > 0).length
  const integrity = getOverview(assignmentId)
  const count = (st: string): number => all.filter((s) => s.scanStatus === st).length
  const failed = valid.filter((s) => s.status === 'failed').length
  const alerts = [
    { kind: 'needs_assign', count: count('needs_assign'), label: 'file zip sai định dạng tên (cần gán MSSV)' },
    { kind: 'broken', count: count('broken'), label: 'file zip hỏng / có mật khẩu' },
    { kind: 'unsupported', count: count('unsupported'), label: 'file .rar/.7z không hỗ trợ' },
    { kind: 'duplicate', count: count('duplicate_old'), label: 'lần nộp trùng MSSV' },
    { kind: 'compile', count: compileFailed, label: 'bài không compile được' },
    { kind: 'failed', count: failed, label: 'bài chấm lỗi' },
    { kind: 'missing', count: count('missing'), label: 'sinh viên chưa nộp' }
  ].filter((x) => x.count > 0)

  const recent = valid
    .map((s) => ({ s, r: getResult(s.id) }))
    .filter((x) => x.r.finishedAt && x.r.status !== 'pending')
    .sort((x, y) => (y.r.finishedAt! > x.r.finishedAt! ? 1 : -1))
    .slice(0, 8)
    .map((x) => ({ id: x.s.id, name: x.s.name, mssv: x.s.mssv, total: x.s.total, status: x.s.status, finishedAt: x.r.finishedAt! }))

  return {
    students: valid.length,
    graded: graded.length,
    average: avg,
    median,
    max: scores.length ? scores[scores.length - 1] : null,
    min: scores.length ? scores[0] : null,
    passRate: scores.length ? Math.round((scores.filter((v) => v >= a.passThreshold).length / scores.length) * 100) : null,
    pending: valid.filter((s) => ['pending', 'extracting', 'analyzing', 'ai_grading', 'failed'].includes(s.status)).length,
    histogram,
    criteriaAvg,
    aiReview: aiFlagged,
    aiMediumHighRate: graded.length ? Math.round((aiFlagged / graded.length) * 100) : null,
    aiAvgPercent,
    aiPenalized,
    similarityEnabled: integrity.similarityEnabled,
    similarPairs: integrity.pairs.length,
    similarStudents: integrity.stats.flagged,
    clusters: integrity.clusters.length,
    alerts,
    recent
  }
}
