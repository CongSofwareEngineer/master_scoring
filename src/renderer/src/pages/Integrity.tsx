import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, MessageCircleQuestion, Play, ShieldAlert, Sparkles, Users } from 'lucide-react'
import { CONFIDENCE_LABEL } from '@shared/constants'
import type { FileNode, IntegrityOverview, IntegrityPair, SimilarityStats } from '@shared/types'
import { call, on } from '../lib/api'
import { cls, fmtTime } from '../lib/format'
import { useT } from '../lib/i18n'
import { attempt, useCurrentAssignment, useStore } from '../lib/store'
import { AssignmentFilter } from '../components/AssignmentFilter'
import { CodeViewer } from '../components/CodeViewer'
import { AiLevelBadge, Empty, Modal, OriginBar, Progress } from '../components/ui'
import { NoAssignment } from './Dashboard'

function simColor(v: number): string {
  return v >= 85 ? 'var(--error)' : v >= 70 ? 'var(--warning)' : 'var(--info)'
}

export function IntegrityPage(): JSX.Element {
  const t = useT()
  const a = useCurrentAssignment()
  const params = useStore((s) => s.params)
  const go = useStore((s) => s.go)
  const threshold = useStore((s) => s.settings?.similarityThreshold ?? 70)
  const enabled = useStore((s) => !!s.settings?.similarityEnabled)
  const questionsOn = useStore((s) => !!s.settings?.aiQuestionsEnabled)
  const updateSettings = useStore((s) => s.updateSettings)
  const [tab, setTab] = useState<Tab>(params.tab === 'ai' || params.tab === 'stats' ? params.tab : 'similarity')
  const [data, setData] = useState<IntegrityOverview | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [pair, setPair] = useState<IntegrityPair | null>(null)

  const aid = a?.id
  const load = useCallback(() => {
    if (!aid) return
    void call<IntegrityOverview>('integrity:overview', aid)
      .then((d) => useStore.getState().currentAssignmentId === aid && setData(d))
      .catch(() => {})
  }, [aid, threshold, enabled])
  // Đổi assignment: bỏ số liệu của assignment trước để không hiển thị nhầm
  useEffect(() => {
    setData(null)
    setProgress(null)
    setPair(null)
  }, [aid])
  useEffect(() => {
    load()
    const offs = [
      on<{ assignmentId: number; running: boolean; done?: number; total?: number }>('integrity:status', (p) => {
        if (p.assignmentId !== aid) return
        if (p.running) setProgress({ done: p.done ?? 0, total: p.total ?? 0 })
        else {
          setProgress(null)
          load()
        }
      }),
      on<{ assignmentId: number }>('students:changed', (p) => p.assignmentId === aid && load())
    ]
    return () => offs.forEach((f) => f())
  }, [load])

  if (!a) return <NoAssignment />
  const running = !!progress || data?.running
  const openPair = async (pairId: number): Promise<void> => {
    const p = await attempt(() => call<IntegrityPair>('integrity:pair', pairId))
    if (p) setPair(p)
  }
  const enable = (): Promise<unknown> =>
    attempt(async () => {
      await updateSettings({ similarityEnabled: true })
      await call('integrity:run', a.id)
    }, 'Đã bật so sánh trùng lặp')

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">{t('Liêm chính')}</div>
          <div className="meta mt-8">
            {enabled ? 'Độ trùng lặp giữa sinh viên (fingerprint winnowing, loại trừ code khung) và tín hiệu dùng AI' : 'Tín hiệu dùng AI · so sánh trùng lặp đang tắt'}
            {enabled && data?.lastRun && ` · lần chạy gần nhất ${fmtTime(data.lastRun)}`}
          </div>
        </div>
        {enabled && (
          <div className="actions">
            <button className="btn btn-primary" disabled={running} onClick={() => void attempt(() => call('integrity:run', a.id))}>
              {running ? <span className="spinner" style={{ borderTopColor: 'white' }} /> : <Play size={14} />} Chạy so sánh
            </button>
          </div>
        )}
      </div>
      <AssignmentFilter assignment={a} />
      {progress && (
        <div className="card mb-12">
          <div className="meta mb-8">
            Đang so sánh {progress.done}/{progress.total} cặp…
          </div>
          <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} />
        </div>
      )}
      <div className="tabs">
        <button className={cls('tab', tab === 'similarity' && 'active')} onClick={() => setTab('similarity')}>
          <ShieldAlert size={14} /> Trùng lặp{enabled ? ` (${data?.pairs.length ?? 0})` : ''}
        </button>
        <button className={cls('tab', tab === 'stats' && 'active')} onClick={() => setTab('stats')}>
          <BarChart3 size={14} /> Thống kê trùng lặp{enabled && data ? ` (${data.stats.flagged})` : ''}
        </button>
        <button className={cls('tab', tab === 'ai' && 'active')} onClick={() => setTab('ai')}>
          <Sparkles size={14} /> % code AI ({data?.aiSignals.filter((x) => x.level !== 'low').length ?? 0})
        </button>
      </div>

      {(tab === 'similarity' || tab === 'stats') && !enabled && (
        <div className="card">
          <Empty icon={<ShieldAlert size={32} />} title="So sánh code giống nhau giữa sinh viên đang tắt">
            <div className="meta mb-12">Bật để so sánh mọi cặp bài cùng assignment và thống kê sinh viên có code giống nhau. Có thể tắt lại trong Cài đặt → Chung.</div>
            <div className="row gap-8" style={{ justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={() => void enable()}>
                <Play size={14} /> Bật và chạy so sánh
              </button>
              <button className="btn" onClick={() => go('settings', { tab: 'general' })}>
                Mở Cài đặt
              </button>
            </div>
          </Empty>
        </div>
      )}

      {tab === 'stats' && enabled && data && <StatsTab stats={data.stats} threshold={threshold} onPair={openPair} onStudent={(id) => go('review', { studentId: id })} />}

      {tab === 'similarity' && enabled && (
        <div className="col gap-16">
          <div className="meta">
            Hiển thị cặp giống nhau ≥ {threshold}% (chỉnh ngưỡng trong Settings). Phép so sánh chạy tự động sau khi chấm xong cả lớp.
          </div>
          {data && data.clusters.length > 0 && (
            <div className="card">
              <div className="card-header">
                <span className="card-title">
                  <Users size={14} style={{ verticalAlign: -2 }} /> Nhóm sinh viên giống nhau
                </span>
              </div>
              <div className="col gap-8">
                {data.clusters.map((c, i) => (
                  <div key={i} className="row wrap">
                    <span className="badge" style={{ color: simColor(c.maxSimilarity) }}>
                      {c.members.length} SV · tới {Math.round(c.maxSimilarity)}%
                    </span>
                    {c.members.map((m) => (
                      <a key={m.id} onClick={() => go('review', { studentId: m.id })}>
                        {m.name}
                      </a>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
          {data && data.pairs.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Sinh viên A</th>
                    <th>Sinh viên B</th>
                    <th>Độ giống</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.pairs.map((p) => (
                    <tr key={p.id} className="clickable" onClick={() => void openPair(p.id)}>
                      <td>
                        {p.aName} <span className="meta mono">{p.aMssv}</span>
                      </td>
                      <td>
                        {p.bName} <span className="meta mono">{p.bMssv}</span>
                      </td>
                      <td>
                        <div className="row">
                          <span className="similarity-bar">
                            <div style={{ width: `${p.similarity}%`, background: simColor(p.similarity) }} />
                          </span>
                          <span className="score-pill" style={{ color: simColor(p.similarity) }}>
                            {p.similarity}%
                          </span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-sm">So sánh song song</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card">
              <Empty icon={<ShieldAlert size={32} />} title={running ? 'Đang so sánh...' : 'Không có cặp nào vượt ngưỡng'}>
                <div className="meta">Cần chấm xong bài (để có fingerprint) rồi bấm “Chạy so sánh”.</div>
              </Empty>
            </div>
          )}
        </div>
      )}

      {tab === 'ai' && (
        <div className="col gap-12">
          <div className="callout ai">
            <Sparkles size={16} />
            <span>
              % code AI là <b>ước lượng</b> từ phong cách từng đoạn code + nhận định của AI chấm bài, đã loại code khung. Không có công cụ nào xác định chính xác
              code do AI viết — {t('Chỉ là tín hiệu tham khảo, không phải kết luận').toLowerCase()}. Trừ điểm theo "Chính sách AI" của assignment; giáo viên bỏ
              trừ được trong Code Review.
            </span>
          </div>
          {data && data.aiSignals.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>MSSV</th>
                    <th>Họ tên</th>
                    <th style={{ width: 180 }}>SV tự viết / AI</th>
                    <th className="num">% AI</th>
                    <th>Độ tin cậy</th>
                    <th>Mức</th>
                    <th className="num">Trừ điểm</th>
                    {questionsOn && <th>Câu hỏi</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.aiSignals.map((s) => (
                    <tr key={s.id} className="clickable" onClick={() => go('review', { studentId: s.id })}>
                      <td className="mono">{s.mssv}</td>
                      <td>{s.name}</td>
                      <td>{s.aiPercent !== null && <OriginBar student={s.studentPercent ?? 0} ai={s.aiPercent} starter={0} height={6} />}</td>
                      <td className="num mono">{s.aiPercent !== null ? `${s.aiPercent}%` : '—'}</td>
                      <td className="meta">{s.confidence ? CONFIDENCE_LABEL[s.confidence] : '—'}</td>
                      <td>
                        <AiLevelBadge level={s.level} />
                      </td>
                      <td className="num" style={{ color: s.deduct ? 'var(--error)' : undefined }}>
                        {s.deduct ? `−${s.deduct}` : '—'}
                      </td>
                      {questionsOn && (
                        <td>
                          {s.questions > 0 && (
                            <a
                              className="row gap-4"
                              title="Xem câu hỏi vấn đáp AI đề xuất"
                              onClick={(ev) => (ev.stopPropagation(), go('review', { studentId: s.id, tab: 'questions' }))}
                            >
                              <MessageCircleQuestion size={14} /> {s.questions}
                            </a>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card">
              <Empty title="Chưa có dữ liệu tín hiệu AI" />
            </div>
          )}
        </div>
      )}
      {pair && <CompareModal pair={pair} onClose={() => setPair(null)} />}
    </div>
  )
}

type Tab = 'similarity' | 'stats' | 'ai'

function StatsTab(props: { stats: SimilarityStats; threshold: number; onPair: (pairId: number) => void; onStudent: (id: number) => void }): JSX.Element {
  const { stats, threshold } = props
  const [onlyFlagged, setOnlyFlagged] = useState(true)
  if (!stats.compared) {
    return (
      <div className="card">
        <Empty icon={<BarChart3 size={32} />} title="Chưa có dữ liệu so sánh">
          <div className="meta">Cần chấm xong bài (để có fingerprint) rồi bấm “Chạy so sánh”.</div>
        </Empty>
      </div>
    )
  }
  const rows = onlyFlagged ? stats.students.filter((s) => s.over > 0) : stats.students
  const tile = (label: string, value: string, sub?: string): JSX.Element => (
    <div className="card stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
  const maxBucket = Math.max(1, ...stats.buckets.map((b) => b.count))
  return (
    <div className="col gap-16">
      <div className="grid-4">
        {tile('Bài đã so sánh', String(stats.compared))}
        {tile(`SV có bài giống ≥ ${threshold}%`, String(stats.flagged), stats.flaggedRate !== null ? `${stats.flaggedRate}% số bài đã so sánh` : undefined)}
        {tile('Độ giống cao nhất', stats.maxSimilarity !== null ? `${stats.maxSimilarity}%` : '—')}
        {tile('TB độ giống cao nhất mỗi bài', stats.avgMax !== null ? `${stats.avgMax}%` : '—', 'Bài không có cặp ≥ 30% tính là 0')}
      </div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Phân bố độ giống cao nhất của mỗi bài</span>
          <span className="meta">Mỗi bài tính theo bạn giống nhất</span>
        </div>
        <div className="col gap-8">
          {stats.buckets.map((b) => (
            <div key={b.label} className="row gap-8">
              <span className="mono" style={{ width: 70, fontSize: 12.5 }}>
                {b.label}
              </span>
              <span className="similarity-bar grow" style={{ width: 'auto' }}>
                <div style={{ width: `${(b.count / maxBucket) * 100}%`, background: b.min ? simColor(Math.max(b.min, 30)) : 'var(--pending)' }} />
              </span>
              <span className="meta mono" style={{ width: 90, textAlign: 'right' }}>
                {b.count} bài · {Math.round((b.count / stats.compared) * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Sinh viên có code giống bạn khác</span>
          <label className="check">
            <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
            Chỉ hiện SV vượt ngưỡng {threshold}%
          </label>
        </div>
        {rows.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>MSSV</th>
                  <th>Họ tên</th>
                  <th>Giống nhất với</th>
                  <th>Độ giống</th>
                  <th className="num">Số bạn ≥ {threshold}%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="clickable" title="So sánh song song với bạn giống nhất" onClick={() => s.closest && props.onPair(s.closest.pairId)}>
                    <td className="mono">{s.mssv}</td>
                    <td>
                      <a onClick={(ev) => (ev.stopPropagation(), props.onStudent(s.id))}>{s.name}</a>
                    </td>
                    <td>
                      {s.closest && (
                        <>
                          {s.closest.name} <span className="meta mono">{s.closest.mssv}</span>
                        </>
                      )}
                    </td>
                    <td>
                      <div className="row">
                        <span className="similarity-bar">
                          <div style={{ width: `${s.maxSimilarity}%`, background: simColor(s.maxSimilarity) }} />
                        </span>
                        <span className="score-pill" style={{ color: simColor(s.maxSimilarity) }}>
                          {s.maxSimilarity}%
                        </span>
                      </div>
                    </td>
                    <td className="num">{s.over || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title={onlyFlagged ? `Không có sinh viên nào giống bạn khác ≥ ${threshold}%` : 'Không có cặp nào giống ≥ 30%'} />
        )}
      </div>
    </div>
  )
}

function CompareModal({ pair, onClose }: { pair: IntegrityPair; onClose: () => void }): JSX.Element {
  const [filesA, setFilesA] = useState<FileNode[]>([])
  const [filesB, setFilesB] = useState<FileNode[]>([])
  const [fileA, setFileA] = useState<string>(pair.matches[0]?.fileA ?? '')
  const [fileB, setFileB] = useState<string>(pair.matches[0]?.fileB ?? '')
  const [codeA, setCodeA] = useState('')
  const [codeB, setCodeB] = useState('')
  const [jumpA, setJumpA] = useState<{ line: number; nonce: number } | null>(null)
  const [jumpB, setJumpB] = useState<{ line: number; nonce: number } | null>(null)

  useEffect(() => {
    void call<FileNode[]>('review:files', pair.aId).then((f) => {
      setFilesA(f)
      if (!fileA && f[0]) setFileA(f[0].path)
    })
    void call<FileNode[]>('review:files', pair.bId).then((f) => {
      setFilesB(f)
      if (!fileB && f[0]) setFileB(f[0].path)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair.id])
  useEffect(() => {
    if (fileA) void call<string>('review:read', pair.aId, fileA).then(setCodeA)
  }, [fileA, pair.aId])
  useEffect(() => {
    if (fileB) void call<string>('review:read', pair.bId, fileB).then(setCodeB)
  }, [fileB, pair.bId])

  // Tô các đoạn trùng: mỗi điểm khớp tô ~3 dòng (độ dài k-gram)
  const marksA = useMemo(
    () => pair.matches.filter((m) => m.fileA === fileA && m.fileB === fileB).flatMap((m) => [0, 1, 2].map((d) => ({ line: m.lineA + d, kind: 'match' as const }))),
    [pair, fileA, fileB]
  )
  const marksB = useMemo(
    () => pair.matches.filter((m) => m.fileA === fileA && m.fileB === fileB).flatMap((m) => [0, 1, 2].map((d) => ({ line: m.lineB + d, kind: 'match' as const }))),
    [pair, fileA, fileB]
  )
  const filePairs = useMemo(() => {
    const m = new Map<string, number>()
    for (const x of pair.matches) m.set(x.fileA + '\u0000' + x.fileB, (m.get(x.fileA + '\u0000' + x.fileB) ?? 0) + 1)
    return [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12)
  }, [pair])
  const matchesHere = pair.matches.filter((m) => m.fileA === fileA && m.fileB === fileB)

  return (
    <Modal wide title={`So sánh: ${pair.aName} ↔ ${pair.bName} · ${pair.similarity}%`} onClose={onClose}>
      <div className="col" style={{ height: '100%', gap: 10 }}>
        <div className="row wrap gap-4">
          <span className="meta">File trùng nhiều:</span>
          {filePairs.map(([k, n]) => {
            const [fa, fb] = k.split('\u0000')
            return (
              <button key={k} className={cls('btn btn-sm', fa === fileA && fb === fileB && 'btn-primary')} onClick={() => (setFileA(fa), setFileB(fb))}>
                {fa.split('/').pop()} ↔ {fb.split('/').pop()} ({n})
              </button>
            )
          })}
          {matchesHere.length > 0 && (
            <select
              className="select input-sm"
              style={{ width: 180, marginLeft: 'auto' }}
              value=""
              onChange={(e) => {
                const m = matchesHere[Number(e.target.value)]
                if (!m) return
                setJumpA({ line: m.lineA, nonce: Date.now() })
                setJumpB({ line: m.lineB, nonce: Date.now() })
              }}
            >
              <option value="">Nhảy tới đoạn trùng…</option>
              {matchesHere.map((m, i) => (
                <option key={i} value={i}>
                  A:{m.lineA} ↔ B:{m.lineB}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="compare-grid" style={{ flex: 1 }}>
          {[
            { name: pair.aName, files: filesA, file: fileA, setFile: setFileA, code: codeA, marks: marksA, jump: jumpA },
            { name: pair.bName, files: filesB, file: fileB, setFile: setFileB, code: codeB, marks: marksB, jump: jumpB }
          ].map((s, i) => (
            <div key={i} className="compare-pane">
              <div className="panel-head">
                <span style={{ color: 'var(--text)' }}>{s.name}</span>
                <select className="select input-sm grow" value={s.file} onChange={(e) => s.setFile(e.target.value)}>
                  {s.files.map((f) => (
                    <option key={f.path} value={f.path}>
                      {f.path}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>{s.file && <CodeViewer path={s.file} content={s.code} marks={s.marks} jump={s.jump} />}</div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
