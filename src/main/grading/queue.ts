// Grading Queue: chấm LẦN LƯỢT từng sinh viên (Local và Cloud), chạy nền ngoài UI thread.
// Tạm dừng / tiếp tục / huỷ; đóng app giữa chừng thì lần mở sau tiếp tục từ chỗ dừng.
import { powerSaveBlocker } from 'electron'
import type { QueueState } from '@shared/types'
import { getLocalState } from '../ai/llama'
import { all, get, run, transaction } from '../db'
import { emit } from '../events'
import { clearIntegrity, isIntegrityRunning, runIntegrity } from '../integrity/service'
import { getAssignment, getStudent, listStudents, setStatus, validateRubric } from '../repo'
import { getSettings } from '../settings'
import { backendFor, gradeStudent } from './pipeline'

const state: QueueState = {
  assignmentId: null,
  running: false,
  paused: false,
  currentStudentId: null,
  currentStep: '',
  done: 0,
  total: 0,
  etaSec: null,
  avgSec: null
}

let ids: number[] = []
let controller: AbortController | null = null
let loopPromise: Promise<void> | null = null
let sleepBlocker: number | null = null
let durations: number[] = []

function persist(): void {
  run(
    "INSERT INTO settings (user_id, key, value) VALUES (0, 'queueState', ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value",
    [JSON.stringify({ assignmentId: state.assignmentId, running: state.running && !state.paused, paused: state.paused, ids })]
  )
}

function publish(): void {
  emit('queue:state', { ...state })
}

export function getQueueState(): QueueState {
  return { ...state }
}

function updateEta(): void {
  const remaining = Math.max(0, state.total - state.done)
  let avg: number | null = null
  if (durations.length) avg = durations.reduce((s, d) => s + d, 0) / durations.length
  else if (state.assignmentId) {
    const r = get<{ a: number | null }>(
      `SELECT AVG(r.duration_ms) AS a FROM results r JOIN students s ON s.id = r.student_id
       WHERE s.assignment_id = ? AND r.status IN ('completed','reviewed') AND r.duration_ms > 0`,
      [state.assignmentId]
    )
    if (r?.a) avg = r.a / 1000
  }
  state.avgSec = avg
  state.etaSec = avg !== null ? Math.round(avg * remaining) : null
}

export function canStart(assignmentId: number): { ok: boolean; reason?: string } {
  const a = getAssignment(assignmentId)
  const rubricErr = validateRubric(a.rubric)
  if (rubricErr) return { ok: false, reason: rubricErr }
  const valid = listStudents(assignmentId).filter((s) => s.scanStatus === 'valid')
  if (!valid.length) return { ok: false, reason: 'Chưa có bài nộp hợp lệ — hãy chọn folder và quét bài nộp' }
  if (a.rubric.some((c) => c.source === 'ai')) {
    try {
      backendFor(a)
    } catch (e: any) {
      return { ok: false, reason: e.message }
    }
  }
  return { ok: true }
}

/**
 * Bắt đầu chấm. studentIds: danh sách cụ thể (chấm lại 1 bài) hoặc rỗng = cả lớp.
 * mode 'remaining': chỉ bài chưa chấm / lỗi; 'all': chấm lại cả lớp (trừ bài giáo viên đã sửa/duyệt).
 */
export function startQueue(assignmentId: number, studentIds: number[] = [], mode: 'remaining' | 'all' = 'remaining'): QueueState {
  if (state.running && state.assignmentId !== assignmentId) throw new Error('Đang chấm một assignment khác — hãy tạm dừng hoặc huỷ trước')
  const check = canStart(assignmentId)
  if (!check.ok) throw new Error(check.reason)
  const students = listStudents(assignmentId).filter((s) => s.scanStatus === 'valid')
  let targets = studentIds.length ? students.filter((s) => studentIds.includes(s.id)) : students
  if (!studentIds.length) {
    targets =
      mode === 'all'
        ? targets.filter((s) => !s.reviewed && !s.hasOverride)
        : targets.filter((s) => ['pending', 'failed', 'cancelled'].includes(s.status) || s.status === undefined)
  }
  for (const s of targets) setStatus(s.id, 'pending')
  const newIds = targets.map((s) => s.id)
  if (state.running && state.assignmentId === assignmentId) {
    for (const id of newIds) if (!ids.includes(id)) ids.push(id)
    state.total = ids.length
  } else {
    ids = newIds
    durations = []
    state.assignmentId = assignmentId
    state.done = 0
    state.total = ids.length
  }
  state.paused = false
  persist()
  ensureLoop()
  publish()
  return getQueueState()
}

