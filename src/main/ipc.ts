// Đăng ký toàn bộ IPC handler. Mọi handler trả về { ok, data } | { ok: false, error } để UI hiển thị lỗi rõ ràng.
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync } from 'fs'
import { evaluatePenalty, normalizePolicy } from '@shared/aiPolicy'
import { round2 } from '@shared/constants'
import { translate } from '@shared/i18n'
import { REPORT_EXTS, SUPPORTED_EXTS } from '@shared/submissionName'
import type { Assignment, CloudProvider, Criterion, Lang, TechProfile } from '@shared/types'
import { cloudBackend, getCloudConfig, saveCloudConfig, testConnection } from './ai/client'
import { aiStatus, ensureLocalStarted, installAndUse, pauseModelDownload, restartLocal, switchModel } from './ai/manager'
import { getLocalState, stopLocal } from './ai/llama'
import { currentDownload, deleteModel, hasPartial, importModelFile, listModels } from './ai/models'
import { downloadMingw, findCompiler } from './analysis/mingw'
import { findForge, findSolc } from './analysis/solidity'
import { auth, changePassword, defaultAccountHint, getCurrentUser, requireUser, setCurrentUser, updateProfile } from './auth'
import { backupTo, cleanWork, restoreFrom, storageUsage } from './backup'
import { dashboardData } from './dashboard'
import { emit } from './events'
import { getHardware } from './hardware'
import { parseClassList } from './importer/classlist'
import { assignManually, chooseAlternateFile, scanFolder, summarize } from './importer/scan'
import { getOverview, getPair, runIntegrity } from './integrity/service'
import { regenerateQuestions } from './grading/pipeline'
import { cancelQueue, canStart, getQueueState, pauseQueue, resetAndRegrade, resumeQueue, startQueue, tryAutoResume } from './grading/queue'
import { clearNetLog, listNetLog } from './netlog'
import { paths } from './paths'
import {
  assignmentOwner,
  computeTotal,
  deleteAssignment,
  deleteProfile,
  deleteRubricTemplate,
  getAssignment,
  getResult,
  listAssignments,
  listProfiles,
  listRubricTemplates,
  listStudents,
  recomputePenalties,
  saveAssignment,
  saveProfile,
  saveRubricTemplate,
  studentAssignmentId,
  updateResult
} from './repo'
import { defaultReportName, exportCsv, exportExcel, exportPdf, reportColumns } from './reports/reports'
import { invalidateReview, listFiles, readFile, readRawFile, searchProject } from './review'
import { getSettings, updateSettings } from './settings'

type Handler = (...args: any[]) => any

function handle(channel: string, fn: Handler): void {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  })
}

