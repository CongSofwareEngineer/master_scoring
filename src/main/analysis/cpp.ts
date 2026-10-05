// Compile + chạy test case cho bài C/C++.
import { dirname, join } from 'path'
import type { Assignment, AutoResult, Issue, TestRunResult } from '@shared/types'
import { decodeText, writeFilesTo } from '../importer/extract'
import { isElevated } from '../proc'
import { findCompiler } from './mingw'
import { runProcess } from './runner'

const isWin = process.platform === 'win32'

function normalizeOutput(s: string, ignoreWs: boolean): string {
  const lines = s.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+$/, ''))
  while (lines.length && !lines[lines.length - 1]) lines.pop()
  if (ignoreWs) return lines.map((l) => l.trim().replace(/\s+/g, ' ')).filter(Boolean).join('\n')
  return lines.join('\n')
}

function parseCompilerErrors(out: string, workDir: string): Issue[] {
  const issues: Issue[] = []
  const prefix = workDir.replace(/\\/g, '/') + '/'
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^(.+?):(\d+):(?:\d+:)?\s*(fatal error|error|warning):\s*(.+)$/)
    if (!m) continue
    const file = m[1].replace(/\\/g, '/').replace(prefix, '')
    issues.push({
      source: 'Compile',
      severity: m[3] === 'warning' ? 'warning' : 'error',
      file,
      line: Number(m[2]),
      message: m[4].trim(),
      criterionId: undefined
    })
    if (issues.length >= 30) break
  }
  return issues
}

export async function compileAndTest(
  lang: 'c' | 'cpp',
  files: Map<string, Buffer>,
  a: Assignment,
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
  const compiler = await findCompiler(lang)
  if (!compiler) {
    auto.compile = {
      attempted: false,
      ok: false,
      output: '',
      command: '',
      skippedReason: 'Chưa có bộ compile gcc/g++. Vào Tech Profiles → C/C++ để tải MinGW-w64.'
    }
    return { auto, issues }
  }
  writeFilesTo(workDir, files)
  const srcRe = lang === 'c' ? /\.c$/i : /\.(cpp|cc|cxx|c)$/i
  let sources = [...files.keys()].filter((p) => srcRe.test(p))
  const mains = sources.filter((p) => /\b(int|void)\s+main\s*\(/.test(decodeText(files.get(p)!)))
  if (mains.length > 1) {
    const chosen = mains.find((p) => /(^|\/)main\.(c|cpp|cc|cxx)$/i.test(p)) ?? mains[0]
    sources = sources.filter((p) => !mains.includes(p) || p === chosen)
    issues.push({ source: 'Compile', severity: 'info', message: `Có ${mains.length} file chứa main(), chỉ biên dịch ${chosen}` })
  }
  if (!sources.length) {
    auto.compile = { attempted: false, ok: false, output: '', command: '', skippedReason: 'Không có file mã nguồn để biên dịch' }
    return { auto, issues }
  }
  const outExe = join(workDir, isWin ? '__prog.exe' : '__prog')
  const args = [
    ...(lang === 'cpp' ? ['-std=c++17'] : ['-std=c11']),
    '-O2',
    '-w',
    ...(isWin ? ['-static'] : []),
    '-o',
    outExe,
    ...sources.map((s) => join(workDir, s))
  ]
  // Thêm thư mục chứa header vào include path
  const incDirs = [...new Set([...files.keys()].filter((p) => /\.(h|hpp|hh)$/i.test(p)).map((p) => dirname(join(workDir, p))))]
  for (const d of incDirs) args.unshift('-I', d)
  const env = { ...process.env, PATH: dirname(compiler) + (isWin ? ';' : ':') + (process.env.PATH ?? '') }
  const cr = await runProcess(compiler, args, { cwd: workDir, timeoutMs: 90_000, env, maxOutputBytes: 256 * 1024 })
  if (signal.aborted) throw new Error('Đã huỷ')
  const output = (cr.stdout + cr.stderr).replace(new RegExp(workDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\\\/]', 'g'), '')
  const ok = cr.exitCode === 0 && !cr.timedOut
  auto.compile = {
    attempted: true,
    ok,
    output: output.slice(0, 20000) || (cr.spawnError ?? ''),
    command: `${lang === 'c' ? 'gcc' : 'g++'} ${args.filter((x) => !x.startsWith(workDir)).join(' ')} ${sources.join(' ')}`
  }
  if (!ok) {
    const parsed = parseCompilerErrors(cr.stdout + cr.stderr, workDir)
    issues.push(...(parsed.length ? parsed : [{ source: 'Compile' as const, severity: 'error' as const, message: cr.timedOut ? 'Biên dịch quá thời gian' : 'Biên dịch thất bại' }]))
  }

  if (ok && a.testCases.length) {
    const results: TestRunResult[] = []
    for (const tc of a.testCases) {
      if (signal.aborted) throw new Error('Đã huỷ')
      const r = await runProcess(outExe, [], {
        cwd: workDir,
        input: tc.input.replace(/\r\n/g, '\n').endsWith('\n') ? tc.input : tc.input + '\n',
        timeoutMs: a.timeLimitMs || 2000,
        memoryLimitMb: a.memoryLimitMb || 256,
        maxOutputBytes: 1024 * 1024
      })
      let error: string | undefined
      if (r.timedOut) error = `Quá thời gian (${a.timeLimitMs} ms)`
      else if (r.memExceeded) error = `Vượt giới hạn RAM (${a.memoryLimitMb} MB)`
      else if (r.outputExceeded) error = 'Output quá lớn (> 1 MB)'
      else if (r.spawnError) error = r.spawnError
      else if (r.exitCode !== 0) error = `Chương trình kết thúc với mã ${r.exitCode}`
      const passed = !error && normalizeOutput(r.stdout, a.ignoreWhitespace) === normalizeOutput(tc.expected, a.ignoreWhitespace)
      // Mã khác 0 nhưng output đúng → vẫn tính đạt, chỉ ghi chú
      const passedLoose = !passed && !r.timedOut && !r.memExceeded && !r.outputExceeded && normalizeOutput(r.stdout, a.ignoreWhitespace) === normalizeOutput(tc.expected, a.ignoreWhitespace)
      results.push({
        id: tc.id,
        name: tc.name,
        passed: passed || passedLoose,
        timeMs: r.timeMs,
        exitCode: r.exitCode,
        stdout: r.stdout.slice(0, 4000),
        stderr: r.stderr.slice(0, 2000),
        expected: tc.expected.slice(0, 4000),
        error: passed || passedLoose ? (passedLoose ? error : undefined) : error ?? 'Output không khớp'
      })
      if (!(passed || passedLoose)) {
        issues.push({ source: 'Test', severity: 'error', message: `${tc.name}: ${error ?? 'Output không khớp kết quả mong đợi'}` })
      }
    }
    auto.tests = results
  }
  return { auto, issues }
}
