import type { AiConfidence, AiPolicy, AppSettings, AssignmentKind, CloudProvider, Criterion, CriterionSource, GradeStatus, ReportCheck, TechProfile } from './types'

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

// Context (token) chọn trong AI Models. Cloud AI dùng đúng giá trị chọn; Local AI tối đa LOCAL_MAX_CONTEXT
// (context huấn luyện của Qwen2.5-Coder — lớn hơn chỉ tốn RAM mà model không đọc tốt hơn).
export const CONTEXT_OPTIONS = [8192, 16384, 32768, 102400, 153600, 204800]
export const DEFAULT_CONTEXT = 32768
export const LOCAL_MAX_CONTEXT = 32768

export function effectiveContext(kind: 'local' | 'cloud', contextSize: number): number {
  const n = Number(contextSize) > 0 ? Number(contextSize) : DEFAULT_CONTEXT
  return kind === 'local' ? Math.min(n, LOCAL_MAX_CONTEXT) : n
}

export const DEFAULT_SETTINGS: AppSettings = {
  lang: 'vi',
  mssvPattern: '^\\d{4,20}$',
  contextSize: DEFAULT_CONTEXT,
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
  solcPath: '',
  forgePath: '',
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

// Profile đặc biệt: mỗi bài nộp được nhận diện công nghệ riêng rồi chấm theo profile tương ứng.
export const AUTO_PROFILE_ID = 'auto'

export const BUILTIN_PROFILES: TechProfile[] = [
  {
    id: AUTO_PROFILE_ID,
    name: 'Tự động nhận diện',
    builtin: true,
    detect: [],
    ignore: [],
    extensions: [],
    checks: 'Nhận diện công nghệ của từng bài nộp, rồi lọc file / phân tích tĩnh / biên dịch theo profile nhận diện được',
    buildEnabled: false,
    buildNote: 'Biên dịch theo cấu hình của profile nhận diện được (C/C++ bật sẵn).',
    rubric: [
      r('structure_project', 'Cấu trúc project', 1, 'static', 'Có file mã nguồn chính, cấu trúc thư mục rõ ràng.'),
      r('requirements', 'Đúng yêu cầu đề', 4, 'ai', 'Các chức năng đề yêu cầu đã được cài đặt đúng, xử lý trường hợp biên.'),
      r('structure', 'Cấu trúc & tách hàm/lớp', 2, 'ai', 'Tách hàm/lớp/module hợp lý, không dồn mọi thứ vào một chỗ.'),
      r('clean_code', 'Đặt tên & clean code', 2, 'ai', 'Tên biến/hàm có nghĩa, không lặp code, xử lý lỗi cơ bản.'),
      r('docs', 'Comment', 1, 'ai', 'Comment giải thích phần quan trọng.')
    ]
  },
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
  },
  {
    id: 'python',
    name: 'Python',
    builtin: true,
    detect: ['*.py', 'requirements.txt', 'setup.py', 'manage.py', 'Pipfile'],
    ignore: ['__pycache__/', '*.pyc', '*.pyo', '*.pyd', '.venv/', 'venv/', 'env/', '.env/', 'node_modules/', 'build/', 'dist/', '*.egg-info/'],
    extensions: ['.py', '.pyw', '.pyx', '.txt', '.md', '.json', '.yaml', '.yml', '.cfg', '.ini', '.toml'],
    checks: 'Cấu trúc module, hàm main, xử lý input/output, phân tích tĩnh cơ bản',
    buildEnabled: false,
    buildNote: 'Python không yêu cầu build. App có thể chạy script trực tiếp nếu cài đặt Python.',
    rubric: [
      r('compile', 'Chạy được', 1, 'compile', 'Script chạy không lỗi cú pháp.'),
      r('tests', 'Test case đúng', 4, 'test', 'Chia đều theo số test case đạt.'),
      r('requirements', 'Đúng yêu cầu đề', 2, 'ai', 'Giải đúng bài toán theo đề, xử lý trường hợp biên.'),
      r('structure', 'Cấu trúc & tách hàm', 1.5, 'ai', 'Tách hàm, module hợp lý, hàm main gọn.'),
      r('clean_code', 'Đặt tên & clean code', 1, 'ai', 'Tên biến/hàm có nghĩa, không lặp code, PEP 8.'),
      r('docs', 'Comment / README', 0.5, 'ai', 'Comment giải thích thuật toán, docstring.')
    ]
  },
  {
    id: 'javascript',
    name: 'JavaScript',
    builtin: true,
    detect: ['*.js', '*.mjs', '*.cjs'],
    ignore: ['node_modules/', 'build/', 'dist/', '.next/', '.turbo/', 'coverage/', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'],
    extensions: ['.js', '.mjs', '.cjs', '.jsx', '.json', '.md', '.txt', '.html', '.css', '.scss', '.env'],
    checks: 'Cú pháp JS, module, function, lớp, xử lý lỗi, phân tích tĩnh',
    buildEnabled: false,
    buildNote: 'JavaScript (Node.js) chạy trực tiếp. App không chạy npm install tự động.',
    rubric: [
      r('structure_project', 'Cấu trúc project', 1, 'static', 'Có tệp chính, module rõ ràng, không lộ key trong .env.'),
      r('requirements', 'Đúng yêu cầu đề', 4, 'ai', 'Các chức năng đề yêu cầu đã được cài đặt đúng.'),
      r('functions', 'Hàm & logic', 1.5, 'ai', 'Tách hàm hợp lý, xử lý lỗi, không lặp code.'),
      r('data', 'Xử lý dữ liệu', 1.5, 'ai', 'Thao tác dữ liệu, vòng lặp, điều kiện.'),
      r('clean_code', 'Đặt tên & clean code', 1, 'ai', 'Tên có nghĩa, camelCase/snake_case nhất quán.'),
      r('docs', 'Comment / README', 0.5, 'ai', 'Comment phần quan trọng, README hướng dẫn.')
    ]
  },
  {
    id: 'reactjs',
    name: 'React (Web)',
    builtin: true,
    detect: ['package.json:react', '*.jsx', '*.tsx'],
    ignore: ['node_modules/', 'build/', 'dist/', '.next/', '.vercel/', 'coverage/', 'package-lock.json', 'yarn.lock'],
    extensions: ['.jsx', '.tsx', '.js', '.ts', '.css', '.scss', '.json', '.md', '.html', '.env'],
    checks: 'Component, JSX, state, props, hooks, cấu trúc project React',
    buildEnabled: false,
    buildNote: 'React không cần build. Chạy trực tiếp với Node.js/Babel hoặc bundler của giáo viên.',
    rubric: [
      r('structure_project', 'Cấu trúc project React', 1, 'static', 'Có src/, components/, App.jsx/tsx, index.html.'),
      r('requirements', 'Đúng yêu cầu đề', 4, 'ai', 'Các màn hình/chức năng đề yêu cầu đã được cài đặt đúng.'),
      r('components', 'Component & tái sử dụng', 2, 'ai', 'Tách component hợp lý, props rõ ràng, tái sử dụng cao.'),
      r('state', 'State management', 1.5, 'ai', 'useState/useEffect/useContext, quản lý state hợp lý.'),
      r('clean_code', 'Đặt tên & clean code', 1, 'ai', 'Tên có nghĩa, JSX sạch, không lặp logic.'),
      r('docs', 'Comment / README', 0.5, 'ai', 'Comment props/state, README hướng dẫn chạy.')
    ]
  },
  {
    id: 'react-native',
    name: 'React Native',
    builtin: true,
    detect: ['package.json:react-native', 'package.json:expo'],
    ignore: ['node_modules/', 'android/', 'ios/', 'build/', '.gradle/', '.idea/', '*.apk', '*.aab'],
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.json', '.md', '.css', '.env'],
    checks: 'Component, style, navigation, platform-specific code, React Native API',
    buildEnabled: false,
    buildNote: 'React Native không build trực tiếp. Cần Android Studio/Xcode để build trên thiết bị.',
    rubric: [
      r('structure_project', 'Cấu trúc project React Native', 1, 'static', 'Có App.js/tsx, components/, screens/, navigation.'),
      r('requirements', 'Đúng yêu cầu đề', 4, 'ai', 'Các màn hình/chức năng mobile đề yêu cầu đã cài đặt.'),
      r('components', 'UI Components', 1.5, 'ai', 'View, Text, Image, StyleSheet, component tái sử dụng.'),
      r('navigation', 'Điều hướng', 1.5, 'ai', 'Stack/Tab/Drawer navigation, chuyển màn hình.'),
      r('data', 'Xử lý dữ liệu & API', 1, 'ai', 'Fetch API, async/await, xử lý response/lỗi.'),
      r('clean_code', 'Đặt tên & clean code', 1, 'ai', 'Tên có nghĩa, JSX sạch, style tách riêng.'),
      r('docs', 'Comment / README', 0.5, 'ai', 'Comment phần quan trọng, README hướng dẫn chạy.')
    ]
  },
  {
    id: 'php',
    name: 'PHP',
    builtin: true,
    detect: ['*.php', 'index.php', 'composer.json'],
    ignore: ['vendor/', 'node_modules/', '.git/', '.env', 'storage/', 'bootstrap/cache/', '*.lock'],
    extensions: ['.php', '.phtml', '.php3', '.php4', '.php5', '.phps', '.html', '.css', '.js', '.json', '.sql', '.md', '.txt'],
    checks: 'Cú pháp PHP, OOP, database, MVC, form handling, security',
    buildEnabled: false,
    buildNote: 'PHP chạy trên server. App không chạy web server tự động.',
    rubric: [
      r('structure_project', 'Cấu trúc project PHP', 1, 'static', 'MVC tách biệt, config ngoài code, không lộ thông tin nhạy cảm.'),
      r('requirements', 'Đúng yêu cầu đề', 4, 'ai', 'Các trang/chức năng web đề yêu cầu đã cài đặt.'),
      r('database', 'Database & queries', 1.5, 'ai', 'Kết nối DB, query hiệu quả, ngắt kết nối.'),
      r('security', 'Bảo mật cơ bản', 1, 'static', 'Input validation, SQL injection, XSS protection.'),
      r('clean_code', 'Đặt tên & clean code', 1, 'ai', 'Tên biến/hàm có nghĩa, không lặp code.'),
      r('docs', 'Comment / README', 0.5, 'ai', 'Comment phần quan trọng, README cài đặt.')
    ]
  },
  {
    id: 'csharp',
    name: 'C#',
    builtin: true,
    detect: ['*.cs', '*.sln', '*.csproj'],
    ignore: ['bin/', 'obj/', 'Debug/', 'Release/', 'packages/', '.vs/', '*.dll', '*.exe', '*.pdb'],
    extensions: ['.cs', '.txt', '.md', '.json', '.xml', '.config'],
    checks: 'Cú pháp C#, lớp, interface, namespace, LINQ, async/await',
    buildEnabled: false,
    buildNote: 'C# yêu cầu .NET SDK. App không tự động build project C#.',
    rubric: [
      r('compile', 'Biên dịch được', 1, 'compile', 'Code biên dịch không lỗi cú pháp.'),
      r('tests', 'Test case đúng', 4, 'test', 'Chia đều theo số test case đạt.'),
      r('requirements', 'Đúng yêu cầu đề', 2, 'ai', 'Giải đúng bài toán, xử lý logic nghiệp vụ.'),
      r('oop', 'OOP & thiết kế', 1.5, 'ai', 'Lớp, interface, kế thừa, đóng gói đúng mục đích.'),
      r('clean_code', 'Đặt tên & clean code', 1, 'ai', 'Tên theo PascalCase, không lặp code.'),
      r('docs', 'Comment / README', 0.5, 'ai', 'XML comment cho method, README mô tả.')
    ]
  },
  {
    id: 'solidity',
    name: 'Solidity (Smart Contract)',
    builtin: true,
    detect: ['*.sol', 'foundry.toml', 'hardhat.config.js', 'hardhat.config.ts', 'truffle-config.js'],
    ignore: ['node_modules/', 'artifacts/', 'cache/', '.deps/', 'lib/', 'build/', 'out/', 'coverage/', '*.json', '*.lock'],
    extensions: ['.sol', '.txt', '.md', '.json', '.js', '.ts', '.toml'],
    checks: 'Biên dịch solc (standard-json), test Foundry (forge test), pragma/contract, mẫu bảo mật cơ bản (tx.origin, selfdestruct, call), phân tích tĩnh',
    buildEnabled: true,
    buildNote: 'Biên dịch bằng solc (standard-json) nếu có; test bằng Foundry (forge test) nếu có. App không tự cài solc / Foundry.',
    rubric: [
      r('structure_project', 'Cấu trúc project Solidity', 1, 'static', 'Có pragma, contract/interface/library tách rõ, cấu trúc file hợp lý.'),
      r('compile', 'Biên dịch được (solc)', 1, 'compile', 'Contract biên dịch không lỗi bằng solc.'),
      r('tests', 'Test case đúng', 2, 'test', 'Chia đều theo số test case (Foundry) đạt.'),
      r('requirements', 'Đúng yêu cầu đề', 2.5, 'ai', 'Các hàm/chức năng đề yêu cầu đã được cài đặt đúng theo đề bài.'),
      r('security', 'Bảo mật smart contract', 1.5, 'static', 'Không dùng tx.origin phân quyền, kiểm tra giá trị trả về của call, hạn chế selfdestruct.'),
      r('code_structure', 'Cấu trúc & tách hàm', 1, 'ai', 'Tách hàm/modifier hợp lý, phát event, không dồn logic vào một hàm.'),
      r('clean_code', 'Đặt tên & clean code', 0.5, 'ai', 'Tên biến/hàm có nghĩa, dùng visibility (public/private/external) đúng.'),
      r('docs', 'Comment / README', 0.5, 'ai', 'NatSpec/comment cho hàm quan trọng hoặc README mô tả contract.')
    ]
  },
  {
    id: 'css',
    name: 'CSS/HTML',
    builtin: true,
    detect: ['*.css', '*.scss', '*.sass', '*.html', '*.htm'],
    ignore: ['node_modules/', 'dist/', 'build/', 'bower_components/'],
    extensions: ['.css', '.scss', '.sass', '.less', '.styl', '.html', '.htm', '.xhtml', '.json', '.md', '.txt'],
    checks: 'CSS selector, responsive, layout, HTML semantic, accessibility',
    buildEnabled: false,
    buildNote: 'CSS/HTML là ngôn ngữ markup/styling. Không yêu cầu build.',
    rubric: [
      r('structure', 'Cấu trúc HTML', 1.5, 'static', 'Semantic HTML, thẻ đúng mục đích, cấu trúc rõ ràng.'),
      r('requirements', 'Đúng yêu cầu đề', 3, 'ai', 'Layout, màu sắc, hiệu ứng theo yêu cầu.'),
      r('css_quality', 'Chất lượng CSS', 2, 'ai', 'Selector cụ thể, responsive, không lặp style.'),
      r('responsive', 'Responsive design', 1.5, 'ai', 'Hiển thị tốt trên nhiều kích thước màn hình.'),
      r('accessibility', 'Accessibility', 1, 'static', 'Alt text, ARIA, keyboard navigation.'),
      r('docs', 'Comment / README', 0.5, 'ai', 'Comment phần CSS phức tạp.')
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

// ───────────── Chấm báo cáo (Word / Excel / PowerPoint) ─────────────

// Profile nội bộ cho assignment loại "report" — không nằm trong BUILTIN_PROFILES (không hiện ở Tech Profiles,
// không tham gia nhận diện công nghệ).
export const REPORT_PROFILE_ID = 'report'
export const REPORT_PROFILE: TechProfile = {
  id: REPORT_PROFILE_ID,
  name: 'Báo cáo (Word / Excel / PowerPoint)',
  builtin: true,
  detect: [],
  ignore: ['~$*'], // file khoá tạm của Word / Excel / PowerPoint
  extensions: ['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.rtf'],
  checks: 'Đọc văn bản Word / Excel / PowerPoint, kiểm tra số từ, mục bắt buộc, tài liệu tham khảo',
  buildEnabled: false,
  buildNote: '',
  rubric: []
}

export const REPORT_RUBRIC: Criterion[] = [
  r('format', 'Hình thức & yêu cầu trình bày', 1.5, 'static', 'Đủ số từ, có các mục bắt buộc, có tài liệu tham khảo (kiểm tra tự động).'),
  r('structure', 'Bố cục & cấu trúc', 1.5, 'ai', 'Bố cục logic: mở đầu, nội dung các chương, kết luận; heading rõ ràng, các phần liên kết.'),
  r('content', 'Nội dung & đúng yêu cầu đề', 4, 'ai', 'Trình bày đầy đủ, chính xác các nội dung đề yêu cầu; kiến thức đúng, có chiều sâu.'),
  r('analysis', 'Phân tích, đánh giá & kết luận', 1.5, 'ai', 'Có phân tích, so sánh, đánh giá, ví dụ minh hoạ; kết luận rút ra từ nội dung.'),
  r('language', 'Ngôn ngữ & diễn đạt', 1, 'ai', 'Câu văn rõ ràng, đúng chính tả, ngữ pháp, dùng thuật ngữ chính xác.'),
  r('references', 'Trích dẫn tài liệu', 0.5, 'ai', 'Có trích dẫn nguồn trong bài và danh mục tài liệu tham khảo phù hợp.')
]

export const DEFAULT_REPORT_CHECK: ReportCheck = {
  minWords: 1500,
  maxWords: 0,
  requiredSections: ['Mở đầu', 'Kết luận'],
  requireReferences: true
}

// Nguồn chấm dùng được theo loại bài: báo cáo không có compile / test.
export function sourcesFor(kind: AssignmentKind): CriterionSource[] {
  return kind === 'report' ? ['static', 'ai', 'teacher'] : (Object.keys(SOURCE_LABEL) as CriterionSource[])
}

export function sourceLabel(source: CriterionSource, kind: AssignmentKind = 'code'): string {
  return kind === 'report' && source === 'static' ? 'Tự động · Kiểm tra hình thức' : SOURCE_LABEL[source]
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}