function win(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

function ownAssignment(id: number): Assignment {
  const u = requireUser()
  return getAssignment(id, u.id)
}

function ownStudent(studentId: number): number {
  const aid = studentAssignmentId(studentId)
  if (assignmentOwner(aid) !== requireUser().id) throw new Error('Không có quyền truy cập')
  return aid
}

export function registerIpc(): void {
  // ───── Ứng dụng ─────
  handle('app:info', () => ({ platform: process.platform, version: app.getVersion(), dataDir: paths.root }))
  handle('app:openPath', (p: string) => {
    if (existsSync(p)) shell.showItemInFolder(p)
  })
  handle('app:openExternal', (url: string) => {
    if (/^https:\/\//.test(url)) return shell.openExternal(url)
    return undefined
  })

  // ───── Tài khoản ─────
  handle('auth:hasUser', () => auth.hasAnyUser())
  handle('auth:current', () => getCurrentUser())
  handle('auth:register', async (username: string, password: string, displayName: string) => {
    const u = await auth.register(username, password, displayName)
    setCurrentUser(u)
    return u
  })
  handle('auth:login', async (username: string, password: string) => {
    const u = await auth.login(username, password)
    setCurrentUser(u)
    void ensureLocalStarted().then(() => tryAutoResume(u.id))
    return u
  })
  handle('auth:logout', () => setCurrentUser(null))
  handle('auth:changePassword', (oldPw: string, newPw: string) => changePassword(requireUser().id, oldPw, newPw))
  handle('auth:updateProfile', (username: string, displayName: string) => updateProfile(requireUser().id, username, displayName))
  handle('auth:defaultHint', () => defaultAccountHint())

  // ───── Cài đặt ─────
  handle('settings:get', () => getSettings(getCurrentUser()?.id ?? null))
  handle('settings:update', (patch) => {
    requireUser()
    if (patch.similarityThreshold !== undefined && !(patch.similarityThreshold >= 30 && patch.similarityThreshold <= 100))
      throw new Error('Ngưỡng trùng lặp phải trong khoảng 30–100%')
    if (patch.aiQuestionsMinPercent !== undefined && !(patch.aiQuestionsMinPercent >= 0 && patch.aiQuestionsMinPercent <= 100))
      throw new Error('Ngưỡng % code AI để đề xuất câu hỏi phải trong khoảng 0–100%')
    return updateSettings(getCurrentUser()!.id, patch)
  })

  // ───── AI ─────
  handle('ai:status', () => aiStatus(getCurrentUser()?.id ?? null))
  handle('ai:hardware', () => getHardware(getSettings(null).modelsDir))
  handle('ai:models', () => listModels().map((m) => ({ ...m, partial: hasPartial(m.id) })))
  handle('ai:install', (modelId: string) => {
    requireUser()
    void installAndUse(modelId).then(() => {
      const u = getCurrentUser()
      if (u) tryAutoResume(u.id)
    })
  })
  handle('ai:pauseDownload', () => pauseModelDownload())
  handle('ai:download', () => currentDownload())
  handle('ai:switch', (modelId: string) => switchModel(modelId))
  handle('ai:restart', () => restartLocal())
  handle('ai:stop', () => stopLocal())
  handle('ai:start', () => ensureLocalStarted())
  handle('ai:deleteModel', async (modelId: string) => {
    const st = getLocalState()
    if ((st.kind === 'ready' || st.kind === 'starting') && st.modelId === modelId) await stopLocal()
    await deleteModel(modelId)
  })
  handle('ai:importModel', async (modelId: string) => {
    requireUser()
    const r = await dialog.showOpenDialog(win()!, { title: 'Nhập file model (.gguf)', filters: [{ name: 'GGUF', extensions: ['gguf'] }], properties: ['openFile'] })
    if (r.canceled || !r.filePaths[0]) return false
    await importModelFile(modelId, r.filePaths[0])
    return true
  })
  handle('ai:changeModelsDir', async () => {
    requireUser()
    const r = await dialog.showOpenDialog(win()!, { title: 'Chọn thư mục lưu model', properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return null
    updateSettings(null, { modelsDir: r.filePaths[0] })
    return r.filePaths[0]
  })
  handle('ai:cloudConfig', async () => {
    const u = requireUser()
    return { ...getCloudConfig(u.id), configured: (await aiStatus(u.id)).cloudConfigured }
  })
  handle('ai:cloudConfigured', async () => (await aiStatus(requireUser().id)).cloudConfigured)
  handle('ai:saveCloud', (provider: CloudProvider, apiKey: string | null, model: string, url?: string) => {
    saveCloudConfig(requireUser().id, provider, apiKey, model, url)
    emit('ai:cloud-changed')
  })
  handle('ai:testCloud', async (provider: CloudProvider, apiKey: string | null, model: string, url?: string) => {
    const u = requireUser()
    if (apiKey !== null || url !== undefined) saveCloudConfig(u.id, provider, apiKey, model, url)
    return testConnection(cloudBackend(u.id, provider, model))
  })

  // ───── Assignments ─────
  handle('assign:list', () => listAssignments(requireUser().id))
  handle('assign:get', (id: number) => ownAssignment(id))
  handle('assign:save', (data: Partial<Assignment>) => {
    const u = requireUser()
    if (data.rubric) data.rubric = data.rubric.map((c) => ({ ...c, max: round2(Number(c.max) || 0) }))
    if (data.aiPolicy) data.aiPolicy = normalizePolicy(data.aiPolicy)
    const prev = data.id ? getAssignment(data.id, u.id) : null
    const before = prev ? JSON.stringify(prev.aiPolicy) : null
    const saved = saveAssignment(u.id, data)
    // Đổi loại bài (code ↔ báo cáo) → cách đọc bài nộp đổi, bỏ cache Code Review
    if (prev && prev.kind !== saved.kind) invalidateReview()
    if (before !== null && before !== JSON.stringify(saved.aiPolicy)) {
      recomputePenalties(saved.id)
      emit('students:changed', { assignmentId: saved.id })
    }
    return saved
  })
  handle('assign:delete', (id: number) => deleteAssignment(requireUser().id, id))
  handle('assign:pickFolder', async (id: number) => {
    const a = ownAssignment(id)
    const r = await dialog.showOpenDialog(win()!, {
      title: 'Chọn folder chứa file nén bài nộp',
      defaultPath: a.submissionsDir || undefined,
      properties: ['openDirectory']
    })
    if (r.canceled || !r.filePaths[0]) return null
    return saveAssignment(requireUser().id, { id, submissionsDir: r.filePaths[0] })
  })
  handle('assign:pickStarter', async (id: number, kind: 'folder' | 'zip') => {
    const a = ownAssignment(id)
    const exts = a.kind === 'report' ? [...REPORT_EXTS, ...SUPPORTED_EXTS] : SUPPORTED_EXTS
    const r = await dialog.showOpenDialog(win()!, {
      title: a.kind === 'report' ? 'Chọn mẫu báo cáo giáo viên phát' : 'Chọn code khung (starter code)',
      properties: kind === 'folder' ? ['openDirectory'] : ['openFile'],
      filters: kind === 'zip' ? [{ name: a.kind === 'report' ? 'File Word / Excel / PowerPoint / file nén' : 'File nén', extensions: exts.map((e) => e.slice(1)) }] : undefined
    })
    if (r.canceled || !r.filePaths[0]) return null
    return saveAssignment(requireUser().id, { id, starterDir: r.filePaths[0] })
  })
  handle('assign:scan', async (id: number) => {
    const a = ownAssignment(id)
    const summary = await scanFolder(a, (done, total) => emit('scan:progress', { assignmentId: id, done, total }))
    invalidateReview()
    emit('students:changed', { assignmentId: id })
    return summary
  })
  handle('assign:summary', (id: number) => {
    ownAssignment(id)
    return summarize(id)
  })
  handle('assign:importClassList', async (id: number) => {
    ownAssignment(id)
    const r = await dialog.showOpenDialog(win()!, {
      title: 'Chọn danh sách lớp (Excel/CSV)',
      filters: [{ name: 'Danh sách lớp', extensions: ['xlsx', 'csv', 'txt'] }],
      properties: ['openFile']
    })
    if (r.canceled || !r.filePaths[0]) return null
    const list = await parseClassList(r.filePaths[0])
    return saveAssignment(requireUser().id, { id, classList: list })
  })

  // ───── Sinh viên & kết quả ─────
  handle('students:list', (aid: number) => {
    ownAssignment(aid)
    return listStudents(aid)
  })
  handle('students:assign', (studentId: number, mssv: string, name: string) => {
    const aid = ownStudent(studentId)
    assignManually(studentId, mssv, name)
    emit('students:changed', { assignmentId: aid })
  })
  handle('students:chooseFile', (studentId: number, path: string) => {
    const aid = ownStudent(studentId)
    chooseAlternateFile(studentId, path)
    invalidateReview(studentId)
    emit('students:changed', { assignmentId: aid })
  })
  handle('result:get', (studentId: number) => {
    ownStudent(studentId)
    return getResult(studentId)
  })
  handle('result:override', (studentId: number, criterionId: string, score: number | null) => {
    const aid = ownStudent(studentId)
    const r = getResult(studentId)
    const a = getAssignment(aid)
    const c = a.rubric.find((x) => x.id === criterionId)
    if (!c) throw new Error('Tiêu chí không tồn tại')
    const overrides = { ...r.overrides }
    if (score === null) delete overrides[criterionId]
    else {
      if (!Number.isFinite(score) || score < 0 || score > c.max) throw new Error(`Điểm phải trong khoảng 0..${c.max}`)
      overrides[criterionId] = round2(score)
    }
    const criteria = r.criteria.length
      ? r.criteria
      : a.rubric.map((x) => ({ id: x.id, name: x.name, max: x.max, source: x.source, score: null, reason: '', evidence: [] }))
    updateResult(studentId, {
      overrides,
      criteria,
      total: computeTotal(criteria, overrides, r.aiPenalty),
      status: r.status === 'pending' || r.status === 'failed' || r.status === 'cancelled' ? 'completed' : r.status
    })
    emit('students:changed', { assignmentId: aid })
    return getResult(studentId)
  })
  // Giáo viên áp / bỏ điểm trừ do dùng AI. applied = null → trả về quyết định theo chính sách.
  handle('result:aiPenalty', (studentId: number, applied: boolean | null) => {
    const aid = ownStudent(studentId)
    const r = getResult(studentId)
    const est = r.aiSignal?.estimate
    if (!est) throw new Error('Bài chưa có ước lượng % code AI — hãy chấm lại')
    const a = getAssignment(aid)
    if (a.aiPolicy.penaltyMode === 'off') throw new Error('Chính sách trừ điểm AI của assignment đang tắt')
    const base = evaluatePenalty(a.aiPolicy, est, null)!
    if (applied && base.deduct <= 0) throw new Error('% code AI chưa vượt bậc trừ điểm nào trong chính sách')
    const penalty = applied === null ? base : evaluatePenalty(a.aiPolicy, est, { ...base, applied, decidedBy: 'teacher' })
    updateResult(studentId, { ai_penalty: penalty, total: computeTotal(r.criteria, r.overrides, penalty) })
    emit('students:changed', { assignmentId: aid })
    return getResult(studentId)
  })
  // Câu hỏi vấn đáp cho bài nghi dùng AI: tạo / tạo lại theo yêu cầu giáo viên.
  const generatingQuestions = new Set<number>()
  handle('result:aiQuestions', async (studentId: number) => {
    const aid = ownStudent(studentId)
    if (!getSettings(null).aiQuestionsEnabled) throw new Error('Tính năng đề xuất câu hỏi vấn đáp đang tắt — bật trong Cài đặt → Chung')
    const q = getQueueState()
    if (q.running && !q.paused && getAssignment(q.assignmentId ?? aid).backend === 'local' && getAssignment(aid).backend === 'local') {
      throw new Error('Local AI đang chấm bài — hãy đợi hàng đợi chấm xong hoặc tạm dừng rồi thử lại')
    }
    if (generatingQuestions.has(studentId)) throw new Error('Đang tạo câu hỏi cho bài này')
    generatingQuestions.add(studentId)
    try {
      await regenerateQuestions(studentId)
    } finally {
      generatingQuestions.delete(studentId)
    }
    emit('students:changed', { assignmentId: aid })
    return getResult(studentId)
  })
  handle('result:note', (studentId: number, note: string) => {
    ownStudent(studentId)
    updateResult(studentId, { teacher_note: note.slice(0, 5000) })
  })
  handle('result:review', (studentId: number, reviewed: boolean) => {
    const aid = ownStudent(studentId)
    const r = getResult(studentId)
    if (reviewed && !['completed', 'reviewed'].includes(r.status)) throw new Error('Chỉ duyệt được bài đã chấm xong')
    updateResult(studentId, { reviewed, status: reviewed ? 'reviewed' : r.status === 'reviewed' ? 'completed' : r.status })
    emit('students:changed', { assignmentId: aid })
  })

  // ───── Code Review ─────
  handle('review:files', (studentId: number) => {
    ownStudent(studentId)
    return listFiles(studentId)
  })
  handle('review:read', (studentId: number, path: string) => {
    ownStudent(studentId)
    return readFile(studentId, path)
  })
  handle('review:office', (studentId: number, path: string) => {
    ownStudent(studentId)
    return readRawFile(studentId, path)
  })
  handle('review:search', (studentId: number, q: string) => {
    ownStudent(studentId)
    return searchProject(studentId, q)
  })

  // ───── Grading Queue ─────
  handle('queue:state', () => getQueueState())
  handle('queue:canStart', (aid: number) => {
    ownAssignment(aid)
    return canStart(aid)
  })
  handle('queue:start', (aid: number, ids: number[] = [], mode: 'remaining' | 'all' = 'remaining') => {
    ownAssignment(aid)
    return startQueue(aid, ids, mode)
  })
  handle('queue:reset', (aid: number) => {
    ownAssignment(aid)
    return resetAndRegrade(aid)
  })
  handle('queue:pause', () => pauseQueue())
  handle('queue:resume', () => resumeQueue())
  handle('queue:cancel', () => cancelQueue())

  // ───── Integrity & Dashboard ─────
  handle('integrity:overview', (aid: number) => {
    ownAssignment(aid)
    return getOverview(aid)
  })
  handle('integrity:run', (aid: number) => {
    ownAssignment(aid)
    if (!getSettings(null).similarityEnabled) throw new Error('So sánh trùng lặp đang tắt — bật trong Cài đặt → Chung')
    void runIntegrity(aid).then(() => emit('students:changed', { assignmentId: aid }))
  })
  handle('integrity:pair', (pairId: number) => {
    const p = getPair(pairId)
    ownStudent(p.aId)
    return p
  })
  handle('dashboard:get', (aid: number) => {
    ownAssignment(aid)
    return dashboardData(aid)
  })

  // ───── Tech Profiles & rubric mẫu ─────
  handle('profiles:list', () => listProfiles(requireUser().id))
  handle('profiles:save', (p: TechProfile) => saveProfile(requireUser().id, p))
  handle('profiles:delete', (id: string) => deleteProfile(requireUser().id, id))
  handle('rubric:templates', () => listRubricTemplates(requireUser().id))
  handle('rubric:saveTemplate', (name: string, profileId: string, rubric: Criterion[]) => saveRubricTemplate(requireUser().id, name, profileId, rubric))
  handle('rubric:deleteTemplate', (id: number) => deleteRubricTemplate(requireUser().id, id))
  handle('mingw:status', async () => ({ gcc: await findCompiler('c'), gpp: await findCompiler('cpp') }))
  handle('mingw:download', () => downloadMingw())
  handle('mingw:pick', async () => {
    const r = await dialog.showOpenDialog(win()!, { title: 'Chọn thư mục MinGW (chứa bin\\g++.exe)', properties: ['openDirectory'] })
    if (r.canceled || !r.filePaths[0]) return null
    updateSettings(null, { mingwPath: r.filePaths[0] })
    return r.filePaths[0]
  })
  handle('solidity:status', async () => ({ solc: await findSolc(), forge: await findForge() }))
  handle('solidity:pick', async (tool: 'solc' | 'forge') => {
    const r = await dialog.showOpenDialog(win()!, {
      title: tool === 'solc' ? 'Chọn file solc hoặc thư mục chứa solc' : 'Chọn file forge hoặc thư mục chứa forge',
      properties: ['openFile', 'openDirectory']
    })
    if (r.canceled || !r.filePaths[0]) return null
    updateSettings(null, tool === 'solc' ? { solcPath: r.filePaths[0] } : { forgePath: r.filePaths[0] })
    return r.filePaths[0]
  })
  handle('settings:pickDir', async (key: 'androidSdkPath' | 'jdkPath') => {
    requireUser()
    const r = await dialog.showOpenDialog(win()!, { properties: ['openDirectory'] })
    if (r.canceled || !r.filePaths[0]) return null
    updateSettings(null, { [key]: r.filePaths[0] })
    return r.filePaths[0]
  })

  // ───── Báo cáo ─────
  // Ngôn ngữ file xuất = ngôn ngữ giáo viên đang chọn trong Settings
  const reportLang = (): Lang => getSettings(requireUser().id).lang
  handle('reports:columns', (aid: number) => reportColumns(ownAssignment(aid), reportLang()))
  handle('reports:export', async (aid: number, kind: 'xlsx' | 'csv' | 'pdf' | 'pdf-separate', columns: string[]) => {
    const a = ownAssignment(aid)
    const lang = reportLang()
    if (kind === 'pdf-separate') {
      const r = await dialog.showOpenDialog(win()!, { title: translate(lang, 'Chọn thư mục lưu PDF từng sinh viên'), properties: ['openDirectory', 'createDirectory'] })
      if (r.canceled || !r.filePaths[0]) return null
      return { path: r.filePaths[0], ...(await exportPdf(aid, r.filePaths[0], true, lang)) }
    }
    const ext = kind === 'pdf' ? 'pdf' : kind
    const r = await dialog.showSaveDialog(win()!, {
      title: translate(lang, 'Xuất báo cáo'),
      defaultPath: defaultReportName(a, ext),
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
    })
    if (r.canceled || !r.filePath) return null
    const res =
      kind === 'xlsx'
        ? await exportExcel(aid, columns, r.filePath, lang)
        : kind === 'csv'
          ? await exportCsv(aid, columns, r.filePath, lang)
          : await exportPdf(aid, r.filePath, false, lang)
    return { path: r.filePath, ...res }
  })

  // ───── Hệ thống ─────
  handle('system:netlog', () => listNetLog())
  handle('system:clearNetlog', () => clearNetLog())
  handle('system:storage', () => storageUsage())
  handle('system:cleanWork', () => cleanWork())
  handle('system:backup', async () => {
    requireUser()
    const d = new Date()
    const r = await dialog.showSaveDialog(win()!, {
      title: 'Sao lưu dữ liệu',
      defaultPath: `MasterScoring_backup_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.msbak`,
      filters: [{ name: 'Master Scoring Backup', extensions: ['msbak'] }]
    })
    if (r.canceled || !r.filePath) return null
    await backupTo(r.filePath)
    return r.filePath
  })
  handle('system:restore', async () => {
    requireUser()
    const r = await dialog.showOpenDialog(win()!, {
      title: 'Khôi phục dữ liệu',
      filters: [{ name: 'Master Scoring Backup', extensions: ['msbak', 'db'] }],
      properties: ['openFile']
    })
    if (r.canceled || !r.filePaths[0]) return false
    await restoreFrom(r.filePaths[0])
    setCurrentUser(null)
    return true
  })
}
