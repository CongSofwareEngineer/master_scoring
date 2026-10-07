import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  File,
  FileCode2,
  Folder,
  FolderOpen,
  Info,
  Lock,
  MessageCircleQuestion,
  PanelRightOpen,
  Pencil,
  RotateCcw,
  Search,
  Copy,
  Sparkles,
  Unlock,
  X
} from 'lucide-react'
import { CONFIDENCE_LABEL, sourceLabel } from '@shared/constants'
import type { AiPenaltyMode, AiQuestions, FileNode, Issue, StudentResult, StudentRow } from '@shared/types'
import { call, on } from '../lib/api'
import { cls, fmtScore, fmtTime } from '../lib/format'
import { useT } from '../lib/i18n'
import { attempt, useCurrentAssignment, useStore } from '../lib/store'
import { CodeViewer, openSearch, type LineMark } from '../components/CodeViewer'
import { AiLevelBadge, Empty, OriginBar, StatusBadge } from '../components/ui'
import { NoAssignment } from './Dashboard'

interface TreeNode {
  name: string
  path: string
  dir: boolean
  children: TreeNode[]
}

function buildTree(files: FileNode[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', dir: true, children: [] }
  for (const f of files) {
    const parts = f.path.split('/')
    let node = root
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1
      const p = parts.slice(0, i + 1).join('/')
      let child = node.children.find((c) => c.name === part && c.dir === !isFile)
      if (!child) {
        child = { name: part, path: p, dir: !isFile, children: [] }
        node.children.push(child)
      }
      node = child
    })
  }
  const sort = (n: TreeNode): void => {
    n.children.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1))
    n.children.forEach(sort)
  }
  sort(root)
  return root.children
}

function pickInitialFile(files: FileNode[], issues: Issue[]): string | null {
  if (!files.length) return null
  const counts = new Map<string, number>()
  for (const i of issues) if (i.file) counts.set(i.file, (counts.get(i.file) ?? 0) + 1)
  const score = (p: string): number => {
    const b = p.toLowerCase().split('/').pop()!
    if (/^main\.(c|cpp|cc|java|kt)$/.test(b)) return 0
    if (/mainactivity\.(java|kt)$/.test(b)) return 1
    if (/(^|\/)app\/page\.(t|j)sx?$/.test(p.toLowerCase()) || /pages\/index\.(t|j)sx?$/.test(p.toLowerCase())) return 1
    if (/\.(c|cpp|java|kt|tsx|jsx|ts|js)$/.test(b)) return 5
    return 10
  }
  return [...files].sort((a, b) => score(a.path) - score(b.path) || (counts.get(b.path) ?? 0) - (counts.get(a.path) ?? 0))[0].path
}

