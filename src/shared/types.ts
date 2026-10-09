// Kiểu dữ liệu dùng chung giữa main process và renderer.

export type Lang = 'vi' | 'en'

export interface User {
  id: number
  username: string
  displayName: string
  defaultPassword: boolean
}

export type CriterionSource = 'compile' | 'test' | 'static' | 'ai' | 'teacher'

export interface Criterion {
  id: string
  name: string
  max: number
  source: CriterionSource
  description: string
}

export interface TestCase {
  id: string
  name: string
  input: string
  expected: string
}

export type Backend = 'local' | 'cloud'
export type CloudProvider = 'gemini' | 'openai' | 'anthropic' | 'compatible'

// Chính sách ước lượng % code do AI viết và trừ điểm (theo từng assignment).
export type AiConfidence = 'low' | 'medium' | 'high'
export type AiPenaltyMode = 'off' | 'suggest' | 'auto'

export interface AiPenaltyTier {
  minPercent: number // % code AI (ước lượng) từ mức này trở lên
  deduct: number // số điểm trừ (thang 10)
}

export interface AiPolicy {
  penaltyMode: AiPenaltyMode
  tiers: AiPenaltyTier[]
  minConfidence: AiConfidence // chỉ trừ khi độ tin cậy ước lượng đạt mức này
}

// Loại bài: chấm code (Tech Profile, compile/test...) hoặc chấm báo cáo / bài viết Word / Excel / PowerPoint.
export type AssignmentKind = 'code' | 'report'

// Kiểm tra hình thức báo cáo (tiêu chí nguồn "static" của assignment loại report).
export interface ReportCheck {
  minWords: number // 0 = không kiểm tra
  maxWords: number // 0 = không giới hạn
  requiredSections: string[] // tên mục bắt buộc (khớp heading / dòng, không phân biệt hoa thường, dấu)
  requireReferences: boolean // bắt buộc có mục Tài liệu tham khảo
}

export interface Assignment {
  id: number
  name: string
  className: string
  kind: AssignmentKind
  reportCheck: ReportCheck
  profileId: string
  description: string
  passThreshold: number
  rubric: Criterion[]
  testCases: TestCase[]
  ignoreWhitespace: boolean
  timeLimitMs: number
  memoryLimitMb: number
  backend: Backend
  cloudProvider: CloudProvider
  cloudModel: string
  cloudConsent: boolean
  submissionsDir: string
  starterDir: string
  classList: ClassListEntry[]
  aiPolicy: AiPolicy
  createdAt: string
  updatedAt: string
}

export interface ClassListEntry {
  mssv: string
  name: string
}

export type ScanStatus = 'valid' | 'needs_assign' | 'duplicate_old' | 'broken' | 'unsupported' | 'missing'

export type GradeStatus =
  | 'pending'
  | 'extracting'
  | 'analyzing'
  | 'ai_grading'
  | 'completed'
  | 'reviewed'
  | 'failed'
  | 'cancelled'

export interface CriterionResult {
  id: string
  name: string
  max: number
  source: CriterionSource
  score: number | null
  reason: string
  evidence: { file: string; lineStart: number; lineEnd: number }[]
}

export type IssueSource = 'Compile' | 'Test' | 'Static' | 'AI'
export type Severity = 'error' | 'warning' | 'info'

export interface Issue {
  source: IssueSource
  severity: Severity
  file?: string
  line?: number
  message: string
  criterionId?: string
}

export type CodeOrigin = 'student' | 'ai' | 'starter'

// Một đoạn code (hàm / khối) và xác suất do AI viết.
export interface AiSegment {
  file: string
  lineStart: number
  lineEnd: number
  lines: number // số dòng code (bỏ dòng trống)
  aiProb: number // 0..1
  origin: CodeOrigin
  reasons: string[]
}

export interface AiEstimate {
  aiPercent: number // % code (không tính code khung) ước lượng do AI viết
  studentPercent: number // % code ước lượng do sinh viên tự viết = 100 - aiPercent
  starterPercent: number // % dòng trùng code khung / file sinh tự động (trên tổng số dòng)
  confidence: AiConfidence
  totalLines: number
  authoredLines: number
  heuristicPercent: number
  llmPercent: number | null
  files: { file: string; lines: number; starterLines: number; aiPercent: number }[]
  segments: AiSegment[]
}

