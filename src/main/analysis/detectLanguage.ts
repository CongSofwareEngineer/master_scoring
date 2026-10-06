import { decodeText } from '../importer/extract'

// Danh sách ngôn ngữ được hỗ trợ với extensions và patterns
const LANGUAGE_DEFINITIONS: Record<string, { 
  name: string; 
  extensions: string[]; 
  filenames: string[]; 
  contentPatterns?: RegExp[]; 
  frameworkOf?: string[]; // Nếu ngôn ngữ này là 1 framework của ngôn ngữ khác
}> = {
  // Web languages
  html: {
    name: 'HTML',
    extensions: ['.html', '.htm', '.xhtml'],
    filenames: ['index.html', 'index.htm'],
    contentPatterns: [/<html/i, /<!DOCTYPE html/i]
  },
  css: {
    name: 'CSS',
    extensions: ['.css', '.scss', '.sass', '.less', '.styl'],
    filenames: ['style.css', 'styles.css', 'main.css', 'app.css'],
    contentPatterns: [/^\s*[{]/m, /@import/i, /@media/i, /@font-face/i]
  },
  javascript: {
    name: 'JavaScript',
    extensions: ['.js', '.mjs', '.cjs', '.jsm'],
    filenames: ['app.js', 'main.js', 'index.js', 'script.js'],
    contentPatterns: [
      /function\s*\(/,
      /const\s+\w+\s*=/,
      /let\s+\w+\s*=/,
      /import\s+.*\s+from\s+['"]/,
      /=>\s*{/,
      /console\.log/,
      /export\s+(default|class|function|const)/
    ]
  },
  typescript: {
    name: 'TypeScript',
    extensions: ['.ts', '.tsx'],
    filenames: ['app.ts', 'main.ts', 'index.ts', 'types.ts'],
    contentPatterns: [
      /interface\s+\w+\s*{/,
      /type\s+\w+\s*=/,
      /<\w+>\s*=/,
      /import.*from.*['"]/,
      /:\s*\w+\s*=/,
      /export\s+(interface|type|class|function|const)/
    ]
  },
  
  // React and React Native
  react: {
    name: 'React',
    extensions: ['.jsx', '.tsx'],
    filenames: ['App.jsx', 'App.tsx', 'index.jsx', 'index.tsx'],
    contentPatterns: [
      /import\s+React/,
      /from\s+['"]react['"]/,
      /React\.createElement/,
      /<\w+\s+[^>]*>/,
      /useState/,
      /useEffect/,
      /useContext/,
      /function\s+\w+\s*\(\s*props/,
      /\.jsx?\s*$/i
    ]
  },
  'react-native': {
    name: 'React Native',
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    filenames: ['App.js', 'App.tsx', 'App.jsx', 'index.js', 'index.tsx'],
    contentPatterns: [
      /import\s+.*\s+from\s+['"]react-native['"]/,
      /from\s+['"]react-native['"]/,
      /<View/,
      /<Text/,
      /<Image/,
      /<ScrollView/,
      /<SafeAreaView/,
      /StyleSheet\.create/,
      /useWindowDimensions/,
      /Platform\.OS/,
      /react-native/,
      /\.native\.js/i
    ],
    frameworkOf: ['javascript', 'typescript']
  },
  
  // Backend languages
  python: {
    name: 'Python',
    extensions: ['.py', '.pyw', '.pyx'],
    filenames: ['main.py', 'app.py', 'script.py', '__init__.py', 'requirements.txt', 'setup.py'],
    contentPatterns: [
      /^def\s+\w+\s*\(/m,
      /^class\s+\w+:/m,
      /^import\s+\w+/m,
      /^from\s+\w+\s+import/m,
      /print\s*\(/,
      /#\s*[\[\w]/,
      /self\./,
      /__name__/,
      /requests\./,
      /flask/,
      /django/
    ]
  },
  php: {
    name: 'PHP',
    extensions: ['.php', '.phtml', '.php3', '.php4', '.php5', '.phps'],
    filenames: ['index.php', 'config.php', 'functions.php', 'header.php', 'footer.php'],
    contentPatterns: [
      /^<\?php/m,
      /\?>$/, 
      /^<?/m,
      /function\s+\w+\s*\(/m,
      /\$\w+\s*=/,
      /echo\s+/,
      /new\s+\\w+\s*\(/,
      /->\w+\s*\(/,
      /namespace\s+\w+\s*;/,
      /use\s+\\w+\s*;/
    ]
  },
  csharp: {
    name: 'C#',
    extensions: ['.cs'],
    filenames: ['Program.cs', 'Main.cs', 'App.cs', 'Startup.cs'],
    contentPatterns: [
      /^using\s+System/mi,
      /^namespace\s+\w+/m,
      /^public\s+class\s+\w+/m,
      /^private\s+void\s+\w+/m,
      /Console\.WriteLine/,
      /new\s+\w+\s*\(/,
      /\.cs$/i,
      /=>\s*{/,
      /async\s+\w+\s*\(/,
      /await\s+\w+\(/
    ]
  },
  
  // Other languages
  java: {
    name: 'Java',
    extensions: ['.java'],
    filenames: ['Main.java', 'App.java', 'Application.java'],
    contentPatterns: [
      /^import\s+java\./m,
      /^public\s+class\s+\w+/m,
      /^private\s+static\s+void\s+main/m,
      /System\.out\.println/,
      /new\s+\w+\s*\(/,
      /@Override/,
      /extends\s+\w+/,
      /implements\s+\w+/,
      /public\s+\w+\s*\(/,
      /\.java$/i
    ]
  },
  ruby: {
    name: 'Ruby',
    extensions: ['.rb', '.rbw', '.rake', '.gemspec'],
    filenames: ['main.rb', 'app.rb', 'config.ru', 'Gemfile'],
    contentPatterns: [
      /^def\s+\w+/m,
      /^class\s+\w+/m,
      /^module\s+\w+/m,
      /require\s+['"]/,
      /end$/m,
      /do\s*\|/,
      /puts\s+/, 
      /\.rb$/i
    ]
  },
  go: {
    name: 'Go',
    extensions: ['.go'],
    filenames: ['main.go', 'app.go', 'go.mod', 'go.sum'],
    contentPatterns: [
      /^package\s+\w+/m,
      /^import\s*\(/m,
      /^func\s+\w+\s*\(/m,
      /^type\s+\w+\s+struct\s*{/m,
      /func\s+\(.*\)\s+\w+/m,
      /:=/,
      /goroutine/,
      /chan\s+\w+/,
      /\.go$/i
    ]
  },
  rust: {
    name: 'Rust',
    extensions: ['.rs'],
    filenames: ['main.rs', 'lib.rs', 'Cargo.toml'],
    contentPatterns: [
      /^fn\s+\w+\s*\(/m,
      /^pub\s+fn/m,
      /^struct\s+\w+\s*{/m,
      /^impl\s+\w+/m,
      /^use\s+\w+/m,
      /let\s+\w+\s*:/,
      /->\s*\w+/,
      /#\[derive\(/,
      /\.rs$/i
    ]
  },
  swift: {
    name: 'Swift',
    extensions: ['.swift'],
    filenames: ['main.swift', 'App.swift', 'ViewController.swift'],
    contentPatterns: [
      /^import\s+\w+/m,
      /^class\s+\w+:/m,
      /^func\s+\w+\s*\(/m,
      /^struct\s+\w+\s*{/m,
      /^protocol\s+\w+\s*{/m,
      /var\s+\w+\s*:/,
      /let\s+\w+\s*:/,
      /guard\s+let/,
      /\.swift$/i
    ]
  },
  kotlin: {
    name: 'Kotlin',
    extensions: ['.kt', '.kts'],
    filenames: ['Main.kt', 'App.kt', 'Activity.kt'],
    contentPatterns: [
      /^package\s+\w+/m,
      /^import\s+\w+/m,
      /^fun\s+\w+\s*\(/m,
      /^class\s+\w+\s*{/m,
      /^data\s+class/m,
      /^val\s+\w+\s*:/m,
      /^var\s+\w+\s*:/m,
      /println\(/,
      /\.kt$/i,
      /\.kts$/i
    ]
  },
  
  // Config/Markup
  json: {
    name: 'JSON',
    extensions: ['.json'],
    filenames: ['package.json', 'tsconfig.json', 'composer.json', 'config.json'],
    contentPatterns: [/^\s*[{]/m, /"[^\"]+":/]
  },
  yaml: {
    name: 'YAML',
    extensions: ['.yaml', '.yml'],
    filenames: ['docker-compose.yml', 'config.yml', 'app.yaml'],
    contentPatterns: [/^[^\s]/m, /:\s*$/m]
  },
  markdown: {
    name: 'Markdown',
    extensions: ['.md', '.markdown'],
    filenames: ['README.md', 'CHANGELOG.md', 'LICENSE'],
    contentPatterns: [/^#\s+/, /^##\s+/, /^###\s+/, /^\[.*\]\(.*\)/m]
  },
  
  // Frameworks (nên phát hiện sau ngôn ngữ chính)
  nextjs: {
    name: 'Next.js',
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    filenames: ['next.config.js', 'next.config.ts', 'pages/_app.js', 'pages/_app.tsx', 'app/page.js', 'app/page.tsx'],
    contentPatterns: [
      /from\s+['"]next\//,
      /import\s+.*\s+from\s+['"]next\//,
      /getServerSideProps/,
      /getStaticProps/,
      /next\/link/,
      /next\/router/,
      /next\/image/,
      /next\/head/,
      /pages\/api\//,
      /app\/layout/,
      /app\/page/
    ],
    frameworkOf: ['javascript', 'typescript']
  },
  express: {
    name: 'Express.js',
    extensions: ['.js', '.ts'],
    filenames: ['server.js', 'app.js', 'index.js'],
    contentPatterns: [
      /require\s*\(\s*['"]express['"]/,
      /import\s+express/,
      /from\s+['"]express['"]/,
      /app\.get\(/,
      /app\.post\(/,
      /app\.use\(/,
      /router\./,
      /express\.Router\(\)/,
      /res\.send\(/,
      /req\.params/,
      /req\.body/
    ],
    frameworkOf: ['javascript', 'typescript']
  },
  vue: {
    name: 'Vue',
    extensions: ['.vue', '.js', '.ts'],
    filenames: ['App.vue', 'main.js', 'main.ts'],
    contentPatterns: [
      /import\s+Vue/,
      /from\s+['"]vue['"]/,
      /<template>/,
      /<script>/, 
      /<style>/, 
      /vue/,
      /data\(\)\s*{/,
      /methods:\s*{/,
      /new\s+Vue\(/,
      /createApp\(/,
      /\.vue$/i
    ],
    frameworkOf: ['javascript', 'typescript']
  },
  angular: {
    name: 'Angular',
    extensions: ['.ts', '.html', '.component.ts'],
    filenames: ['angular.json', 'app.module.ts', 'app.component.ts', 'environment.ts'],
    contentPatterns: [
      /from\s+['"]@angular/,
      /import\s+.*\s+from\s+['"]@angular/,
      /@Component\(/,
      /@NgModule\(/,
      /@Injectable\(/,
      /ngOnInit\(/,
      /angular/,
      /NgModule/,
      /Component\(/,
      /Injectable\(\)/
    ],
    frameworkOf: ['typescript']
  },
  django: {
    name: 'Django',
    extensions: ['.py'],
    filenames: ['manage.py', 'settings.py', 'urls.py', 'models.py', 'views.py'],
    contentPatterns: [
      /from\s+django/,
      /import\s+django/,
      /django\./,
      /models\.Model/,
      /views\.View/,
      /urls\.path/,
      /@app\.route/,
      /django-admin/,
      /manage\.py/,
      /settings\.py/
    ],
    frameworkOf: ['python']
  },
  flask: {
    name: 'Flask',
    extensions: ['.py'],
    filenames: ['app.py', 'server.py', 'application.py'],
    contentPatterns: [
      /from\s+flask/,
      /import\s+flask/,
      /Flask\(/,
      /@app\.route/,
      /request\./,
      /render_template/,
      /jsonify/,
      /flask\./
    ],
    frameworkOf: ['python']
  },
  laravel: {
    name: 'Laravel',
    extensions: ['.php'],
    filenames: ['artisan', 'composer.json', 'routes/web.php', 'routes/api.php'],
    contentPatterns: [
      /laravel/,
      /Laravel/,
      /Route::/,
      /use\s+Illuminate/,
      /app\/Http\//,
      /resources\/views\//,
      /artisan/,
      /eloquent/,
      /migration/
    ],
    frameworkOf: ['php']
  },
  
  // Database
  sql: {
    name: 'SQL',
    extensions: ['.sql', '.ddl', '.dml'],
    filenames: ['schema.sql', 'migration.sql', 'queries.sql'],
    contentPatterns: [
      /^SELECT\s/i,
      /^INSERT\s/i,
      /^UPDATE\s/i,
      /^DELETE\s/i,
      /^CREATE\s+TABLE/i,
      /^ALTER\s+TABLE/i,
      /^DROP\s+TABLE/i,
      /^BEGIN;/, 
      /^COMMIT;/,
      /^--/,
      /^\/\*/
    ]
  }
} as const

// Thứ tự ưu tiên: framework trước, sau đó là ngôn ngữ
const DETECTION_ORDER = [
  'react-native', 'nextjs', 'express', 'vue', 'angular', 'django', 'flask', 'laravel',
  'typescript', 'javascript', 'react', 
  'python', 'php', 'csharp', 'java', 'ruby', 'go', 'rust', 'swift', 'kotlin',
  'html', 'css', 'json', 'yaml', 'markdown', 'sql'
]

export type LanguageId = keyof typeof LANGUAGE_DEFINITIONS
export type DetectedLanguage = {
  id: LanguageId
  name: string
  confidence: 'high' | 'medium' | 'low'
  evidence: string[]
  isFramework: boolean
  baseLanguage?: LanguageId
}

/**
 * Phát hiện ngôn ngữ từ file path (dựa trên extension và tên file)
 */
export function detectLanguageFromPath(filePath: string): DetectedLanguage | null {
  const lowerPath = filePath.toLowerCase()
  const baseName = lowerPath.split('/').pop() || lowerPath
  const extension = lowerPath.includes('.') ? lowerPath.slice(lowerPath.lastIndexOf('.')) : ''
  
  for (const langId of DETECTION_ORDER) {
    const lang = LANGUAGE_DEFINITIONS[langId as LanguageId]
    
    // Kiểm tra extension
    const hasExtension = lang.extensions.some(ext => lowerPath.endsWith(ext) || baseName.endsWith(ext))
    
    // Kiểm tra filename
    const hasFilename = lang.filenames.some(name => baseName === name.toLowerCase() || lowerPath.includes('/' + name.toLowerCase()))
    
    if (hasExtension || hasFilename) {
      return {
        id: langId as LanguageId,
        name: lang.name,
        confidence: hasExtension ? 'high' : 'medium',
        evidence: [hasExtension ? `Extension: ${extension}` : `Filename: ${baseName}`],
        isFramework: !!lang.frameworkOf?.length,
        baseLanguage: lang.frameworkOf?.[0] as LanguageId | undefined
      }
    }
  }
  
  return null
}

/**
 * Phát hiện ngôn ngữ từ nội dung file
 */
export function detectLanguageFromContent(content: string, filePath?: string): DetectedLanguage | null {
  for (const langId of DETECTION_ORDER) {
    const lang = LANGUAGE_DEFINITIONS[langId as LanguageId]
    
    if (!lang.contentPatterns?.length) continue
    
    for (const pattern of lang.contentPatterns) {
      if (pattern.test(content)) {
        const fromPath = filePath ? detectLanguageFromPath(filePath) : null
        const evidence: string[] = [`Content pattern: ${pattern.source}`]
        
        if (fromPath && fromPath.id === langId) {
          evidence.push(...fromPath.evidence)
          return {
            ...fromPath,
            confidence: 'high' as const,
            evidence
          }
        }
        
        return {
          id: langId as LanguageId,
          name: lang.name,
          confidence: 'medium' as const,
          evidence,
          isFramework: !!lang.frameworkOf?.length,
          baseLanguage: lang.frameworkOf?.[0] as LanguageId | undefined
        }
      }
    }
  }
  
  return null
}

/**
 * Phát hiện ngôn ngữ chính của toàn bộ submission
 * Trả về ngôn ngữ xuất hiện nhiều nhất
 */
export function detectPrimaryLanguage(files: Map<string, Buffer>): DetectedLanguage | null {
  const languageCount = new Map<LanguageId, { 
    lang: DetectedLanguage; 
    count: number; 
    totalLines: number 
  }>()
  
  for (const [filePath, content] of files) {
    const fromPath = detectLanguageFromPath(filePath)
    const fromContent = detectLanguageFromContent(decodeText(content), filePath)
    
    // Ưu tiên phát hiện từ content nếu có
    const detected = fromContent || fromPath
    
    if (detected) {
      const baseLangId = detected.isFramework ? detected.baseLanguage || detected.id : detected.id
      const entry = languageCount.get(baseLangId) || { 
        lang: detected, 
        count: 0, 
        totalLines: 0 
      }
      
      const lines = decodeText(content).split('\n').length
      entry.count++
      entry.totalLines += lines
      
      // Giữ ngôn ngữ có độ tin cậy cao nhất
      if (!languageCount.has(baseLangId) || 
          (detected.confidence === 'high' && entry.lang.confidence !== 'high')) {
        entry.lang = detected
      }
      
      languageCount.set(baseLangId, entry)
    }
  }
  
  if (languageCount.size === 0) return null
  
  // Tìm ngôn ngữ có tổng số dòng cao nhất
  let primary: { lang: DetectedLanguage; count: number; totalLines: number } | null = null
  for (const [, entry] of languageCount) {
    if (!primary || entry.totalLines > primary.totalLines) {
      primary = entry
    }
  }
  
  return primary?.lang || null
}

/**
 * Phát hiện tất cả ngôn ngữ trong submission
 */
export function detectAllLanguages(files: Map<string, Buffer>): DetectedLanguage[] {
  const languages = new Map<LanguageId, DetectedLanguage>()
  
  for (const [filePath, content] of files) {
    const fromPath = detectLanguageFromPath(filePath)
    const fromContent = detectLanguageFromContent(decodeText(content), filePath)
    
    const detected = fromContent || fromPath
    
    if (detected) {
      const baseLangId = detected.isFramework ? detected.baseLanguage || detected.id : detected.id
      
      // Giữ ngôn ngữ có độ tin cậy cao nhất
      const existing = languages.get(baseLangId)
      if (!existing || 
          (detected.confidence === 'high' && existing.confidence !== 'high') ||
          (detected.confidence === 'medium' && existing.confidence === 'low')) {
        languages.set(baseLangId, detected)
      }
    }
  }
  
  return [...languages.values()]
}

/**
 * Lấy tên ngôn ngữ từ ID
 */
export function getLanguageName(langId: LanguageId): string {
  return LANGUAGE_DEFINITIONS[langId]?.name || langId
}

/**
 * Kiểm tra xem language ID có phải là framework hay không
 */
export function isFramework(langId: LanguageId): boolean {
  return !!LANGUAGE_DEFINITIONS[langId]?.frameworkOf?.length
}

/**
 * Lấy ngôn ngữ cơ bản của framework
 */
export function getBaseLanguage(langId: LanguageId): LanguageId | undefined {
  return LANGUAGE_DEFINITIONS[langId as LanguageId]?.frameworkOf?.[0] as LanguageId | undefined
}

/**
 * Lấy tất cả language IDs
 */
export function getAllLanguageIds(): LanguageId[] {
  return DETECTION_ORDER as LanguageId[]
}

/**
 * Lấy extensions của một ngôn ngữ
 */
export function getLanguageExtensions(langId: LanguageId): string[] {
  return LANGUAGE_DEFINITIONS[langId as LanguageId]?.extensions || []
}

/**
 * Kiểm tra xem file có thuộc ngôn ngữ nào đó không
 */
export function isLanguageFile(filePath: string, langId: LanguageId): boolean {
  const detected = detectLanguageFromPath(filePath)
  if (detected && (detected.id === langId || detected.baseLanguage === langId)) {
    return true
  }
  return false
}