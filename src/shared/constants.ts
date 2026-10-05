import type { AiConfidence, AiPolicy, AppSettings, CloudProvider, Criterion, GradeStatus, TechProfile } from './types'

export const APP_NAME = 'Master Scoring'

export const MODELS = [
  {
    id: 'qwen2.5-coder-1.5b',
    name: 'Qwen2.5-Coder-1.5B-Instruct',
    repo: 'bartowski/Qwen2.5-Coder-1.5B-Instruct-GGUF',
    file: 'Qwen2.5-Coder-1.5B-Instruct-Q4_K_M.gguf',
    quant: 'Q4_K_M',
    sizeLabel: '~1 GB',
    approxBytes: 986_048_800,
    layers: 28,
    note: 'Mặc định, chạy tốt trên đa số máy'
  },
  {
    id: 'qwen2.5-coder-7b',
    name: 'Qwen2.5-Coder-7B-Instruct',
    repo: 'bartowski/Qwen2.5-Coder-7B-Instruct-GGUF',
    file: 'Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf',
    quant: 'Q4_K_M',
    sizeLabel: '~4.7 GB',
    approxBytes: 4_683_073_184,
    layers: 28,
    note: 'Chấm ổn định và chính xác hơn, khuyến nghị cho máy từ 16 GB RAM'
  }
] as const

export const DEFAULT_MODEL_ID = 'qwen2.5-coder-1.5b'

export const CLOUD_PROVIDERS: Record<CloudProvider, { name: string; baseUrl: string; defaultModel: string; models: string[] }> = {
  gemini: {
    name: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite']
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1-mini',
    models: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini']
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-5-5',
    models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-4-5-20251001']
  },
  compatible: {
    name: 'OpenAI-compatible (URL)',
    baseUrl: '',
    defaultModel: '',
    models: []
  }
}

export const DEFAULT_SETTINGS: AppSettings = {
  lang: 'vi',
  mssvPattern: '^\\d{4,20}$',
  contextSize: 8192,
  llamaVariant: 'auto',
  gpuLayers: -1,
  threads: 0,
  modelsDir: '',
  activeModelId: DEFAULT_MODEL_ID,
  preventSleep: true,
  maxUnzipMb: 500,
  maxFiles: 20000,
  similarityEnabled: false,
  similarityThreshold: 70,
  aiQuestionsEnabled: false,
  aiQuestionsMinPercent: 60,
  anonymizeCloud: true,
  androidSdkPath: '',
  jdkPath: '',
  nodePath: '',
  mingwPath: '',
  sidebarCollapsed: false
}

// Mặc định: dưới 40% code AI không trừ; từ 40% / 60% / 80% trừ 1 / 2 / 4 điểm.
// Chỉ tự trừ khi độ tin cậy ước lượng từ "Trung bình" trở lên; giáo viên luôn bỏ trừ được.
export const DEFAULT_AI_POLICY: AiPolicy = {
  penaltyMode: 'auto',
  tiers: [
    { minPercent: 40, deduct: 1 },
    { minPercent: 60, deduct: 2 },
    { minPercent: 80, deduct: 4 }
  ],
  minConfidence: 'medium'
}

export const CONFIDENCE_LABEL: Record<AiConfidence, string> = { low: 'Thấp', medium: 'Trung bình', high: 'Cao' }
export const CONFIDENCE_RANK: Record<AiConfidence, number> = { low: 0, medium: 1, high: 2 }

export const STATUS_META: Record<GradeStatus, { label: string; color: string }> = {
  pending: { label: 'Chờ chấm', color: 'var(--pending)' },
  extracting: { label: 'Đang giải nén', color: 'var(--info)' },
  analyzing: { label: 'Đang phân tích', color: 'var(--info)' },
  ai_grading: { label: 'AI đang chấm', color: 'var(--ai)' },
  completed: { label: 'Xong', color: 'var(--success)' },
  reviewed: { label: 'Đã duyệt', color: 'var(--primary)' },
  failed: { label: 'Lỗi', color: 'var(--error)' },
  cancelled: { label: 'Đã huỷ', color: 'var(--pending)' }
}

