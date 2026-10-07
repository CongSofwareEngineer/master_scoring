// Pipeline chấm 1 sinh viên:
// 1. Giải nén (lọc theo profile)  2. Nhận diện công nghệ (profile "Tự động nhận diện")  3. Compile / test / phân tích tĩnh
// 4. Chuẩn bị ngữ cảnh AI (project lớn → tóm tắt từng file)  5. AI chấm → JSON
// 6. Ước lượng % code AI + điểm trừ theo chính sách (+ câu hỏi vấn đáp nếu bật)  7. Ghép điểm  8. Fingerprint cho Integrity  9. Lưu kết quả
// Assignment báo cáo (Word / Excel / PowerPoint): bước 1 đọc file Office thành văn bản, bước 3 là kiểm tra hình thức, bước 5 dùng prompt chấm
// báo cáo (báo cáo dài → tóm tắt từng đoạn), bước 6 chỉ lấy nhận định của AI (không heuristic code, không câu hỏi vấn đáp).
import { createHash } from 'crypto'
import { evaluatePenalty } from '@shared/aiPolicy'
import { rm } from 'fs/promises'
import { join } from 'path'
import { AUTO_PROFILE_ID, effectiveContext, SOURCE_LABEL } from '@shared/constants'
import type { AiEstimate, AiQuestions, AiSignal, Assignment, AutoResult, Criterion, CriterionResult, Issue, StudentRow } from '@shared/types'
import { chat, cloudBackend, localBackend, type BackendConfig } from '../ai/client'
import { compileAndTest } from '../analysis/cpp'
import { gradingProfileId, loadForGrading } from '../analysis/detect'
import { checkReport, reportFormatScore } from '../analysis/report'
import { runProcess } from '../analysis/runner'
import { runStatic, staticScore } from '../analysis/static'
import { nowIso } from '../db'
import { decodeText, writeFilesTo, SubmissionError } from '../importer/extract'
import { estimateAiCode, estimateAiText, levelFromEstimate, type LlmAiHint } from '../integrity/aiEstimate'
import { fingerprintFiles } from '../integrity/fingerprint'
import { generateQuestions } from '../integrity/questions'
import { starterKgrams } from '../integrity/starter'
import { paths } from '../paths'
import { assignmentOwner, computeTotal, getAssignment, getResult, getStudent, listProfiles, setStatus, updateResult } from '../repo'
import { getSettings } from '../settings'
import { buildGradingMessages, estimateTokens, extractJson, fileBlock, gradingSchema, summarizeMessages, summarizeReportMessages, validateAi } from './prompt'

export type StepCallback = (step: string) => void

export function backendFor(a: Assignment): BackendConfig {
  if (a.backend === 'cloud') {
    if (!a.cloudConsent) throw new Error('Assignment dùng Cloud AI nhưng chưa xác nhận đồng ý gửi code ra ngoài')
    const owner = assignmentOwner(a.id)
    if (!owner) throw new Error('Không xác định được chủ assignment')
    return cloudBackend(owner, a.cloudProvider, a.cloudModel)
  }
  return localBackend()
}