export interface AiSignal {
  level: 'low' | 'medium' | 'high'
  signals: { file?: string; line?: number; description: string }[]
  estimate?: AiEstimate
}

export interface AiPenalty {
  aiPercent: number
  confidence: AiConfidence
  tierPercent: number | null // bậc đã áp (minPercent)
  deduct: number // số điểm trừ theo chính sách (0 nếu không vượt bậc nào)
  applied: boolean // đang trừ vào tổng điểm
  decidedBy: 'policy' | 'teacher'
  note: string
}

// Câu hỏi vấn đáp AI đề xuất cho bài có % code AI cao — giáo viên hỏi để kiểm tra SV có hiểu code đã nộp.
export interface AiQuestion {
  question: string
  file?: string
  lineStart?: number
  lineEnd?: number
  purpose: string // muốn kiểm tra điều gì
  expected: string // gợi ý câu trả lời đúng / dấu hiệu SV hiểu bài
}

export interface AiQuestions {
  generatedAt: string
  model: string
  aiPercent: number // % code AI tại thời điểm tạo
  items: AiQuestion[]
  error?: string // tạo thất bại (lỗi AI) — giáo viên có thể tạo lại
}

export interface TestRunResult {
  id: string
  name: string
  passed: boolean
  timeMs: number
  exitCode: number | null
  stdout: string
  stderr: string
  expected: string
  error?: string
}

// Thống kê 1 file báo cáo (Word / Excel / PowerPoint) đọc được. Excel: heading = sheet; PowerPoint: heading = slide, pages = số slide.
export interface DocStats {
  file: string
  words: number
  paragraphs: number
  headings: { level: number; text: string; line: number }[]
  tables: number
  images: number
  pages: number | null // số trang Word ghi trong docProps/app.xml (có thể không có)
}

export interface ReportStats {
  docs: DocStats[]
  words: number
  missingSections: string[]
  hasReferences: boolean
}

export interface AutoResult {
  compile?: { attempted: boolean; ok: boolean; output: string; command: string; skippedReason?: string }
  tests?: TestRunResult[]
  stats?: { files: number; lines: number; commentLines: number }
  report?: ReportStats
}

export interface StudentRow {
  id: number
  assignmentId: number
  mssv: string
  name: string
  zipPath: string
  zipMtime: number
  scanStatus: ScanStatus
  scanNote: string
  altFiles: string[]
  status: GradeStatus
  total: number | null
  backend: string
  model: string
  reviewed: boolean
  hasOverride: boolean
  aiLevel: AiSignal['level'] | null
  aiPercent: number | null
  aiConfidence: AiConfidence | null
  aiDeduct: number | null // điểm đang bị trừ do dùng AI
  maxSimilarity: number | null
  error: string
  durationMs: number | null
}

export interface StudentResult {
  studentId: number
  status: GradeStatus
  backend: string
  model: string
  total: number | null
  criteria: CriterionResult[]
  issues: Issue[]
  summary: string
  auto: AutoResult
  aiSignal: AiSignal | null
  aiPenalty: AiPenalty | null
  aiQuestions: AiQuestions | null
  overrides: Record<string, number>
  teacherNote: string
  reviewed: boolean
  error: string
  detectedProfile: string
  warnings: string[]
  startedAt: string | null
  finishedAt: string | null
}

export interface FileNode {
  path: string
  size: number
}

export interface ScanSummary {
  total: number
  valid: number
  needsAssign: number
  duplicates: number
  broken: number
  unsupported: number
  missing: number
}

export interface TechProfile {
  id: string
  name: string
  builtin: boolean
  detect: string[]
  ignore: string[]
  extensions: string[]
  checks: string
  buildEnabled: boolean
  buildNote: string
  rubric: Criterion[]
}

export type LocalState =
  | { kind: 'not_installed' }
  | { kind: 'downloading'; percent: number; speed: number; remainingSec: number; paused: boolean; modelId: string }
  | { kind: 'verifying'; modelId: string }
  | { kind: 'starting'; modelId: string }
  | { kind: 'ready'; modelId: string; variant: string; port: number }
  | { kind: 'stopped'; modelId: string }
  | { kind: 'error'; message: string; modelId?: string }