function ensureLoop(): void {
  if (loopPromise) return
  state.running = true
  const s = getSettings(null)
  if (s.preventSleep && sleepBlocker === null) sleepBlocker = powerSaveBlocker.start('prevent-app-suspension')
  loopPromise = loop().finally(() => {
    loopPromise = null
    state.running = false
    state.currentStudentId = null
    state.currentStep = ''
    if (sleepBlocker !== null) {
      powerSaveBlocker.stop(sleepBlocker)
      sleepBlocker = null
    }
    persist()
    publish()
  })
}

async function loop(): Promise<void> {
  const assignmentId = state.assignmentId!
  for (;;) {
    if (state.paused) return
    const nextId = ids.find((id) => {
      const r = get<{ status: string }>('SELECT status FROM results WHERE student_id = ?', [id])
      return !r || r.status === 'pending'
    })
    if (nextId === undefined) break
    state.done = ids.filter((id) => {
      const r = get<{ status: string }>('SELECT status FROM results WHERE student_id = ?', [id])
      return r && !['pending', 'extracting', 'analyzing', 'ai_grading'].includes(r.status)
    }).length
    updateEta()
    const a = getAssignment(assignmentId)
    const student = getStudent(nextId)
    state.currentStudentId = nextId
    state.currentStep = 'Bắt đầu'
    publish()
    controller = new AbortController()
    const t0 = Date.now()
    try {
      await gradeStudent(
        student,
        a,
        controller.signal,
        (step) => {
          state.currentStep = step
          publish()
        },
        () => emit('students:changed', { assignmentId })
      )
      durations.push((Date.now() - t0) / 1000)
      if (durations.length > 20) durations.shift()
    } catch {
      // huỷ / tạm dừng: gradeStudent đã đưa bài về pending
      if (state.paused) return
    } finally {
      controller = null
      emit('students:changed', { assignmentId })
    }
    // Local AI bị dừng giữa chừng → tạm dừng hàng đợi thay vì đánh lỗi cả lớp
    if (a.backend === 'local' && a.rubric.some((c) => c.source === 'ai') && getLocalState().kind !== 'ready') {
      state.paused = true
      state.currentStep = 'Tạm dừng: Local AI không sẵn sàng'
      return
    }
  }
  state.done = state.total
  updateEta()
  publish()
  // So sánh trùng lặp chạy sau khi chấm xong cả lớp (nếu bật trong Cài đặt)
  if (getSettings(null).similarityEnabled) void runIntegrity(assignmentId).catch(() => {})
}

export function pauseQueue(): void {
  if (!state.running) return
  state.paused = true
  controller?.abort()
  persist()
  publish()
}

export function resumeQueue(): void {
  if (!state.assignmentId) return
  const check = canStart(state.assignmentId)
  if (!check.ok) throw new Error(check.reason)
  state.paused = false
  persist()
  ensureLoop()
  publish()
}

export async function cancelQueue(): Promise<void> {
  const assignmentId = state.assignmentId
  state.paused = true
  controller?.abort()
  if (loopPromise) await loopPromise.catch(() => {})
  for (const id of ids) {
    const r = get<{ status: string }>('SELECT status FROM results WHERE student_id = ?', [id])
    if (!r || ['pending', 'extracting', 'analyzing', 'ai_grading'].includes(r.status)) setStatus(id, 'cancelled')
  }
  ids = []
  state.total = 0
  state.done = 0
  state.assignmentId = null
  state.paused = false
  persist()
  publish()
  if (assignmentId) emit('students:changed', { assignmentId })
}