// Thứ tự ưu tiên file khi đưa vào AI (file quan trọng trước).
function importance(path: string, profileId: string): number {
  const p = path.toLowerCase()
  const base = p.split('/').pop()!
  if (/(^|\/)(readme)(\.|$)/.test(p)) return 60
  if (/\.(json|lock|properties|pro|gradle|kts|example)$/.test(base) && base !== 'package.json') return 90
  if (base.startsWith('.env')) return 95
  if (profileId === 'android') {
    if (base === 'androidmanifest.xml') return 5
    if (/activity\.(java|kt)$/.test(base)) return 10
    if (/(fragment|adapter|viewmodel)\.(java|kt)$/.test(base)) return 20
    if (/\.(java|kt)$/.test(base)) return 25
    if (/\/res\/layout/.test(p)) return 30
    if (/\/res\/values/.test(p)) return 85
    return 70
  }
  if (profileId === 'nextjs') {
    if (/(^|\/)app\/(.*\/)?(page|layout)\.(t|j)sx?$/.test(p) || /(^|\/)pages\//.test(p)) return 10
    if (/(^|\/)(app\/api|pages\/api)\//.test(p)) return 15
    if (/components?\//.test(p)) return 20
    if (/\.(t|j)sx?$/.test(base)) return 30
    if (base === 'package.json') return 50
    if (/\.(css|scss)$/.test(base)) return 80
    return 70
  }
  if (/^main\.(c|cpp|cc|cxx)$/.test(base)) return 5
  if (/\.(c|cpp|cc|cxx)$/.test(base)) return 10
  if (/\.(h|hpp|hh)$/.test(base)) return 20
  if (/\.(in|out|txt)$/.test(base)) return 90
  return 50
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Ẩn họ tên + MSSV khi gửi Cloud
function makeAnonymizer(s: StudentRow): (text: string) => string {
  const alias = 'SV-' + createHash('sha1').update(s.mssv + s.name).digest('hex').slice(0, 6).toUpperCase()
  const noDia = (x: string): string => x.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
  const terms = new Set<string>()
  if (s.mssv) {
    terms.add(s.mssv)
    terms.add(s.mssv.replace(/\./g, ''))
  }
  if (s.name && s.name.length > 2) {
    for (const n of [s.name, noDia(s.name)]) {
      terms.add(n)
      terms.add(n.replace(/\s+/g, ''))
      terms.add(n.replace(/\s+/g, '_'))
    }
  }
  const list = [...terms].filter((t) => t.length >= 3).sort((a, b) => b.length - a.length)
  if (!list.length) return (t) => t
  const re = new RegExp(list.map(escapeRe).join('|'), 'gi')
  return (text) => text.replace(re, alias)
}

async function buildQuestions(
  student: StudentRow,
  a: Assignment,
  files: Map<string, Buffer>,
  estimate: AiEstimate,
  backend: BackendConfig,
  signal?: AbortSignal
): Promise<AiQuestions> {
  const anon = backend.kind === 'cloud' && getSettings(null).anonymizeCloud ? makeAnonymizer(student) : undefined
  const text = new Map<string, string>()
  for (const [p, b] of files) text.set(p, decodeText(b))
  return generateQuestions({ a, files: text, estimate, backend, signal, anon })
}

// Giáo viên bấm "Tạo câu hỏi" / "Tạo lại" trong Code Review.
export async function regenerateQuestions(studentId: number): Promise<AiQuestions> {
  const student = getStudent(studentId)
  const a = getAssignment(student.assignmentId)
  if (a.kind === 'report') throw new Error('Câu hỏi vấn đáp chỉ áp dụng cho assignment chấm code')
  const est = getResult(studentId).aiSignal?.estimate
  if (!est) throw new Error('Bài chưa có ước lượng % code AI — hãy chấm lại')
  const owner = assignmentOwner(a.id) ?? 0
  const settings = getSettings(null)
  const { sub } = await loadForGrading(student.zipPath, listProfiles(owner), gradingProfileId(a), { maxBytes: settings.maxUnzipMb * 1048576, maxFiles: settings.maxFiles })
  const q = await buildQuestions(student, a, sub.files, est, backendFor(a))
  updateResult(studentId, { ai_questions: q })
  return q
}

async function prepareContext(
  files: Map<string, string>,
  profileId: string,
  backend: BackendConfig,
  budgetTokens: number,
  signal: AbortSignal,
  onStep: StepCallback
): Promise<{ block: string; summarized: boolean }> {
  const ordered = [...files.keys()].sort((a, b) => importance(a, profileId) - importance(b, profileId) || a.localeCompare(b))
  const blocks = ordered.map((p) => ({ path: p, text: fileBlock(p, files.get(p)!) }))
  const total = blocks.reduce((s, b) => s + estimateTokens(b.text), 0)
  if (total <= budgetTokens) return { block: blocks.map((b) => b.text).join('\n'), summarized: false }

  // Project lớn: tóm tắt từng file (tuần tự), rồi chấm trên bản tóm tắt + các file quan trọng.
  const perFileLimit = Math.max(1500, Math.floor(budgetTokens * 0.9))
  const summaries: string[] = []
  const candidates = blocks.filter((b) => importance(b.path, profileId) < 85)
  let i = 0
  for (const b of candidates) {
    i++
    if (signal.aborted) throw new Error('Đã huỷ')
    onStep(`Tóm tắt file ${i}/${candidates.length}: ${b.path}`)
    let text = files.get(b.path)!
    if (estimateTokens(fileBlock(b.path, text)) > perFileLimit) {
      text = text.slice(0, Math.floor(perFileLimit * 3.2 * 0.9)) + '\n/* ... (đã cắt bớt phần cuối) ... */'
    }
    try {
      const sum = await chat(backend, summarizeMessages(b.path, text), { maxTokens: 300, signal })
      summaries.push(`--- TÓM TẮT: ${b.path} (${files.get(b.path)!.split('\n').length} dòng) ---\n${sum.trim()}`)
    } catch (e: any) {
      if (signal.aborted) throw e
      summaries.push(`--- TÓM TẮT: ${b.path} --- (không tóm tắt được: ${e.message})`)
    }
  }
  let block = summaries.join('\n\n') + '\n\n'
  let used = estimateTokens(block)
  // Thêm toàn văn file quan trọng còn vừa ngân sách
  for (const b of blocks) {
    const t = estimateTokens(b.text)
    if (used + t > budgetTokens) continue
    block += b.text + '\n'
    used += t
  }
  return { block, summarized: true }
}

// Báo cáo dài vượt ngân sách: chia mỗi file thành các đoạn liền nhau theo dòng, tóm tắt từng đoạn (giữ số dòng gốc),
// rồi thêm toàn văn các đoạn đầu còn vừa ngân sách.
async function prepareReportContext(
  files: Map<string, string>,
  backend: BackendConfig,
  budgetTokens: number,
  signal: AbortSignal,
  onStep: StepCallback
): Promise<{ block: string; summarized: boolean }> {
  const full = [...files].map(([p, t]) => fileBlock(p, t)).join('\n')
  if (estimateTokens(full) <= budgetTokens) return { block: full, summarized: false }

  const chunkTokens = Math.max(1500, Math.floor(budgetTokens * 0.5))
  const chunks: { path: string; start: number; text: string }[] = []
  for (const [path, text] of files) {
    const lines = text.split('\n')
    let start = 0
    while (start < lines.length) {
      let end = start
      let used = 0
      while (end < lines.length) {
        const t = estimateTokens(lines[end]) + 2
        if (used + t > chunkTokens && end > start) break
        used += t
        end++
      }
      chunks.push({ path, start: start + 1, text: lines.slice(start, end).join('\n') })
      start = end
    }
  }
  const summaries: string[] = []
  let i = 0
  for (const c of chunks) {
    i++
    if (signal.aborted) throw new Error('Đã huỷ')
    const n = c.text.split('\n').length
    onStep(`Tóm tắt đoạn ${i}/${chunks.length}: ${c.path} (dòng ${c.start}–${c.start + n - 1})`)
    let text = c.text
    if (estimateTokens(text) > chunkTokens * 1.2) text = text.slice(0, Math.floor(chunkTokens * 3.2))
    try {
      const sum = await chat(backend, summarizeReportMessages(c.path, text, c.start), { maxTokens: 400, signal })
      summaries.push(`--- TÓM TẮT: ${c.path} (dòng ${c.start}–${c.start + n - 1}) ---\n${sum.trim()}`)
    } catch (e: any) {
      if (signal.aborted) throw e
      summaries.push(`--- TÓM TẮT: ${c.path} (dòng ${c.start}–${c.start + n - 1}) --- (không tóm tắt được: ${e.message})`)
    }
  }
  let block = summaries.join('\n\n') + '\n\n'
  let used = estimateTokens(block)
  for (const c of chunks) {
    const b = fileBlock(c.path, c.text, c.start)
    const t = estimateTokens(b)
    if (used + t > budgetTokens) break
    block += b + '\n'
    used += t
  }
  return { block, summarized: true }
}

async function aiGrade(
  a: Assignment,
  aiCriteria: Criterion[],
  auto: AutoResult,
  issues: Issue[],
  files: Map<string, string>,
  profileId: string,
  backend: BackendConfig,
  signal: AbortSignal,
  onStep: StepCallback
): Promise<ReturnType<typeof validateAi> & { ok: true }> {
  const s = getSettings(null)
  // Ngôn ngữ là cài đặt riêng từng giáo viên → lấy của chủ assignment, không phải cài đặt chung của máy
  const lang = getSettings(assignmentOwner(a.id) ?? null).lang
  const ctx = effectiveContext(backend.kind, s.contextSize)
  const outputReserve = 1800
  const base = estimateTokens(buildGradingMessages(a, aiCriteria, auto, issues, '', false, lang).map((m) => m.content).join('\n'))
  const budget = Math.max(800, ctx - outputReserve - base - 200)
  const { block, summarized } =
    a.kind === 'report' ? await prepareReportContext(files, backend, budget, signal, onStep) : await prepareContext(files, profileId, backend, budget, signal, onStep)
  const fileLines = new Map<string, number>()
  for (const [p, t] of files) fileLines.set(p, t.split('\n').length)
  const messages = buildGradingMessages(a, aiCriteria, auto, issues, block, summarized, lang)
  const schema = gradingSchema(aiCriteria)
  let lastErrors: string[] = []
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal.aborted) throw new Error('Đã huỷ')
    onStep(attempt === 0 ? 'AI đang chấm theo rubric' : `AI chấm lại (lần ${attempt + 1}) do JSON chưa hợp lệ`)
    const content = await chat(backend, messages, { maxTokens: outputReserve, jsonSchema: schema, signal })
    let parsed: any
    try {
      parsed = extractJson(content)
    } catch (e: any) {
      lastErrors = [e.message]
      // Không gửi lại toàn bộ phản hồi hỏng (thường là đoạn lặp dài) — dễ khiến model lặp tiếp
      messages.push(
        { role: 'assistant', content: content.slice(0, 600) },
        { role: 'user', content: 'Phản hồi không phải JSON hợp lệ (có thể quá dài). Chỉ trả về MỘT đối tượng JSON đúng schema, mỗi "reason" tối đa 2-3 câu, không lặp lại. ' + (lang === 'en' ? 'Write in English.' : 'Viết bằng tiếng Việt.') }
      )
      continue
    }
    const v = validateAi(parsed, aiCriteria, fileLines, attempt < 2)
    if (v.ok) return v
    lastErrors = v.errors
    messages.push(
      { role: 'assistant', content: content.slice(0, 4000) },
      { role: 'user', content: `JSON chưa hợp lệ:\n- ${v.errors.slice(0, 8).join('\n- ')}\nHãy sửa và trả lại toàn bộ JSON đúng schema.` }
    )
  }
  throw new Error('AI trả về JSON không hợp lệ sau 3 lần thử: ' + lastErrors.slice(0, 3).join('; ') + '. Hãy chấm tay.')
}

async function androidBuild(files: Map<string, Buffer>, workDir: string, signal: AbortSignal): Promise<AutoResult['compile']> {
  const s = getSettings(null)
  if (!s.androidSdkPath || !s.jdkPath) {
    return { attempted: false, ok: false, output: '', command: '', skippedReason: 'Chưa cấu hình đường dẫn Android SDK / JDK trong Settings' }
  }
  writeFilesTo(workDir, files)
  const env = { ...process.env, JAVA_HOME: s.jdkPath, ANDROID_HOME: s.androidSdkPath, ANDROID_SDK_ROOT: s.androidSdkPath }
  // Dùng Gradle cài trên máy giáo viên (không chạy gradlew.bat của sinh viên)
  const r = await runProcess(process.platform === 'win32' ? 'gradle.bat' : 'gradle', ['assembleDebug', '--no-daemon', '-q'], {
    cwd: workDir,
    timeoutMs: 15 * 60_000,
    env,
    maxOutputBytes: 512 * 1024
  })
  if (signal.aborted) throw new Error('Đã huỷ')
  return {
    attempted: true,
    ok: r.exitCode === 0,
    output: (r.stdout + r.stderr).slice(-20000) || (r.spawnError ?? ''),
    command: 'gradle assembleDebug'
  }
}

export async function gradeStudent(
  student: StudentRow,
  a: Assignment,
  signal: AbortSignal,
  onStep: StepCallback,
  onStatus: (status: 'extracting' | 'analyzing' | 'ai_grading') => void
): Promise<void> {
  const started = Date.now()
  const owner = assignmentOwner(a.id) ?? 0
  const profiles = listProfiles(owner)
  const settings = getSettings(null)
  const prev = getResult(student.id)
  const overrides = prev.overrides ?? {}
  const workDir = join(paths.work, String(student.id))
  const warnings: string[] = []
  updateResult(student.id, { started_at: nowIso(), error: '' })

  try {
    // 1. Giải nén
    onStatus('extracting')
    setStatus(student.id, 'extracting')
    onStep('Giải nén & lọc file')
    // + 2. Nhận diện công nghệ (chỉ khi assignment chọn "Tự động nhận diện")
    const report = a.kind === 'report'
    const { sub, profile, detected } = await loadForGrading(student.zipPath, profiles, gradingProfileId(a), {
      maxBytes: settings.maxUnzipMb * 1048576,
      maxFiles: settings.maxFiles
    })
    warnings.push(...sub.warnings.slice(0, 30))
    if (!sub.files.size) throw new SubmissionError(report ? 'Không tìm thấy file báo cáo Word / Excel / PowerPoint đọc được' : 'Không tìm thấy mã nguồn')
    if (profile.id === AUTO_PROFILE_ID) warnings.unshift('Không nhận diện được công nghệ của bài nộp — chấm theo tiêu chí chung')

    // 3. Kiểm tra tự động
    if (signal.aborted) throw new Error('Đã huỷ')
    onStatus('analyzing')
    setStatus(student.id, 'analyzing')
    const issues: Issue[] = []
    const auto: AutoResult = {}
    const needsCompile = !report && a.rubric.some((c) => c.source === 'compile' || c.source === 'test')
    if (report) {
      onStep('Kiểm tra hình thức báo cáo')
      const rc = checkReport(sub.files, sub.docs, a.reportCheck)
      issues.push(...rc.issues)
      auto.report = rc.report
    } else {
      onStep('Phân tích tĩnh')
      const st = runStatic(profile.id, sub.files)
      issues.push(...st.issues)
      auto.stats = st.stats
    }
    if ((profile.id === 'c' || profile.id === 'cpp') && needsCompile && profile.buildEnabled) {
      onStep('Biên dịch & chạy test case')
      const r = await compileAndTest(profile.id === 'c' ? 'c' : 'cpp', sub.files, a, workDir, signal)
      Object.assign(auto, r.auto)
      issues.push(...r.issues)
    } else if (profile.id === 'android' && needsCompile) {
      if (profile.buildEnabled) {
        onStep('Build Android (Gradle)')
        auto.compile = await androidBuild(sub.files, workDir, signal)
        if (auto.compile && auto.compile.attempted && !auto.compile.ok) issues.push({ source: 'Compile', severity: 'error', message: 'Build Gradle thất bại' })
      } else {
        auto.compile = { attempted: false, ok: false, output: '', command: '', skippedReason: profile.buildNote }
      }
    } else if (needsCompile) {
      auto.compile = {
        attempted: false,
        ok: false,
        output: '',
        command: '',
        skippedReason: profile.id === 'nextjs' ? 'Build Next.js cần node_modules; app không bao giờ tự chạy "npm install".' : profile.buildNote || 'Profile không hỗ trợ build'
      }
    }

    // Điểm các tiêu chí tự động
    const criteria: CriterionResult[] = a.rubric.map((c) => {
      const base: CriterionResult = { id: c.id, name: c.name, max: c.max, source: c.source, score: null, reason: '', evidence: [] }
      if (c.source === 'compile') {
        if (auto.compile?.attempted) {
          base.score = auto.compile.ok ? c.max : 0
          base.reason = auto.compile.ok ? 'Biên dịch thành công.' : 'Biên dịch thất bại.'
        } else base.reason = `Chưa chấm tự động: ${auto.compile?.skippedReason ?? 'không có bước biên dịch'} — giáo viên chấm tay.`
      } else if (c.source === 'test') {
        if (auto.compile?.attempted && !auto.compile.ok) {
          base.score = 0
          base.reason = 'Không biên dịch được nên không chạy được test case.'
        } else if (auto.tests?.length) {
          const passed = auto.tests.filter((t) => t.passed).length
          base.score = Math.round(((c.max * passed) / auto.tests.length) * 100) / 100
          base.reason = `Đạt ${passed}/${auto.tests.length} test case.`
        } else base.reason = a.testCases.length ? 'Không chạy được test case — giáo viên chấm tay.' : 'Assignment chưa có test case — giáo viên chấm tay.'
      } else if (c.source === 'static') {
        const r = report ? reportFormatScore(c.max, issues) : staticScore(c.max, issues)
        base.score = r.score
        base.reason = r.reason
      } else if (c.source === 'teacher') {
        base.reason = 'Tiêu chí do giáo viên chấm.'
      }
      return base
    })

    // 4–5. AI chấm
    const aiCriteria = a.rubric.filter((c) => c.source === 'ai')
    let summary = ''
    let aiSignal: AiSignal | null = null
    let aiHint: LlmAiHint | null = null
    let backendLabel = ''
    let modelName = ''
    let backend: BackendConfig | null = null
    if (aiCriteria.length) {
      if (signal.aborted) throw new Error('Đã huỷ')
      onStatus('ai_grading')
      setStatus(student.id, 'ai_grading')
      backend = backendFor(a)
      backendLabel = backend.kind === 'cloud' ? 'Cloud' : 'Local'
      modelName = backend.model
      const anon = backend.kind === 'cloud' && settings.anonymizeCloud ? makeAnonymizer(student) : (t: string): string => t
      const textFiles = new Map<string, string>()
      for (const [p, b] of sub.files) textFiles.set(anon(p), anon(decodeText(b)))
      const aDesc = { ...a, description: anon(a.description) }
      const res = await aiGrade(aDesc, aiCriteria, auto, issues, textFiles, profile.id, backend, signal, onStep)
      // Khôi phục đường dẫn gốc (nếu đã ẩn danh)
      const back = new Map<string, string>()
      for (const p of sub.files.keys()) back.set(anon(p), p)
      const orig = (f: string): string => back.get(f) ?? f
      for (const r of res.value.criteria) {
        const cr = criteria.find((c) => c.id === r.id)!
        cr.score = r.score
        cr.reason = r.reason
        cr.evidence = r.evidence.map((e) => ({ ...e, file: orig(e.file) }))
      }
      issues.push(...res.value.issues.map((i) => ({ ...i, file: i.file ? orig(i.file) : undefined })))
      summary = res.value.summary
      aiSignal = { ...res.value.aiSignal, signals: res.value.aiSignal.signals.map((x) => ({ ...x, file: x.file ? orig(x.file) : undefined })) }
      aiHint = { percent: res.value.aiHint.percent, segments: res.value.aiHint.segments.map((g) => ({ ...g, file: orig(g.file) })) }
    } else {
      backendLabel = 'Tự động'
    }

    // Gắn tiêu chí cho issue tự động
    for (const i of issues) {
      if (i.criterionId) continue
      const match = a.rubric.find(
        (c) => (i.source === 'Compile' && c.source === 'compile') || (i.source === 'Test' && c.source === 'test') || (i.source === 'Static' && c.source === 'static')
      )
      if (match) i.criterionId = match.id
    }

    // 6. Ước lượng % code do AI viết (phong cách từng đoạn + nhận định LLM, bỏ code khung) và điểm trừ
    onStep(report ? 'Ước lượng % văn bản do AI viết' : 'Ước lượng % code do AI viết')
    const estimate = report
      ? estimateAiText(sub.files, aiHint)
      : estimateAiCode(sub.files, profile.id, { starter: await starterKgrams(a.id).catch(() => new Set<number>()), llm: aiHint })
    aiSignal = { level: levelFromEstimate(estimate), signals: aiSignal?.signals ?? [], estimate }
    const penalty = evaluatePenalty(a.aiPolicy, estimate, prev.aiPenalty)

    // 6b. Bài % code AI cao → AI đề xuất câu hỏi vấn đáp (tuỳ chọn, mặc định tắt). Lỗi ở bước này không làm hỏng kết quả chấm.
    let aiQuestions: AiQuestions | null = prev.aiQuestions
    if (!report && settings.aiQuestionsEnabled && estimate.aiPercent >= settings.aiQuestionsMinPercent) {
      if (signal.aborted) throw new Error('Đã huỷ')
      onStep('AI đề xuất câu hỏi vấn đáp')
      try {
        aiQuestions = await buildQuestions(student, a, sub.files, estimate, backend ?? backendFor(a), signal)
      } catch (e: any) {
        if (signal.aborted) throw e
        aiQuestions = { generatedAt: nowIso(), model: backend?.model ?? '', aiPercent: estimate.aiPercent, items: [], error: e?.message ?? String(e) }
      }
    }

    // 7. Tổng điểm (giữ điểm giáo viên đã sửa, trừ điểm dùng AI nếu áp)
    const validOverrides: Record<string, number> = {}
    for (const [k, v] of Object.entries(overrides)) if (criteria.some((c) => c.id === k)) validOverrides[k] = v
    const total = computeTotal(criteria, validOverrides, penalty)

    // 8. Fingerprint
    onStep('Tính fingerprint cho Integrity')
    const fp = fingerprintFiles(sub.files)

    // 9. Lưu
    updateResult(student.id, {
      status: prev.reviewed ? 'reviewed' : 'completed',
      backend: backendLabel,
      model: modelName,
      total,
      criteria,
      issues,
      summary,
      auto,
      ai_signal: aiSignal,
      ai_penalty: penalty,
      ai_questions: aiQuestions,
      overrides: validOverrides,
      detected_profile: detected ?? '',
      warnings,
      fingerprint: fp,
      error: '',
      finished_at: nowIso(),
      duration_ms: Date.now() - started
    })
  } catch (e: any) {
    const cancelled = signal.aborted
    updateResult(student.id, {
      status: cancelled ? 'pending' : 'failed',
      error: cancelled ? '' : e?.message ?? String(e),
      warnings,
      finished_at: nowIso(),
      duration_ms: Date.now() - started
    })
    if (cancelled) throw e
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

export function criterionSourceLabel(c: Criterion): string {
  return SOURCE_LABEL[c.source]
}
