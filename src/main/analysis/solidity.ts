// Biên dịch Solidity (solc --standard-json) và chạy test Foundry (forge test).
// Giống C/C++: không chạy khi app đang có quyền Administrator; output được parse thành issue [Compile]/[Test].
import { execFile } from 'child_process'
import { existsSync, statSync } from 'fs'
import { join } from 'path'
import type { AutoResult, Issue, TestRunResult } from '@shared/types'
import { decodeText, writeFilesTo } from '../importer/extract'
import { paths } from '../paths'
import { isElevated } from '../proc'
import { getSettings } from '../settings'
import { runProcess } from './runner'

const isWin = process.platform === 'win32'
const MAX_ISSUES = 30

function which(cmd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(isWin ? 'where' : 'which', [cmd], { windowsHide: true }, (err, out) => {
      if (err) return resolve(null)
      resolve(out.split(/\r?\n/).find((l) => l.trim())?.trim() ?? null)
    })
  })
}

function findTool(custom: string, name: string, runtimeDir: string): Promise<string | null> {
  const exe = name + (isWin ? '.exe' : '')
  const candidates: string[] = []
  if (custom) {
    if (existsSync(custom) && statSync(custom).isFile()) candidates.push(custom)
    candidates.push(join(custom, exe), join(custom, 'bin', exe))
  }
  candidates.push(join(paths.runtime, runtimeDir, exe))
  for (const c of candidates) if (existsSync(c) && statSync(c).isFile()) return Promise.resolve(c)
  return which(name)
}

// Trình biên dịch solc: settings.solcPath (file/thư mục) → runtime/solc → PATH.
export function findSolc(): Promise<string | null> {
  return findTool(getSettings(null).solcPath, 'solc', 'solc')
}

// Foundry forge (chạy test): settings.forgePath (file/thư mục) → runtime/forge → PATH.
export function findForge(): Promise<string | null> {
  return findTool(getSettings(null).forgePath, 'forge', 'forge')
}

interface SolcError {
  severity?: string
  message?: string
  formattedMessage?: string
  sourceLocation?: { file?: string; start?: number; end?: number }
}

// Số dòng (1-based) từ offset ký tự trong nội dung file.
function lineFromOffset(content: string, offset: number): number {
  let line = 1
  const end = Math.min(offset, content.length)
  for (let i = 0; i < end; i++) if (content.charCodeAt(i) === 10) line++
  return line
}

function severityOf(s: string | undefined): Issue['severity'] {
  return s === 'error' ? 'error' : s === 'warning' ? 'warning' : 'info'
}