export interface ModelInfo {
  id: string
  name: string
  repo: string
  file: string
  sizeLabel: string
  approxBytes: number
  note: string
  installed: boolean
  path: string
}

export interface AiStatus {
  local: LocalState
  activeModelId: string
  cloudConfigured: CloudProvider[]
  runtimeAvailable: boolean
}

export interface HardwareInfo {
  ramGb: number
  freeRamGb: number
  cpuCores: number
  cpuModel: string
  gpu: string
  discreteGpu: boolean
  diskFreeGb: number | null
  modelsDir: string
  platform: string
}

export interface AppSettings {
  lang: Lang
  mssvPattern: string
  contextSize: number
  llamaVariant: 'auto' | 'cpu' | 'vulkan'
  gpuLayers: number
  threads: number
  modelsDir: string
  activeModelId: string
  preventSleep: boolean
  maxUnzipMb: number
  maxFiles: number
  similarityEnabled: boolean // so sánh trùng lặp giữa sinh viên (mặc định tắt)
  similarityThreshold: number
  aiQuestionsEnabled: boolean // AI đề xuất câu hỏi vấn đáp cho bài có % code AI cao (mặc định tắt)
  aiQuestionsMinPercent: number
  anonymizeCloud: boolean
  androidSdkPath: string
  jdkPath: string
  nodePath: string
  mingwPath: string
  solcPath: string
  forgePath: string
  sidebarCollapsed: boolean
}

export interface QueueState {
  assignmentId: number | null
  running: boolean
  paused: boolean
  currentStudentId: number | null
  currentStep: string
  done: number
  total: number
  etaSec: number | null
  avgSec: number | null
}

export interface IntegrityPair {
  id: number
  aId: number
  bId: number
  aName: string
  bName: string
  aMssv: string
  bMssv: string
  similarity: number
  matches: { fileA: string; lineA: number; fileB: string; lineB: number }[]
}

// Thống kê trùng lặp theo từng sinh viên (lấy cặp giống nhất của mỗi bài).
export interface SimilarityStudentStat {
  id: number
  name: string
  mssv: string
  maxSimilarity: number
  closest: { id: number; name: string; mssv: string; pairId: number } | null
  over: number // số bạn giống vượt ngưỡng
}

export interface SimilarityStats {
  compared: number // số bài có fingerprint đã đem so
  flagged: number // số SV có ít nhất 1 cặp vượt ngưỡng
  flaggedRate: number | null
  maxSimilarity: number | null
  avgMax: number | null // trung bình độ giống cao nhất mỗi bài (bài không có cặp ≥ 30% tính 0)
  buckets: { label: string; min: number; count: number }[]
  students: SimilarityStudentStat[]
}

export interface IntegrityOverview {
  similarityEnabled: boolean
  stats: SimilarityStats
  pairs: IntegrityPair[]
  clusters: { members: { id: number; name: string; mssv: string }[]; maxSimilarity: number }[]
  aiSignals: {
    id: number
    name: string
    mssv: string
    level: AiSignal['level']
    count: number
    aiPercent: number | null
    studentPercent: number | null
    confidence: AiConfidence | null
    deduct: number | null
    questions: number // số câu hỏi vấn đáp đã tạo
  }[]
  lastRun: string | null
  running: boolean
}

export interface DashboardData {
  students: number
  graded: number
  average: number | null
  median: number | null
  max: number | null
  min: number | null
  passRate: number | null
  pending: number
  histogram: number[]
  criteriaAvg: { id: string; name: string; avg: number; max: number }[]
  aiReview: number
  aiMediumHighRate: number | null
  aiAvgPercent: number | null
  aiPenalized: number
  similarityEnabled: boolean
  similarPairs: number
  similarStudents: number
  clusters: number
  alerts: { kind: string; count: number; label: string }[]
  recent: { id: number; name: string; mssv: string; total: number | null; status: GradeStatus; finishedAt: string }[]
}

export interface NetLogEntry {
  id: number
  ts: string
  url: string
  purpose: string
  status: string
}

export interface StorageUsage {
  data: number
  models: number
  runtime: number
  work: number
  logs: number
  root: string
}

export interface ReportColumn {
  key: string
  label: string
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string }