export function CodeReviewPage(): JSX.Element {
  const t = useT()
  const a = useCurrentAssignment()
  const params = useStore((s) => s.params)
  const go = useStore((s) => s.go)
  const toast = useStore((s) => s.toast)
  const [students, setStudents] = useState<StudentRow[]>([])
  const [studentId, setStudentId] = useState<number | null>(params.studentId ?? null)
  const [result, setResult] = useState<StudentResult | null>(null)
  const [files, setFiles] = useState<FileNode[]>([])
  const [filesError, setFilesError] = useState('')
  const [path, setPath] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [jump, setJump] = useState<{ line: number; nonce: number } | null>(null)
  const pendingJump = useRef<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [tab, setTab] = useState<PanelTab>(params.tab === 'questions' ? 'questions' : 'criteria')
  const questionsOn = useStore((s) => !!s.settings?.aiQuestionsEnabled)
  const questionsMin = useStore((s) => s.settings?.aiQuestionsMinPercent ?? 60)
  const [generating, setGenerating] = useState(false)
  const [search, setSearch] = useState('')
  const [hits, setHits] = useState<{ file: string; line: number; text: string }[] | null>(null)
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set())
  const [drawerMode, setDrawerMode] = useState(window.innerWidth < 1240)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [note, setNote] = useState('')
  const [showAiMarks, setShowAiMarks] = useState(true)
  const viewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    const onResize = (): void => setDrawerMode(window.innerWidth < 1240)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const loadStudents = useCallback(() => {
    if (!a) return
    void call<StudentRow[]>('students:list', a.id).then((list) => {
      const valid = list.filter((s) => s.scanStatus === 'valid')
      setStudents(valid)
      setStudentId((cur) => (cur && valid.some((s) => s.id === cur) ? cur : (valid[0]?.id ?? null)))
    })
  }, [a?.id])
  useEffect(loadStudents, [loadStudents])
  useEffect(() => {
    if (params.studentId) setStudentId(params.studentId)
    if (params.tab === 'questions') setTab('questions')
  }, [params])
  useEffect(() => {
    if (!questionsOn && tab === 'questions') setTab('criteria')
  }, [questionsOn, tab])

  const loadResult = useCallback(async () => {
    if (!studentId) return
    const r = await call<StudentResult>('result:get', studentId)
    setResult(r)
    setNote(r.teacherNote)
    return r
  }, [studentId])

  // Đổi sinh viên → tải kết quả + danh sách file
  useEffect(() => {
    if (!studentId) return
    setResult(null)
    setFiles([])
    setPath(null)
    setContent('')
    setHits(null)
    setEditing(false)
    setFilesError('')
    void (async () => {
      const r = await loadResult()
      try {
        const fl = await call<FileNode[]>('review:files', studentId)
        setFiles(fl)
        setPath(pickInitialFile(fl, r?.issues ?? []))
      } catch (e: any) {
        setFilesError(e.message)
      }
    })()
  }, [studentId, loadResult])

  useEffect(
    () =>
      on<{ assignmentId: number }>('students:changed', (p) => {
        if (p.assignmentId !== a?.id) return
        loadStudents()
        void loadResult()
      }),
    [a?.id, loadStudents, loadResult]
  )

  useEffect(() => {
    if (!studentId || !path) return
    let alive = true
    void call<string>('review:read', studentId, path)
      .then((c) => {
        if (!alive) return
        setContent(c)
        if (pendingJump.current) {
          setJump({ line: pendingJump.current, nonce: Date.now() })
          pendingJump.current = null
        }
      })
      .catch((e) => toast(e.message, 'error'))
    return () => {
      alive = false
    }
  }, [studentId, path, toast])

  const idx = students.findIndex((s) => s.id === studentId)
  const student = students[idx]
  const goto = (d: number): void => {
    const next = students[idx + d]
    if (next) setStudentId(next.id)
  }
  const openLoc = (file?: string, line?: number): void => {
    if (!file) return
    if (file === path) {
      if (line) setJump({ line, nonce: Date.now() })
    } else {
      pendingJump.current = line ?? null
      setPath(file)
    }
    if (drawerMode) setDrawerOpen(false)
  }
  const regrade = async (): Promise<void> => {
    if (!a || !studentId) return
    const r = await attempt(() => call('queue:start', a.id, [studentId]))
    if (r) toast('Đã đưa bài vào hàng đợi chấm lại (điểm giáo viên đã sửa được giữ nguyên)', 'info')
  }
  const accept = async (): Promise<void> => {
    if (!studentId || !result) return
    if (!['completed', 'reviewed'].includes(result.status)) return toast('Bài chưa chấm xong', 'warning')
    await attempt(() => call('result:review', studentId, true))
    goto(1)
  }

  // Phím tắt
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'F5') {
        e.preventDefault()
        void regrade()
      } else if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault()
        void accept()
      } else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        goto(-1)
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault()
        goto(1)
      } else if (e.ctrlKey && e.key.toLowerCase() === 'f') {
        const target = e.target as HTMLElement
        if (!target.closest('.cm-editor')) {
          e.preventDefault()
          openSearch(viewRef.current)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const marks = useMemo<LineMark[]>(() => {
    if (!result || !path) return []
    const out: LineMark[] = []
    for (const i of result.issues) if (i.file === path && i.line) out.push({ line: i.line, kind: i.severity })
    for (const c of result.criteria)
      for (const ev of c.evidence)
        if (ev.file === path) for (let l = ev.lineStart; l <= Math.min(ev.lineEnd, ev.lineStart + 200); l++) out.push({ line: l, kind: 'evidence' })
    if (showAiMarks)
      for (const g of result.aiSignal?.estimate?.segments ?? [])
        if (g.file === path && g.origin === 'ai') for (let l = g.lineStart; l <= g.lineEnd; l++) out.push({ line: l, kind: 'ai' })
    return out
  }, [result, path, showAiMarks])

  const issueCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of result?.issues ?? []) if (i.file) m.set(i.file, (m.get(i.file) ?? 0) + 1)
    return m
  }, [result])

  if (!a) return <NoAssignment />
  if (!students.length) {
    return (
      <div className="page">
        <Empty title="Chưa có bài nộp hợp lệ">
          <button className="btn" onClick={() => go('assignments', { tab: 'submissions' })}>
            Chọn folder bài nộp
          </button>
        </Empty>
      </div>
    )
  }

  const tree = buildTree(files)
  const renderTree = (nodes: TreeNode[], depth: number): JSX.Element[] =>
    nodes.flatMap((n) => {
      const pad = 8 + depth * 14
      if (n.dir) {
        const closed = collapsedDirs.has(n.path)
        return [
          <div
            key={'d:' + n.path}
            className="tree-item"
            style={{ paddingLeft: pad }}
            onClick={() => {
              const s = new Set(collapsedDirs)
              if (closed) s.delete(n.path)
              else s.add(n.path)
              setCollapsedDirs(s)
            }}
          >
            {closed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            {closed ? <Folder size={14} /> : <FolderOpen size={14} />}
            <span className="truncate">{n.name}</span>
          </div>,
          ...(closed ? [] : renderTree(n.children, depth + 1))
        ]
      }
      const ic = issueCount.get(n.path)
      return [
        <div key={'f:' + n.path} className={cls('tree-item', path === n.path && 'active')} style={{ paddingLeft: pad + 13 }} onClick={() => openLoc(n.path)} title={n.path}>
          {/\.(java|kt|c|cpp|h|hpp|js|jsx|ts|tsx)$/i.test(n.name) ? <FileCode2 size={14} /> : <File size={14} />}
          <span className="truncate">{n.name}</span>
          {ic ? <span className="issue-count">{ic}</span> : null}
        </div>
      ]
    })

  const total = result?.total ?? null
  const resultPanel = (
    <ResultPanel
      result={result}
      editing={editing}
      tab={tab}
      setTab={setTab}
      note={note}
      setNote={setNote}
      passThreshold={a.passThreshold}
      onOpenLoc={openLoc}
      onOverride={async (cid, v) => {
        if (!studentId) return
        const r = await attempt(() => call<StudentResult>('result:override', studentId, cid, v))
        if (r) setResult(r)
      }}
      onSaveNote={async () => studentId && (await attempt(() => call('result:note', studentId, note), 'Đã lưu ghi chú'))}
      penaltyMode={a.aiPolicy?.penaltyMode ?? 'off'}
      showAiMarks={showAiMarks}
      setShowAiMarks={setShowAiMarks}
      onPenalty={async (applied) => {
        if (!studentId) return
        const r = await attempt(() => call<StudentResult>('result:aiPenalty', studentId, applied))
        if (r) setResult(r)
      }}
      questionsOn={questionsOn}
      questionsMin={questionsMin}
      generating={generating}
      onGenerate={async () => {
        if (!studentId || generating) return
        const sid = studentId
        setGenerating(true)
        const r = await attempt(() => call<StudentResult>('result:aiQuestions', sid), 'Đã tạo câu hỏi vấn đáp')
        setGenerating(false)
        if (r && r.studentId === sid) setResult((cur) => (cur && cur.studentId === sid ? r : cur))
      }}
    />
  )

  return (
    <div className="page full">
      <div className="review">
        <div className="review-header">
          <button className="btn btn-ghost btn-icon btn-sm" disabled={idx <= 0} onClick={() => goto(-1)} title="Sinh viên trước (Alt+←)">
            <ChevronLeft size={16} />
          </button>
          <select className="select input-sm" style={{ width: 280 }} value={studentId ?? ''} onChange={(e) => setStudentId(Number(e.target.value))}>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.mssv}
              </option>
            ))}
          </select>
          <button className="btn btn-ghost btn-icon btn-sm" disabled={idx >= students.length - 1} onClick={() => goto(1)} title="Sinh viên sau (Alt+→)">
            <ChevronRight size={16} />
          </button>
          {result && <StatusBadge status={result.status} />}
          {result?.backend && <span className={'tag tag-' + (result.backend === 'Cloud' ? 'Cloud' : 'Local')}>{result.backend}</span>}
          <AiLevelBadge level={student?.aiPercent != null || student?.aiLevel !== 'low' ? (student?.aiLevel ?? null) : null} percent={student?.aiPercent} />
          {result?.aiPenalty?.applied && (
            <span className="badge" title={result.aiPenalty.note}>
              <span className="dot" style={{ background: 'var(--error)' }} />
              Trừ {fmtScore(result.aiPenalty.deduct)}đ (AI)
            </span>
          )}
          <div className="grow" />
          <span className="meta">Tổng:</span>
          <span className="section-title score-pill" style={{ color: total !== null ? (total >= a.passThreshold ? 'var(--success)' : 'var(--error)') : undefined }}>
            {fmtScore(total)}/10
          </span>
          <button className={cls('btn btn-sm', editing && 'btn-primary')} onClick={() => (setEditing(!editing), setTab('criteria'), drawerMode && setDrawerOpen(true))}>
            <Pencil size={13} /> {t('Sửa điểm')}
          </button>
          <button className="btn btn-sm" onClick={regrade} title="Chấm / chấm lại (F5)">
            <RotateCcw size={13} /> F5
          </button>
          <button
            className={cls('btn btn-sm', result?.reviewed ? '' : 'btn-primary')}
            onClick={() => (result?.reviewed ? void attempt(() => call('result:review', studentId, false)) : void accept())}
            title="Chấp nhận điểm, sang sinh viên tiếp (Ctrl+Enter)"
          >
            <CheckCircle2 size={13} /> {result?.reviewed ? t('Đã duyệt') : t('Duyệt')}
          </button>
          {drawerMode && (
            <button className="btn btn-sm btn-icon" onClick={() => setDrawerOpen(!drawerOpen)} title="Kết quả chấm">
              <PanelRightOpen size={14} />
            </button>
          )}
        </div>
        <div className={cls('review-body', drawerMode && 'drawer-mode')} style={{ position: 'relative' }}>
          <div className="panel">
            <div className="panel-head" style={{ padding: '0 6px' }}>
              <div className="relative grow">
                <Search size={12} style={{ position: 'absolute', left: 7, top: 7 }} className="muted" />
                <input
                  className="input input-sm"
                  style={{ paddingLeft: 24 }}
                  placeholder="Tìm trong project"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && studentId) setHits(await call('review:search', studentId, search))
                    if (e.key === 'Escape') (setHits(null), setSearch(''))
                  }}
                />
              </div>
              {hits && (
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => (setHits(null), setSearch(''))}>
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="panel-body" style={{ paddingBottom: 8 }}>
              {filesError && <div className="callout error" style={{ margin: 8 }}>{filesError}</div>}
              {hits ? (
                hits.length ? (
                  hits.map((h, i) => (
                    <div key={i} className="issue-row" style={{ flexDirection: 'column', gap: 2 }} onClick={() => openLoc(h.file, h.line)}>
                      <span className="issue-loc">
                        {h.file}:{h.line}
                      </span>
                      <span className="mono truncate" style={{ fontSize: 11.5 }}>
                        {h.text}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="meta" style={{ padding: 10 }}>
                    Không tìm thấy
                  </div>
                )
              ) : (
                renderTree(tree, 0)
              )}
            </div>
          </div>
          <div className="panel">
            <div className="panel-head">
              <FileCode2 size={13} />
              <span className="truncate mono" style={{ fontSize: 11.5 }}>
                {path ?? '—'}
              </span>
              <div className="grow" />
              <span className="kbd">Ctrl+F</span>
              <span className="meta">read-only</span>
            </div>
            <div className="panel-body" style={{ overflow: 'hidden' }}>
              {path ? (
                <CodeViewer path={path} content={content} marks={marks} jump={jump} onReady={(v) => (viewRef.current = v)} />
              ) : (
                <Empty title={files.length ? 'Chọn file để xem' : 'Đang tải file...'} />
              )}
            </div>
          </div>
          {!drawerMode && <div className="panel result-panel">{resultPanel}</div>}
          {drawerMode && drawerOpen && <div className="panel result-panel result-drawer">{resultPanel}</div>}
        </div>
      </div>
    </div>
  )
}

function ResultPanel(props: {
  result: StudentResult | null
  editing: boolean
  tab: PanelTab
  setTab: (t: PanelTab) => void
  note: string
  setNote: (s: string) => void
  passThreshold: number
  onOpenLoc: (file?: string, line?: number) => void
  onOverride: (criterionId: string, v: number | null) => Promise<void>
  onSaveNote: () => Promise<unknown>
  penaltyMode: AiPenaltyMode
  showAiMarks: boolean
  setShowAiMarks: (v: boolean) => void
  onPenalty: (applied: boolean | null) => Promise<void>
  questionsOn: boolean
  questionsMin: number
  generating: boolean
  onGenerate: () => Promise<void>
}): JSX.Element {
  const t = useT()
  const profiles = useStore((s) => s.profiles)
  const r = props.result
  if (!r) return <Empty title={t('Đang tải...')} />
  const sevIcon = (s: Issue['severity']): JSX.Element =>
    s === 'error' ? <AlertCircle size={14} className="error" /> : s === 'warning' ? <AlertTriangle size={14} className="warning" /> : <Info size={14} style={{ color: 'var(--info)' }} />
  return (
    <>
      <div className="tabs" style={{ margin: 0, padding: '0 6px' }}>
        {(
          [
            ['criteria', t('Tiêu chí')],
            ['issues', `Issues (${r.issues.length})`],
            ['auto', 'Tự động'],
            ['ai', 'Nguồn gốc code'],
            ...(props.questionsOn ? [['questions', `Câu hỏi${r.aiQuestions?.items.length ? ` (${r.aiQuestions.items.length})` : ''}`]] : [])
          ] as [PanelTab, string][]
        ).map(([k, label]) => (
          <button key={k} className={cls('tab', props.tab === k && 'active')} style={{ height: 34, padding: '0 9px', fontSize: 12.5 }} onClick={() => props.setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      <div className="panel-body">
        {r.status === 'failed' && (
          <div className="callout error" style={{ margin: 10 }}>
            <AlertCircle size={16} />
            <span style={{ whiteSpace: 'pre-wrap' }}>Chấm lỗi: {r.error}</span>
          </div>
        )}
        {r.warnings.length > 0 && props.tab === 'criteria' && (
          <div className="callout warning" style={{ margin: 10 }}>
            <AlertTriangle size={16} />
            <div className="col gap-4" style={{ fontSize: 12 }}>
              {r.warnings.slice(0, 5).map((w, i) => (
                <span key={i}>{w}</span>
              ))}
              {r.warnings.length > 5 && <span>… và {r.warnings.length - 5} cảnh báo khác</span>}
            </div>
          </div>
        )}
        {props.tab === 'criteria' && (
          <>
            {r.criteria.length === 0 && <div className="meta" style={{ padding: 12 }}>Chưa chấm. Nhấn F5 để chấm bài này.</div>}
            {r.criteria.map((c) => {
              const overridden = c.id in r.overrides
              const v = overridden ? r.overrides[c.id] : c.score
              return (
                <div key={c.id} className="crit-row">
                  <div className="crit-top">
                    <span className="grow truncate" style={{ fontWeight: 500 }} title={c.name}>
                      {c.name}
                    </span>
                    {props.editing ? (
                      <>
                        <input
                          key={String(v)}
                          className="input input-sm override-input"
                          type="number"
                          step={0.25}
                          min={0}
                          max={c.max}
                          defaultValue={v ?? ''}
                          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                          onBlur={(e) => {
                            const raw = e.target.value.trim()
                            if (raw === '' && !overridden) return
                            const num = raw === '' ? null : Number(raw)
                            if (num === v) return
                            void props.onOverride(c.id, num)
                          }}
                        />
                        <span className="meta">/ {c.max}</span>
                        {overridden && (
                          <button className="btn btn-ghost btn-icon btn-sm" title="Bỏ điểm đã sửa (mở khoá)" onClick={() => void props.onOverride(c.id, null)}>
                            <Unlock size={12} />
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="score-pill mono">
                        {fmtScore(v)} / {c.max}
                      </span>
                    )}
                    {overridden && !props.editing && <Lock size={12} className="locked" aria-label="Giáo viên đã sửa — chấm lại không ghi đè" />}
                  </div>
                  <div className="row gap-4 mt-8">
                    <span className={'tag ' + (c.source === 'ai' ? 'tag-AI' : c.source === 'compile' ? 'tag-Compile' : c.source === 'test' ? 'tag-Test' : 'tag-Static')}>
                      {sourceLabel(c.source, r.auto.report ? 'report' : 'code')}
                    </span>
                    {overridden && <span className="meta locked">Giáo viên đã sửa (AI: {fmtScore(c.score)})</span>}
                  </div>
                  {c.reason && <div className="crit-reason">{c.reason}</div>}
                  {c.evidence.length > 0 && (
                    <div className="row wrap gap-4 mt-8">
                      {c.evidence.slice(0, 4).map((ev, i) => (
                        <a key={i} className="issue-loc" onClick={() => props.onOpenLoc(ev.file, ev.lineStart)}>
                          {ev.file.split('/').pop()}:{ev.lineStart}
                          {ev.lineEnd > ev.lineStart ? `–${ev.lineEnd}` : ''}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            {r.aiPenalty && r.aiPenalty.deduct > 0 && (
              <div className="crit-row">
                <div className="crit-top">
                  <span className="grow truncate" style={{ fontWeight: 500 }}>
                    Trừ điểm do dùng AI
                  </span>
                  <span className="score-pill mono" style={{ color: r.aiPenalty.applied ? 'var(--error)' : 'var(--text-2)', textDecoration: r.aiPenalty.applied ? undefined : 'line-through' }}>
                    −{fmtScore(r.aiPenalty.deduct)}
                  </span>
                </div>
                <div className="crit-reason">
                  {r.aiPenalty.note}
                  {!r.aiPenalty.applied && ' — chưa trừ vào tổng.'}{' '}
                  <a onClick={() => props.setTab('ai')}>Xem chi tiết</a>
                </div>
              </div>
            )}
            {r.summary && (
              <div className="crit-row">
                <div className="row gap-4 mb-8">
                  <Sparkles size={13} className="ai-color" />
                  <span className="label">Nhận xét chung (AI)</span>
                </div>
                <div className="crit-reason" style={{ color: 'var(--text)' }}>
                  {r.summary}
                </div>
              </div>
            )}
            <div className="crit-row">
              <div className="label mb-8">{t('Ghi chú giáo viên')}</div>
              <textarea className="textarea" rows={3} value={props.note} onChange={(e) => props.setNote(e.target.value)} onBlur={() => void props.onSaveNote()} />
            </div>
            {(r.model || r.finishedAt) && (
              <div className="meta" style={{ padding: '8px 12px' }}>
                {r.backend} {r.model && `· ${r.model}`} · {fmtTime(r.finishedAt)}
              </div>
            )}
          </>
        )}
        {props.tab === 'issues' && (
          <>
            {r.issues.length === 0 && <div className="meta" style={{ padding: 12 }}>Không có issue.</div>}
            {r.issues.map((i, k) => (
              <div key={k} className="issue-row" onClick={() => props.onOpenLoc(i.file, i.line)}>
                {sevIcon(i.severity)}
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row gap-4 wrap">
                    <span className={'tag tag-' + i.source}>[{i.source}]</span>
                    {i.file && (
                      <span className="issue-loc truncate">
                        {i.file.split('/').pop()}
                        {i.line ? ':' + i.line : ''}
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop: 3, userSelect: 'text' }}>{i.message}</div>
                  {i.criterionId && <div className="meta">→ ảnh hưởng tiêu chí: {r.criteria.find((c) => c.id === i.criterionId)?.name ?? i.criterionId}</div>}
                </div>
              </div>
            ))}
          </>
        )}
        {props.tab === 'auto' && (
          <div className="col gap-12" style={{ padding: 12 }}>
            {r.auto.stats && (
              <div className="meta">
                {r.auto.stats.files} file code · {r.auto.stats.lines} dòng · {r.auto.stats.commentLines} dòng comment
                {r.detectedProfile && ` · nhận diện: ${profiles.find((p) => p.id === r.detectedProfile)?.name ?? r.detectedProfile}`}
              </div>
            )}
            {r.auto.compile && (
              <div>
                <div className="row gap-4 mb-8">
                  <span className="tag tag-Compile">[Compile]</span>
                  {!r.auto.compile.attempted ? (
                    <span className="meta">Không thực hiện</span>
                  ) : r.auto.compile.ok ? (
                    <span className="success">Thành công</span>
                  ) : (
                    <span className="error">Thất bại</span>
                  )}
                </div>
                {r.auto.compile.skippedReason && <div className="meta">{r.auto.compile.skippedReason}</div>}
                {r.auto.compile.command && <div className="mono meta mb-8">$ {r.auto.compile.command}</div>}
                {r.auto.compile.output && <pre className="output">{r.auto.compile.output}</pre>}
              </div>
            )}
            {r.auto.tests && r.auto.tests.length > 0 && (
              <div className="col gap-8">
                <div className="row gap-4">
                  <span className="tag tag-Test">[Test]</span>
                  <span>
                    Đạt {r.auto.tests.filter((x) => x.passed).length}/{r.auto.tests.length}
                  </span>
                </div>
                {r.auto.tests.map((tc) => (
                  <details key={tc.id} className="choice-card" style={{ padding: 10 }}>
                    <summary className="row" style={{ cursor: 'pointer' }}>
                      {tc.passed ? <CheckCircle2 size={14} className="success" /> : <AlertCircle size={14} className="error" />}
                      <span>{tc.name}</span>
                      <span className="meta">{tc.timeMs} ms</span>
                      {!tc.passed && <span className="error" style={{ fontSize: 12 }}>{tc.error}</span>}
                    </summary>
                    <div className="grid-2 mt-8" style={{ gap: 8 }}>
                      <div>
                        <div className="label">Output</div>
                        <pre className="output">{tc.stdout || '(trống)'}</pre>
                      </div>
                      <div>
                        <div className="label">Mong đợi</div>
                        <pre className="output">{tc.expected}</pre>
                      </div>
                    </div>
                    {tc.stderr && <pre className="output mt-8">{tc.stderr}</pre>}
                  </details>
                ))}
              </div>
            )}
            {r.auto.report && (
              <div className="col gap-8">
                <div className="row gap-4">
                  <span className="tag tag-Static">[Kiểm tra hình thức]</span>
                  <span>
                    {r.auto.report.words} từ · Tài liệu tham khảo: {r.auto.report.hasReferences ? 'có' : 'không tìm thấy'}
                  </span>
                </div>
                {r.auto.report.missingSections.length > 0 && <div className="warning">Thiếu mục: {r.auto.report.missingSections.join(', ')}</div>}
                {r.auto.report.docs.map((d) => (
                  <details key={d.file} className="choice-card" style={{ padding: 10 }}>
                    <summary className="row" style={{ cursor: 'pointer' }}>
                      <span className="mono truncate">{d.file}</span>
                      <span className="meta">
                        {d.words} từ{d.pages ? ` · ${d.pages} trang` : ''} · {d.headings.length} tiêu đề · {d.tables} bảng · {d.images} hình
                      </span>
                    </summary>
                    {d.headings.length > 0 ? (
                      <div className="col gap-4 mt-8">
                        {d.headings.map((h, i) => (
                          <a key={i} style={{ paddingLeft: (h.level - 1) * 14 }} onClick={() => props.onOpenLoc(d.file, h.line)}>
                            {h.text}
                          </a>
                        ))}
                      </div>
                    ) : (
                      <div className="meta mt-8">Không có tiêu đề dùng style Heading.</div>
                    )}
                  </details>
                ))}
              </div>
            )}
            {!r.auto.compile && !r.auto.tests && !r.auto.report && <div className="meta">Không có kiểm tra tự động.</div>}
          </div>
        )}
        {props.tab === 'ai' && (
          <OriginTab
            r={r}
            penaltyMode={props.penaltyMode}
            showAiMarks={props.showAiMarks}
            setShowAiMarks={props.setShowAiMarks}
            onOpenLoc={props.onOpenLoc}
            onPenalty={props.onPenalty}
          />
        )}
        {props.tab === 'questions' && props.questionsOn && (
          <QuestionsTab
            q={r.aiQuestions}
            aiPercent={r.aiSignal?.estimate?.aiPercent ?? null}
            minPercent={props.questionsMin}
            generating={props.generating}
            onGenerate={props.onGenerate}
            onOpenLoc={props.onOpenLoc}
          />
        )}
      </div>
    </>
  )
}

type PanelTab = 'criteria' | 'issues' | 'auto' | 'ai' | 'questions'

function QuestionsTab(props: {
  q: AiQuestions | null
  aiPercent: number | null
  minPercent: number
  generating: boolean
  onGenerate: () => Promise<void>
  onOpenLoc: (file?: string, line?: number) => void
}): JSX.Element {
  const { q } = props
  const toast = useStore((s) => s.toast)
  const items = q?.items ?? []
  const copyAll = async (): Promise<void> => {
    const text = items
      .map((x, i) => `${i + 1}. ${x.question}${x.file ? `\n   (${x.file}:${x.lineStart}–${x.lineEnd})` : ''}\n   Gợi ý đáp án: ${x.expected}`)
      .join('\n\n')
    try {
      await navigator.clipboard.writeText(text)
      toast('Đã sao chép câu hỏi', 'success')
    } catch {
      toast('Không sao chép được', 'error')
    }
  }
  return (
    <div className="col gap-12" style={{ padding: 12 }}>
      <div className="callout ai">
        <MessageCircleQuestion size={16} />
        <span>
          Câu hỏi AI soạn sẵn, bám vào các đoạn nghi do AI viết — dùng để hỏi trực tiếp, kiểm tra sinh viên có hiểu code đã nộp. Không phải bằng chứng; hãy đánh
          giá qua câu trả lời của sinh viên.
        </span>
      </div>
      {props.aiPercent === null ? (
        <div className="meta">Chưa có ước lượng % code AI — chấm lại bài này trước.</div>
      ) : (
        <>
          {!items.length && !q?.error && (
            <div className="meta">
              {props.aiPercent >= props.minPercent
                ? 'Chưa có câu hỏi (bài chấm trước khi bật tính năng).'
                : `Bài có ~${props.aiPercent}% code AI, dưới ngưỡng ${props.minPercent}% nên không tự tạo câu hỏi. Bạn vẫn có thể tạo thủ công.`}
            </div>
          )}
          {q?.error && (
            <div className="callout error">
              <AlertCircle size={16} />
              <span>Tạo câu hỏi thất bại: {q.error}</span>
            </div>
          )}
          <div className="row gap-4">
            <button className="btn btn-sm btn-primary" disabled={props.generating} onClick={() => void props.onGenerate()}>
              {props.generating ? <span className="spinner" style={{ borderTopColor: 'white' }} /> : <Sparkles size={13} />}
              {props.generating ? 'Đang tạo…' : items.length || q?.error ? 'Tạo lại' : 'Tạo câu hỏi'}
            </button>
            {items.length > 0 && (
              <button className="btn btn-sm" onClick={() => void copyAll()}>
                <Copy size={13} /> Sao chép
              </button>
            )}
          </div>
          {items.map((x, i) => (
            <div key={i} className="card col gap-4" style={{ padding: 10 }}>
              <div>
                <b>{i + 1}.</b> {x.question}
              </div>
              {x.file && (
                <a className="issue-loc" onClick={() => props.onOpenLoc(x.file, x.lineStart)}>
                  {x.file.split('/').pop()}:{x.lineStart}–{x.lineEnd}
                </a>
              )}
              {x.purpose && <div className="meta">Kiểm tra: {x.purpose}</div>}
              {x.expected && (
                <details>
                  <summary className="meta" style={{ cursor: 'pointer' }}>
                    Gợi ý đáp án
                  </summary>
                  <div style={{ marginTop: 4 }}>{x.expected}</div>
                </details>
              )}
            </div>
          ))}
          {q && items.length > 0 && (
            <div className="meta">
              Tạo lúc {fmtTime(q.generatedAt)}
              {q.model && ` · ${q.model}`} · khi bài ~{q.aiPercent}% code AI
            </div>
          )}
        </>
      )}
    </div>
  )
}

function OriginTab(props: {
  r: StudentResult
  penaltyMode: AiPenaltyMode
  showAiMarks: boolean
  setShowAiMarks: (v: boolean) => void
  onOpenLoc: (file?: string, line?: number) => void
  onPenalty: (applied: boolean | null) => Promise<void>
}): JSX.Element {
  const t = useT()
  const { r } = props
  const e = r.aiSignal?.estimate
  const [showStudent, setShowStudent] = useState(false)
  const pen = r.aiPenalty
  const aiSegs = (e?.segments ?? []).filter((g) => g.origin === 'ai').sort((x, y) => y.aiProb - x.aiProb)
  const svSegs = (e?.segments ?? []).filter((g) => g.origin === 'student').sort((x, y) => x.aiProb - y.aiProb)
  const segRow = (g: NonNullable<typeof e>['segments'][number], i: number): JSX.Element => (
    <div key={i} className="seg-row" onClick={() => props.onOpenLoc(g.file, g.lineStart)}>
      <div className="row gap-4">
        <span className="issue-loc truncate grow">
          {g.file.split('/').pop()}:{g.lineStart}–{g.lineEnd}
        </span>
        <span className="mono" style={{ fontSize: 12, color: g.origin === 'ai' ? 'var(--ai)' : 'var(--success)' }}>
          AI {Math.round(g.aiProb * 100)}%
        </span>
      </div>
      {g.reasons.length > 0 && <div className="seg-reasons">{g.reasons.join(' · ')}</div>}
    </div>
  )
  return (
    <div className="col gap-12" style={{ padding: 12 }}>
      <div className="callout ai">
        <Sparkles size={16} />
        <span>
          {t('Chỉ là tín hiệu tham khảo, không phải kết luận')}. % được ước lượng từ phong cách từng đoạn code (comment kiểu chatbot, format, cách đặt tên, cú pháp vượt
          mức môn học, dấu vết gõ tay…) kết hợp nhận định của AI chấm bài; code khung và file IDE sinh sẵn không tính.
        </span>
      </div>
      {!e ? (
        <div className="meta">Chưa có ước lượng — nhấn F5 để chấm lại bài này.</div>
      ) : (
        <>
          <div className="col gap-8">
            <div className="row" style={{ alignItems: 'baseline', gap: 16 }}>
              <div>
                <div className="label">SV tự viết</div>
                <div className="section-title" style={{ color: 'var(--success)' }}>
                  ~{e.studentPercent}%
                </div>
              </div>
              <div>
                <div className="label">Do AI viết</div>
                <div className="section-title" style={{ color: 'var(--ai)' }}>
                  ~{e.aiPercent}%
                </div>
              </div>
              <div className="grow" />
              <AiLevelBadge level={r.aiSignal!.level} />
            </div>
            <OriginBar
              student={Math.round((e.studentPercent * (100 - e.starterPercent)) / 100)}
              ai={Math.round((e.aiPercent * (100 - e.starterPercent)) / 100)}
              starter={e.starterPercent}
            />
            <div className="origin-legend">
              <span>
                <span className="dot origin-student" />
                SV tự viết
              </span>
              <span>
                <span className="dot origin-ai" />
                AI
              </span>
              <span>
                <span className="dot origin-starter" />
                Code khung / sinh sẵn {e.starterPercent}%
              </span>
            </div>
            <div className="meta">
              Độ tin cậy: <b>{CONFIDENCE_LABEL[e.confidence]}</b> · {e.authoredLines}/{e.totalLines} dòng tự làm · phong cách {e.heuristicPercent}%
              {e.llmPercent !== null && ` · AI chấm bài ${e.llmPercent}%`}
            </div>
          </div>

          {props.penaltyMode !== 'off' && pen && (
            <div className={cls('penalty-card', pen.applied && 'applied')}>
              <div className="row gap-4">
                <b className="grow">{pen.deduct > 0 ? (pen.applied ? `Đang trừ ${fmtScore(pen.deduct)} điểm` : `Đề xuất trừ ${fmtScore(pen.deduct)} điểm`) : 'Không trừ điểm'}</b>
                {pen.decidedBy === 'teacher' && <span className="meta">Giáo viên quyết định</span>}
              </div>
              <div className="meta mt-8">{pen.note}</div>
              {pen.deduct > 0 && (
                <div className="row gap-4 mt-8">
                  {pen.applied ? (
                    <button className="btn btn-sm" onClick={() => void props.onPenalty(false)}>
                      Bỏ trừ
                    </button>
                  ) : (
                    <button className="btn btn-sm btn-primary" onClick={() => void props.onPenalty(true)}>
                      Áp trừ {fmtScore(pen.deduct)}đ
                    </button>
                  )}
                  {pen.decidedBy === 'teacher' && (
                    <button className="btn btn-sm btn-ghost" onClick={() => void props.onPenalty(null)}>
                      Theo chính sách
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <label className="check">
            <input type="checkbox" checked={props.showAiMarks} onChange={(ev) => props.setShowAiMarks(ev.target.checked)} />
            Tô vùng nghi do AI viết trong editor
          </label>

          {e.files.length > 1 && (
            <div className="col gap-4">
              <div className="label">Theo file</div>
              {e.files.slice(0, 30).map((f) => (
                <div key={f.file} className="seg-row" onClick={() => props.onOpenLoc(f.file, 1)}>
                  <div className="row gap-4">
                    <span className="issue-loc truncate grow" title={f.file}>
                      {f.file.split('/').pop()}
                    </span>
                    <span className="meta">{f.lines} dòng</span>
                    <span className="mono" style={{ fontSize: 12, width: 64, textAlign: 'right', color: f.starterLines >= f.lines ? 'var(--pending)' : 'var(--ai)' }}>
                      {f.starterLines >= f.lines ? 'khung' : `AI ${f.aiPercent}%`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="col">
            <div className="label">Đoạn nghi do AI viết ({aiSegs.length})</div>
            {aiSegs.length === 0 && <div className="meta">Không có đoạn nào.</div>}
            {aiSegs.slice(0, 60).map(segRow)}
          </div>
          {svSegs.length > 0 && (
            <div className="col">
              <a className="label" onClick={() => setShowStudent(!showStudent)}>
                {showStudent ? '▾' : '▸'} Đoạn SV tự viết ({svSegs.length})
              </a>
              {showStudent && svSegs.slice(0, 60).map(segRow)}
            </div>
          )}
        </>
      )}
      {r.aiSignal && r.aiSignal.signals.length > 0 && (
        <div className="col">
          <div className="label">Dấu hiệu AI chấm bài ghi nhận</div>
          {r.aiSignal.signals.map((s, i) => (
            <div key={i} className="issue-row" style={{ padding: '6px 0' }} onClick={() => props.onOpenLoc(s.file, s.line)}>
              <Sparkles size={13} className="ai-color" />
              <div>
                {s.file && (
                  <div className="issue-loc">
                    {s.file}
                    {s.line ? ':' + s.line : ''}
                  </div>
                )}
                <div>{s.description}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
