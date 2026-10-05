import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Lock, Search, X } from 'lucide-react'
import { STATUS_META } from '@shared/constants'
import type { GradeStatus, StudentResult, StudentRow } from '@shared/types'
import { call, on } from '../lib/api'
import { fmtScore } from '../lib/format'
import { useT } from '../lib/i18n'
import { useCurrentAssignment, useStore } from '../lib/store'
import { AiLevelBadge, Empty, StatusBadge } from '../components/ui'
import { NoAssignment } from './Dashboard'

export function StudentsPage(): JSX.Element {
  const t = useT()
  const a = useCurrentAssignment()
  const params = useStore((s) => s.params)
  const go = useStore((s) => s.go)
  const [rows, setRows] = useState<StudentRow[]>([])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<string>(params.filter?.status ?? '')
  const [filter, setFilter] = useState(params.filter ?? {})
  const [critScores, setCritScores] = useState<Map<number, number | null>>(new Map())

  const load = useCallback(() => {
    if (!a) return
    void call<StudentRow[]>('students:list', a.id).then(setRows).catch(() => {})
  }, [a?.id])
  useEffect(() => {
    load()
    return on<{ assignmentId: number }>('students:changed', (p) => p.assignmentId === a?.id && load())
  }, [load])
  useEffect(() => {
    setFilter(params.filter ?? {})
    setStatus(params.filter?.status ?? '')
  }, [params])

  // Lọc theo tiêu chí (từ biểu đồ Dashboard): cần điểm từng tiêu chí
  useEffect(() => {
    if (!filter.criterionId) return
    void (async () => {
      const m = new Map<number, number | null>()
      for (const r of rows.filter((x) => x.status === 'completed' || x.status === 'reviewed')) {
        const res = await call<StudentResult>('result:get', r.id)
        const c = res.criteria.find((x) => x.id === filter.criterionId)
        m.set(r.id, c ? (c.id in res.overrides ? res.overrides[c.id] : c.score) : null)
      }
      setCritScores(m)
    })()
  }, [filter.criterionId, rows])

  const list = useMemo(() => {
    let out = rows.filter((r) => r.scanStatus === 'valid' || r.scanStatus === 'missing')
    if (q.trim()) {
      const k = q.trim().toLowerCase()
      out = out.filter((r) => r.name.toLowerCase().includes(k) || r.mssv.toLowerCase().includes(k))
    }
    if (status === 'missing') out = out.filter((r) => r.scanStatus === 'missing')
    else if (status) out = out.filter((r) => r.scanStatus === 'valid' && r.status === status)
    if (filter.scoreMin !== undefined) out = out.filter((r) => r.total !== null && r.total >= filter.scoreMin!)
    if (filter.scoreMax !== undefined) out = out.filter((r) => r.total !== null && r.total <= filter.scoreMax!)
    if (filter.flag === 'ai') out = out.filter((r) => r.aiLevel === 'medium' || r.aiLevel === 'high')
    if (filter.criterionId) {
      out = out.filter((r) => critScores.has(r.id)).sort((x, y) => (critScores.get(x.id) ?? 0) - (critScores.get(y.id) ?? 0))
    }
    return out
  }, [rows, q, status, filter, critScores])

  if (!a) return <NoAssignment />
  const crit = a.rubric.find((c) => c.id === filter.criterionId)
  const hasFilter = filter.scoreMin !== undefined || filter.scoreMax !== undefined || !!filter.criterionId || !!filter.flag

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">{t('Sinh viên')}</div>
          <div className="meta mt-8">
            {a.name} · {rows.filter((r) => r.scanStatus === 'valid').length} bài hợp lệ
            {rows.some((r) => r.scanStatus === 'missing') && ` · ${rows.filter((r) => r.scanStatus === 'missing').length} chưa nộp`}
          </div>
        </div>
      </div>
      <div className="row wrap mb-12">
        <div className="relative" style={{ width: 280 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 9 }} className="muted" />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Tìm theo tên hoặc MSSV" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="select" style={{ width: 200 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          {(Object.keys(STATUS_META) as GradeStatus[]).map((s) => (
            <option key={s} value={s}>
              {t(STATUS_META[s].label)}
            </option>
          ))}
          <option value="missing">Chưa nộp</option>
        </select>
        {hasFilter && (
          <span className="badge">
            {crit && `Tiêu chí: ${crit.name} (thấp → cao)`}
            {filter.scoreMin !== undefined && !crit && `Điểm ${filter.scoreMin}${filter.scoreMax !== undefined ? '–' + Math.ceil(filter.scoreMax) : '+'}`}
            {filter.flag === 'ai' && 'Tín hiệu AI Trung bình/Cao'}
            <button className="btn btn-ghost btn-icon btn-sm" style={{ width: 18, height: 18 }} onClick={() => go('students')}>
              <X size={12} />
            </button>
          </span>
        )}
      </div>
      {list.length === 0 ? (
        <div className="card">
          <Empty title={rows.length ? 'Không có sinh viên phù hợp' : 'Chưa có bài nộp — hãy chọn folder và quét trong Assignments'} />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="num">STT</th>
                <th>MSSV</th>
                <th>Họ tên</th>
                <th>Trạng thái</th>
                <th className="num">Điểm</th>
                {crit && <th className="num">{crit.name}</th>}
                <th>Backend</th>
                <th>Cờ</th>
                <th>Duyệt</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r, i) => (
                <tr key={r.id} className={r.scanStatus === 'valid' ? 'clickable' : ''} onClick={() => r.scanStatus === 'valid' && go('review', { studentId: r.id })}>
                  <td className="num meta">{i + 1}</td>
                  <td className="mono">{r.mssv}</td>
                  <td>{r.name}</td>
                  <td>
                    {r.scanStatus === 'missing' ? (
                      <span className="badge">
                        <span className="dot" style={{ background: 'var(--error)' }} />
                        Chưa nộp
                      </span>
                    ) : (
                      <span title={r.error || undefined}>
                        <StatusBadge status={r.status} />
                      </span>
                    )}
                  </td>
                  <td className="num score-pill" style={{ color: r.total !== null ? (r.total >= a.passThreshold ? 'var(--success)' : 'var(--error)') : undefined }}>
                    {fmtScore(r.total)}
                    {r.hasOverride && <Lock size={11} className="locked" style={{ marginLeft: 4 }} />}
                    {r.aiDeduct ? (
                      <span className="meta" style={{ marginLeft: 4, color: 'var(--error)' }} title="Điểm trừ do dùng AI">
                        (−{fmtScore(r.aiDeduct)})
                      </span>
                    ) : null}
                  </td>
                  {crit && <td className="num">{fmtScore(critScores.get(r.id))} / {crit.max}</td>}
                  <td>{r.backend && <span className={'tag tag-' + (r.backend === 'Cloud' ? 'Cloud' : 'Local')}>{r.backend}</span>}</td>
                  <td>
                    <div className="row gap-4">
                      <AiLevelBadge level={r.aiLevel === 'low' ? null : r.aiLevel} percent={r.aiPercent} />
                      {r.maxSimilarity !== null && r.maxSimilarity >= (useStore.getState().settings?.similarityThreshold ?? 70) && (
                        <span className="badge" title="Độ trùng lặp cao nhất với sinh viên khác">
                          <span className="dot" style={{ background: 'var(--warning)' }} />
                          Trùng {Math.round(r.maxSimilarity)}%
                        </span>
                      )}
                    </div>
                  </td>
                  <td>{r.reviewed && <CheckCircle2 size={15} className="success" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
