import { evaluatePenalty, normalizePolicy } from '@shared/aiPolicy'
import { BUILTIN_PROFILES, DEFAULT_AI_POLICY, DEFAULT_REPORT_CHECK, round2, sourceLabel, sourcesFor } from '@shared/constants'
import type { AiPenalty, Assignment, AssignmentKind, Criterion, GradeStatus, StudentResult, StudentRow, TechProfile } from '@shared/types'
import { all, get, nowIso, run, transaction } from './db'
import { getSettings } from './settings'

// ───────────── Assignments ─────────────

const DEFAULT_ASSIGNMENT: Omit<Assignment, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  className: '',
  kind: 'code',
  reportCheck: DEFAULT_REPORT_CHECK,
  profileId: 'cpp',
  description: '',
  passThreshold: 5,
  rubric: [],
  testCases: [],
  ignoreWhitespace: true,
  timeLimitMs: 2000,
  memoryLimitMb: 256,
  backend: 'local',
  cloudProvider: 'gemini',
  cloudModel: '',
  cloudConsent: false,
  submissionsDir: '',
  starterDir: '',
  classList: [],
  aiPolicy: DEFAULT_AI_POLICY
}

function rowToAssignment(row: { id: number; data: string; created_at: string; updated_at: string }): Assignment {
  const data = JSON.parse(row.data)
  return {
    ...DEFAULT_ASSIGNMENT,
    ...data,
    kind: data.kind === 'report' ? 'report' : 'code',
    reportCheck: { ...DEFAULT_REPORT_CHECK, ...(data.reportCheck ?? {}) },
    aiPolicy: normalizePolicy(data.aiPolicy),
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function listAssignments(userId: number): Assignment[] {
  return all<any>('SELECT * FROM assignments WHERE user_id = ? ORDER BY updated_at DESC', [userId]).map(rowToAssignment)
}

export function getAssignment(id: number, userId?: number): Assignment {
  const row = userId
    ? get<any>('SELECT * FROM assignments WHERE id = ? AND user_id = ?', [id, userId])
    : get<any>('SELECT * FROM assignments WHERE id = ?', [id])
  if (!row) throw new Error('Không tìm thấy assignment')
  return rowToAssignment(row)
}

export function assignmentOwner(id: number): number | null {
  return get<{ user_id: number }>('SELECT user_id FROM assignments WHERE id = ?', [id])?.user_id ?? null
}

export function validateRubric(rubric: Criterion[], kind: AssignmentKind = 'code'): string | null {
  if (!rubric.length) return 'Rubric chưa có tiêu chí nào'
  const allowed = sourcesFor(kind)
  const bad = rubric.find((c) => !allowed.includes(c.source))
  if (bad) return `Tiêu chí "${bad.name}" dùng nguồn chấm "${sourceLabel(bad.source, kind)}" — không áp dụng cho bài báo cáo`
  const total = round2(rubric.reduce((s, c) => s + (Number(c.max) || 0), 0))
  if (Math.abs(total - 10) > 0.001) return `Tổng điểm rubric phải bằng 10 (hiện tại ${total})`
  const ids = new Set<string>()
  for (const c of rubric) {
    if (!c.name.trim()) return 'Có tiêu chí chưa đặt tên'
    if (ids.has(c.id)) return `Trùng mã tiêu chí: ${c.id}`
    ids.add(c.id)
  }
  return null
}

export function saveAssignment(userId: number, input: Partial<Assignment> & { id?: number }): Assignment {
  const now = nowIso()
  const { id, createdAt: _c, updatedAt: _u, ...rest } = input as any
  if (id) {
    const current = getAssignment(id, userId)
    const merged = { ...current, ...rest }
    delete (merged as any).id
    delete (merged as any).createdAt
    delete (merged as any).updatedAt
    run('UPDATE assignments SET data = ?, updated_at = ? WHERE id = ? AND user_id = ?', [JSON.stringify(merged), now, id, userId])
    return getAssignment(id, userId)
  }
  const data = { ...DEFAULT_ASSIGNMENT, ...rest }
  const { lastId } = run('INSERT INTO assignments (user_id, data, created_at, updated_at) VALUES (?, ?, ?, ?)', [
    userId,
    JSON.stringify(data),
    now,
    now
  ])
  return getAssignment(lastId, userId)
}

export function deleteAssignment(userId: number, id: number): void {
  transaction(() => {
    const ids = all<{ id: number }>('SELECT id FROM students WHERE assignment_id = ?', [id]).map((r) => r.id)
    for (const sid of ids) run('DELETE FROM results WHERE student_id = ?', [sid])
    run('DELETE FROM students WHERE assignment_id = ?', [id])
    run('DELETE FROM integrity_pairs WHERE assignment_id = ?', [id])
    run('DELETE FROM assignments WHERE id = ? AND user_id = ?', [id, userId])
  })
}

// ───────────── Tech profiles ─────────────

export function listProfiles(userId: number): TechProfile[] {
  const custom = all<{ id: string; data: string }>('SELECT id, data FROM profiles WHERE user_id = ?', [userId])
  const map = new Map<string, TechProfile>()
  for (const p of BUILTIN_PROFILES) map.set(p.id, structuredClone(p))
  for (const row of custom) {
    try {
      const p = JSON.parse(row.data) as TechProfile
      map.set(row.id, { ...p, id: row.id, builtin: BUILTIN_PROFILES.some((b) => b.id === row.id) })
    } catch {
      /* bỏ qua */
    }
  }
  return [...map.values()]
}

export function getProfile(userId: number, id: string): TechProfile {
  const p = listProfiles(userId).find((x) => x.id === id)
  if (!p) throw new Error('Không tìm thấy Tech Profile: ' + id)
  return p
}

export function saveProfile(userId: number, profile: TechProfile): void {
  if (!/^[a-z0-9_-]{2,32}$/.test(profile.id)) throw new Error('Mã profile chỉ gồm a-z, 0-9, _ - (2–32 ký tự)')
  run('INSERT INTO profiles (id, user_id, data) VALUES (?, ?, ?) ON CONFLICT(user_id, id) DO UPDATE SET data = excluded.data', [
    profile.id,
    userId,
    JSON.stringify(profile)
  ])
}

export function deleteProfile(userId: number, id: string): void {
  run('DELETE FROM profiles WHERE user_id = ? AND id = ?', [userId, id])
}

// ───────────── Rubric templates ─────────────

export function listRubricTemplates(userId: number): { id: number; name: string; profileId: string; rubric: Criterion[] }[] {
  return all<any>('SELECT * FROM rubric_templates WHERE user_id = ? ORDER BY name', [userId]).map((r) => ({
    id: r.id,
    name: r.name,
    profileId: r.profile_id,
    rubric: JSON.parse(r.rubric)
  }))
}

export function saveRubricTemplate(userId: number, name: string, profileId: string, rubric: Criterion[]): void {
  run('INSERT INTO rubric_templates (user_id, name, profile_id, rubric, created_at) VALUES (?, ?, ?, ?, ?)', [
    userId,
    name,
    profileId,
    JSON.stringify(rubric),
    nowIso()
  ])
}

export function deleteRubricTemplate(userId: number, id: number): void {
  run('DELETE FROM rubric_templates WHERE user_id = ? AND id = ?', [userId, id])
}

// ───────────── Students & results ─────────────

const j = (s: string | null | undefined, def: any): any => {
  if (!s) return def
  try {
    return JSON.parse(s)
  } catch {
    return def
  }
}


export function listStudents(assignmentId: number): StudentRow[] {
  const similarityOn = getSettings(null).similarityEnabled
  const rows = all<any>(
    `SELECT s.*, r.status, r.total, r.backend, r.model, r.reviewed, r.overrides, r.ai_signal, r.ai_penalty, r.error, r.duration_ms,
       (SELECT MAX(p.similarity) FROM integrity_pairs p WHERE p.assignment_id = s.assignment_id AND (p.a_id = s.id OR p.b_id = s.id)) AS max_sim
     FROM students s LEFT JOIN results r ON r.student_id = s.id
     WHERE s.assignment_id = ? ORDER BY s.ord, s.mssv, s.name`,
    [assignmentId]
  )
  return rows.map((r) => {
    let aiLevel: StudentRow['aiLevel'] = null
    let aiPercent: number | null = null
    let aiConfidence: StudentRow['aiConfidence'] = null
    try {
      const sig = r.ai_signal ? JSON.parse(r.ai_signal) : null
      aiLevel = sig?.level ?? null
      aiPercent = sig?.estimate?.aiPercent ?? null
      aiConfidence = sig?.estimate?.confidence ?? null
    } catch {
      /* bỏ qua */
    }
    const pen = j(r.ai_penalty, null) as AiPenalty | null
    let hasOverride = false
    try {
      hasOverride = Object.keys(JSON.parse(r.overrides || '{}')).length > 0
    } catch {
      /* bỏ qua */
    }
    return {
      id: r.id,
      assignmentId: r.assignment_id,
      mssv: r.mssv,
      name: r.name,
      zipPath: r.zip_path,
      zipMtime: r.zip_mtime,
      scanStatus: r.scan_status,
      scanNote: r.scan_note,
      altFiles: JSON.parse(r.alt_files || '[]'),
      status: (r.status ?? 'pending') as GradeStatus,
      total: r.total ?? null,
      backend: r.backend ?? '',
      model: r.model ?? '',
      reviewed: !!r.reviewed,
      hasOverride,
      aiLevel,
      aiPercent,
      aiConfidence,
      aiDeduct: pen?.applied ? pen.deduct : null,
      maxSimilarity: similarityOn ? (r.max_sim ?? null) : null,
      error: r.error ?? '',
      durationMs: r.duration_ms ?? null
    }
  })
}

export function getStudent(id: number): StudentRow {
  const row = get<{ assignment_id: number }>('SELECT assignment_id FROM students WHERE id = ?', [id])
  if (!row) throw new Error('Không tìm thấy sinh viên')
  const s = listStudents(row.assignment_id).find((x) => x.id === id)
  if (!s) throw new Error('Không tìm thấy sinh viên')
  return s
}

export function studentAssignmentId(id: number): number {
  const row = get<{ assignment_id: number }>('SELECT assignment_id FROM students WHERE id = ?', [id])
  if (!row) throw new Error('Không tìm thấy sinh viên')
  return row.assignment_id
}

export function getResult(studentId: number): StudentResult {
  const r = get<any>('SELECT * FROM results WHERE student_id = ?', [studentId])
  if (!r) {
    return {
      studentId,
      status: 'pending',
      backend: '',
      model: '',
      total: null,
      criteria: [],
      issues: [],
      summary: '',
      auto: {},
      aiSignal: null,
      aiPenalty: null,
      aiQuestions: null,
      overrides: {},
      teacherNote: '',
      reviewed: false,
      error: '',
      detectedProfile: '',
      warnings: [],
      startedAt: null,
      finishedAt: null
    }
  }
  return {
    studentId,
    status: r.status,
    backend: r.backend,
    model: r.model,
    total: r.total,
    criteria: j(r.criteria, []),
    issues: j(r.issues, []),
    summary: r.summary,
    auto: j(r.auto, {}),
    aiSignal: j(r.ai_signal, null),
    aiPenalty: j(r.ai_penalty, null),
    aiQuestions: j(r.ai_questions, null),
    overrides: j(r.overrides, {}),
    teacherNote: r.teacher_note,
    reviewed: !!r.reviewed,
    error: r.error,
    detectedProfile: r.detected_profile,
    warnings: j(r.warnings, []),
    startedAt: r.started_at,
    finishedAt: r.finished_at
  }
}

export function ensureResult(studentId: number): void {
  run('INSERT OR IGNORE INTO results (student_id) VALUES (?)', [studentId])
}

export function setStatus(studentId: number, status: GradeStatus, error = ''): void {
  ensureResult(studentId)
  run('UPDATE results SET status = ?, error = ? WHERE student_id = ?', [status, error, studentId])
}

export function updateResult(studentId: number, patch: Record<string, unknown>): void {
  ensureResult(studentId)
  const cols = Object.keys(patch)
  if (!cols.length) return
  const values = cols.map((c) => {
    const v = patch[c]
    if (v === undefined) return null
    if (v !== null && typeof v === 'object') return JSON.stringify(v)
    if (typeof v === 'boolean') return v ? 1 : 0
    return v as any
  })
  run(`UPDATE results SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE student_id = ?`, [...values, studentId])
}

export function getFingerprint(studentId: number): any {
  const r = get<{ fingerprint: string | null }>('SELECT fingerprint FROM results WHERE student_id = ?', [studentId])
  return j(r?.fingerprint, null)
}

// Tổng điểm = điểm từng tiêu chí (ưu tiên điểm giáo viên đã sửa) − điểm trừ do dùng AI (nếu đang áp), không âm.
export function computeTotal(criteria: StudentResult['criteria'], overrides: Record<string, number>, penalty?: AiPenalty | null): number | null {
  if (!criteria.length) return null
  let sum = 0
  for (const c of criteria) {
    const v = c.id in overrides ? overrides[c.id] : c.score
    sum += v ?? 0
  }
  if (penalty?.applied) sum -= penalty.deduct
  return round2(Math.max(0, sum))
}

// Chính sách AI của assignment thay đổi → tính lại điểm trừ + tổng điểm cho các bài đã chấm.
export function recomputePenalties(assignmentId: number): void {
  const a = getAssignment(assignmentId)
  const ids = all<{ id: number }>('SELECT id FROM students WHERE assignment_id = ?', [assignmentId]).map((r) => r.id)
  transaction(() => {
    for (const id of ids) {
      const r = getResult(id)
      if (!r.criteria.length || !['completed', 'reviewed'].includes(r.status)) continue
      const penalty = evaluatePenalty(a.aiPolicy, r.aiSignal?.estimate, r.aiPenalty)
      updateResult(id, { ai_penalty: penalty, total: computeTotal(r.criteria, r.overrides, penalty) })
    }
  })
}