export const ACTIVE_STATUSES: GradeStatus[] = ['extracting', 'analyzing', 'ai_grading']

// File thực thi trong bài nộp: không giải nén, không chạy.
export const BLOCKED_EXT = ['.exe', '.bat', '.cmd', '.ps1', '.dll', '.msi', '.com', '.scr', '.vbs']

const r = (id: string, name: string, max: number, source: Criterion['source'], description: string): Criterion => ({
  id,
  name,
  max,
  source,
  description
})

export const BUILTIN_PROFILES: TechProfile[] = [
  {
    id: 'android',
    name: 'Java Android',
    builtin: true,
    detect: ['settings.gradle', 'settings.gradle.kts', 'build.gradle', 'build.gradle.kts', 'AndroidManifest.xml'],
    ignore: ['build/', '.gradle/', '.idea/', 'app/build/', '*.apk', '*.aab', 'local.properties', '*.jar', '*.keystore', '*.jks'],
    extensions: ['.java', '.kt', '.kts', '.xml', '.gradle', '.properties', '.md', '.txt', '.json', '.pro'],
    checks: 'Cấu trúc project, Activity/Fragment khai báo trong Manifest, layout XML, số dòng, phân tích tĩnh cơ bản',
    buildEnabled: false,
    buildNote: 'Build TẮT mặc định (cần Android SDK + JDK). Bật được nếu đã cài và trỏ đường dẫn trong Settings.',
    rubric: [
      r('structure_project', 'Cấu trúc project Android', 1.5, 'static', 'Có Manifest, Activity được khai báo, layout XML tách riêng.'),
      r('requirements', 'Đúng yêu cầu đề', 4, 'ai', 'Các màn hình/chức năng đề yêu cầu đã được cài đặt đúng.'),
      r('ui', 'Giao diện (layout XML)', 1.5, 'ai', 'Layout hợp lý, dùng đúng view, có id rõ ràng.'),
      r('code_structure', 'Cấu trúc & tách lớp', 1.5, 'ai', 'Tách Activity/Fragment/Model/Adapter hợp lý, không dồn mọi thứ vào một file.'),
      r('clean_code', 'Đặt tên & clean code', 1, 'ai', 'Tên biến/hàm có nghĩa, không lặp code, xử lý lỗi cơ bản.'),
      r('docs', 'Comment / README', 0.5, 'ai', 'Có comment ở phần quan trọng hoặc README mô tả.')
    ]
  },
  {
    id: 'nextjs',
    name: 'Web Next.js',
    builtin: true,
    detect: ['package.json:next'],
    ignore: ['node_modules/', '.next/', 'out/', 'dist/', '.vercel/', '.turbo/', 'coverage/', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', '*.map'],
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.css', '.scss', '.json', '.md', '.html', '.env', '.local', '.example', '.txt', '.mdx'],
    checks: 'app/ hoặc pages/, route, component, file .env bị lộ key (cảnh báo)',
    buildEnabled: false,
    buildNote: 'Build/Lint TẮT mặc định. KHÔNG BAO GIỜ tự chạy "npm install".',
    rubric: [
      r('structure_project', 'Cấu trúc project Next.js', 1, 'static', 'Có app/ hoặc pages/, tách component, không lộ key trong .env.'),
      r('requirements', 'Đúng yêu cầu đề', 4, 'ai', 'Các trang/route/chức năng đề yêu cầu đã được cài đặt đúng.'),
      r('components', 'Component & tái sử dụng', 1.5, 'ai', 'Tách component hợp lý, props rõ ràng, tái sử dụng.'),
      r('data', 'Xử lý dữ liệu & state', 1.5, 'ai', 'Fetch dữ liệu, quản lý state, xử lý loading/lỗi.'),
      r('clean_code', 'Đặt tên & clean code', 1.5, 'ai', 'Tên có nghĩa, không lặp code, format nhất quán.'),
      r('docs', 'Comment / README', 0.5, 'ai', 'README hướng dẫn chạy hoặc comment phần quan trọng.')
    ]
  },
  {
    id: 'cpp',
    name: 'C++',
    builtin: true,
    detect: ['*.cpp', '*.cc', '*.cxx', '*.hpp'],
    ignore: ['*.exe', '*.o', '*.obj', 'Debug/', 'Release/', '.vs/', 'x64/', 'x86/', '.vscode/', 'cmake-build-debug/', 'build/', '*.pdb', '*.ilk'],
    extensions: ['.cpp', '.cc', '.cxx', '.c', '.h', '.hpp', '.hh', '.txt', '.md', '.in', '.out'],
    checks: 'Compile g++ (MinGW-w64), chạy test case (timeout, giới hạn RAM), phân tích tĩnh cơ bản',
    buildEnabled: true,
    buildNote: 'Compile bằng g++ (MinGW-w64). App tự tìm trên máy, nếu không có thì tải bản portable.',
    rubric: [
      r('compile', 'Biên dịch được', 1, 'compile', 'Chương trình biên dịch không lỗi.'),
      r('tests', 'Test case đúng', 4, 'test', 'Chia đều theo số test case đạt.'),
      r('requirements', 'Đúng yêu cầu đề', 2, 'ai', 'Giải đúng bài toán theo đề, xử lý trường hợp biên.'),
      r('structure', 'Cấu trúc & tách hàm', 1.5, 'ai', 'Tách hàm nhập/xử lý/xuất, hàm main gọn.'),
      r('clean_code', 'Đặt tên & clean code', 1, 'ai', 'Tên biến/hàm có nghĩa, không lặp code.'),
      r('docs', 'Comment / README', 0.5, 'ai', 'Comment giải thích phần thuật toán chính.')
    ]
  },
  {
    id: 'c',
    name: 'C',
    builtin: true,
    detect: ['*.c', '*.h'],
    ignore: ['*.exe', '*.o', '*.obj', 'Debug/', 'Release/', '.vs/', 'x64/', 'x86/', '.vscode/', 'build/', '*.pdb', '*.ilk'],
    extensions: ['.c', '.h', '.txt', '.md', '.in', '.out'],
    checks: 'Compile gcc (MinGW-w64), chạy test case (timeout, giới hạn RAM), phân tích tĩnh cơ bản',
    buildEnabled: true,
    buildNote: 'Compile bằng gcc (MinGW-w64). App tự tìm trên máy, nếu không có thì tải bản portable.',
    rubric: [
      r('compile', 'Biên dịch được', 1, 'compile', 'Chương trình biên dịch không lỗi.'),
      r('tests', 'Test case đúng', 4, 'test', 'Chia đều theo số test case đạt.'),
      r('requirements', 'Đúng yêu cầu đề', 2, 'ai', 'Giải đúng bài toán theo đề, xử lý trường hợp biên.'),
      r('structure', 'Cấu trúc & tách hàm', 1.5, 'ai', 'Tách hàm nhập/xử lý/xuất, hàm main gọn.'),
      r('clean_code', 'Đặt tên & clean code', 1, 'ai', 'Tên biến/hàm có nghĩa, không lặp code.'),
      r('docs', 'Comment / README', 0.5, 'ai', 'Comment giải thích phần thuật toán chính.')
    ]
  }
]

export const SOURCE_LABEL: Record<Criterion['source'], string> = {
  compile: 'Tự động · Compile',
  test: 'Tự động · Test',
  static: 'Tự động · Phân tích tĩnh',
  ai: 'AI',
  teacher: 'Giáo viên'
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}