export async function compileSolidity(
  files: Map<string, Buffer>,
  workDir: string,
  signal: AbortSignal
): Promise<{ auto: AutoResult; issues: Issue[] }> {
  const issues: Issue[] = []
  const auto: AutoResult = {}
  if (await isElevated()) {
    auto.compile = {
      attempted: false,
      ok: false,
      output: '',
      command: '',
      skippedReason: 'App đang chạy với quyền Administrator — không chạy code sinh viên vì lý do an toàn. Hãy mở app bằng quyền thường.'
    }
    return { auto, issues }
  }
  const solc = await findSolc()
  if (!solc) {
    auto.compile = {
      attempted: false,
      ok: false,
      output: '',
      command: '',
      skippedReason: 'Chưa có solc. Cài solc (hoặc chọn đường dẫn trong Tech Profiles → Solidity).'
    }
    return { auto, issues }
  }
  const sources = new Map([...files].filter(([p]) => /\.sol$/i.test(p)))
  if (!sources.size) {
    auto.compile = { attempted: false, ok: false, output: '', command: '', skippedReason: 'Không có file .sol để biên dịch' }
    return { auto, issues }
  }
  writeFilesTo(workDir, files)
  const srcText = new Map<string, string>()
  const jsonSources: Record<string, { content: string }> = {}
  for (const [p, b] of sources) {
    const text = decodeText(b)
    srcText.set(p, text)
    jsonSources[p] = { content: text }
  }
  const input = JSON.stringify({
    language: 'Solidity',
    sources: jsonSources,
    settings: { outputSelection: { '*': { '*': ['abi'] } } }
  })
  const r = await runProcess(solc, ['--standard-json'], { cwd: workDir, input, timeoutMs: 90_000, maxOutputBytes: 8 * 1024 * 1024 })
  if (signal.aborted) throw new Error('Đã huỷ')

  let parsed: { errors?: SolcError[] } | null = null
  try {
    parsed = JSON.parse(r.stdout) as { errors?: SolcError[] }
  } catch {
    /* solc không trả JSON (crash / thiếu DLL…) */
  }
  const errs = (parsed?.errors ?? []).filter((e) => e.severity === 'error')
  const ok = r.exitCode === 0 && !r.timedOut && !!parsed && errs.length === 0
  const lines = (parsed?.errors ?? []).map((e) => e.formattedMessage ?? `${e.severity ?? 'error'}: ${e.message ?? ''}`)
  const output = parsed ? lines.join('\n') : r.stdout + r.stderr
  auto.compile = {
    attempted: true,
    ok,
    output: ((r.timedOut ? 'Biên dịch quá thời gian (> 90 giây)\n' : '') + output).slice(0, 20000),
    command: 'solc --standard-json'
  }
  for (const e of parsed?.errors ?? []) {
    const file = e.sourceLocation?.file
    issues.push({
      source: 'Compile',
      severity: severityOf(e.severity),
      file,
      line: file && typeof e.sourceLocation?.start === 'number' ? lineFromOffset(srcText.get(file) ?? '', e.sourceLocation.start) : undefined,
      message: e.message ?? e.formattedMessage ?? 'Lỗi biên dịch'
    })
    if (issues.length >= MAX_ISSUES) break
  }
  if (!ok && !issues.length) {
    issues.push({ source: 'Compile', severity: 'error', message: r.timedOut ? 'Biên dịch quá thời gian' : 'Biên dịch thất bại' })
  }
  return { auto, issues }
}

// Chạy `forge test` nếu có Foundry và bài nộp là project Foundry. Mỗi dòng [PASS]/[FAIL] → 1 test case.
export async function testSolidity(files: Map<string, Buffer>, workDir: string, signal: AbortSignal): Promise<{ auto: AutoResult; issues: Issue[] }> {
  const issues: Issue[] = []
  const auto: AutoResult = {}
  const hasTestDir = [...files.keys()].some((p) => /(^|\/)test\/.+\.sol$/i.test(p) || /\.t\.sol$/i.test(p))
  if (!hasTestDir) return { auto, issues }
  const forge = await findForge()
  if (!forge) return { auto, issues }
  if (signal.aborted) throw new Error('Đã huỷ')
  const r = await runProcess(forge, ['test', '--offline'], { cwd: workDir, timeoutMs: 300_000, maxOutputBytes: 8 * 1024 * 1024 })
  if (signal.aborted) throw new Error('Đã huỷ')
  // forge in `[STATUS: lý do (có thể chứa dấu ])] testName() (gas: …)` và lặp lại test lỗi ở phần tóm tắt
  // "Failing tests" → khử trùng theo tên test.
  const seen = new Map<string, TestRunResult>()
  for (const line of (r.stdout + '\n' + r.stderr).split(/\r?\n/)) {
    const m = line.match(/^\[(PASS|FAIL|SKIP)\b.*\]\s+(\S+)/)
    if (!m) continue
    const status = m[1]
    const name = m[2].replace(/\(.*\)$/, '')
    if (seen.has(name)) continue
    seen.set(name, {
      id: `forge-${seen.size + 1}`,
      name,
      passed: status === 'PASS',
      timeMs: 0,
      exitCode: r.exitCode,
      stdout: '',
      stderr: '',
      expected: '',
      error: status === 'PASS' ? undefined : status === 'FAIL' ? 'Test thất bại (forge test)' : 'Bỏ qua (skip)'
    })
  }
  const results = [...seen.values()]
  if (results.length) {
    auto.tests = results
    for (const t of results) if (!t.passed && t.error !== 'Bỏ qua (skip)') issues.push({ source: 'Test', severity: 'error', message: `${t.name}: ${t.error}` })
  } else if (r.exitCode !== 0 && !r.timedOut) {
    issues.push({ source: 'Test', severity: 'warning', message: 'forge test không chạy được — kiểm tra Foundry / thư viện (thư mục lib/ bị bỏ qua khi giải nén).' })
  }
  return { auto, issues }
}