/**
 * Reset & chấm lại từ đầu: xoá toàn bộ kết quả chấm của assignment (kể cả điểm giáo viên đã sửa, trạng thái duyệt,
 * điểm trừ AI, câu hỏi vấn đáp, fingerprint) và kết quả so sánh trùng lặp, rồi chấm lại cả lớp.
 * Ghi chú giáo viên được giữ. Sau khi chấm xong, so sánh trùng lặp tự chạy lại (nếu bật).
 */
export async function resetAndRegrade(assignmentId: number): Promise<QueueState> {
  if (state.running && state.assignmentId !== assignmentId) throw new Error('Đang chấm một assignment khác — hãy tạm dừng hoặc huỷ trước')
  if (isIntegrityRunning(assignmentId)) throw new Error('Đang so sánh trùng lặp cho assignment này — hãy đợi chạy xong rồi reset')
  // Kiểm tra trước khi xoá để không mất kết quả cũ khi chưa thể chấm lại
  const check = canStart(assignmentId)
  if (!check.ok) throw new Error(check.reason)
  if (state.assignmentId === assignmentId) await cancelQueue()
  transaction(() => {
    run(
      `UPDATE results SET status = 'pending', backend = '', model = '', total = NULL, criteria = '[]', issues = '[]', summary = '',
         auto = '{}', ai_signal = NULL, ai_penalty = NULL, ai_questions = NULL, overrides = '{}', reviewed = 0, error = '',
         detected_profile = '', warnings = '[]', fingerprint = NULL, started_at = NULL, finished_at = NULL, duration_ms = NULL
       WHERE student_id IN (SELECT id FROM students WHERE assignment_id = ?)`,
      [assignmentId]
    )
    clearIntegrity(assignmentId)
  })
  emit('students:changed', { assignmentId })
  emit('integrity:status', { assignmentId, running: false })
  return startQueue(assignmentId, [], 'remaining')
}

// Khởi động app: các bài đang chấm dở được đưa về "Chờ chấm"; nếu lần trước đang chạy thì tiếp tục.
export function recoverOnStartup(): void {
  run(
    "UPDATE results SET status = 'pending' WHERE status IN ('extracting','analyzing','ai_grading')"
  )
  const row = get<{ value: string }>("SELECT value FROM settings WHERE user_id = 0 AND key = 'queueState'")
  if (!row) return
  try {
    const saved = JSON.parse(row.value)
    if (saved.assignmentId && Array.isArray(saved.ids) && saved.ids.length) {
      state.assignmentId = saved.assignmentId
      ids = saved.ids
      state.total = ids.length
      state.paused = true
      ;(state as any).resumeOnReady = !!saved.running
    }
  } catch {
    /* bỏ qua */
  }
}

// Gọi khi đăng nhập/AI sẵn sàng: tự tiếp tục hàng đợi bị gián đoạn của user hiện tại.
export function tryAutoResume(userId: number): void {
  if (!(state as any).resumeOnReady || !state.assignmentId || state.running) return
  const owner = get<{ user_id: number }>('SELECT user_id FROM assignments WHERE id = ?', [state.assignmentId])?.user_id
  if (owner !== userId) return
  if (!canStart(state.assignmentId).ok) return
  ;(state as any).resumeOnReady = false
  resumeQueue()
}

export function pendingCount(assignmentId: number): number {
  return (
    all<{ c: number }>(
      `SELECT COUNT(*) AS c FROM students s LEFT JOIN results r ON r.student_id = s.id
       WHERE s.assignment_id = ? AND s.scan_status = 'valid' AND (r.status IS NULL OR r.status IN ('pending','extracting','analyzing','ai_grading','failed'))`,
      [assignmentId]
    )[0]?.c ?? 0
  )
}
