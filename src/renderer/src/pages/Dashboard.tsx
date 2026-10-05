import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronRight, Clock, FolderKanban, GraduationCap, ShieldAlert, Sparkles, TrendingUp, Users } from 'lucide-react'
import type { DashboardData } from '@shared/types'
import { call, on } from '../lib/api'
import { fmtScore, fmtTime } from '../lib/format'
import { useT } from '../lib/i18n'
import { useCurrentAssignment, useStore } from '../lib/store'
import { CriteriaBars, Histogram } from '../components/Charts'
import { Empty, StatusBadge } from '../components/ui'

export function NoAssignment(): JSX.Element {
  const t = useT()
  const go = useStore((s) => s.go)
  return (
    <div className="page">
      <Empty icon={<FolderKanban size={40} />} title="Chưa có assignment nào">
        <div className="meta">Tạo assignment, chọn công nghệ, rubric và folder bài nộp để bắt đầu chấm.</div>
        <button className="btn btn-primary mt-8" onClick={() => go('assignments', { tab: 'new' })}>
          {t('Tạo assignment')}
        </button>
      </Empty>
    </div>
  )
}

export function DashboardPage(): JSX.Element {
  const t = useT()
  const a = useCurrentAssignment()
  const go = useStore((s) => s.go)
  const [data, setData] = useState<DashboardData | null>(null)

  const load = useCallback(() => {
    if (!a) return
    void call<DashboardData>('dashboard:get', a.id).then(setData).catch(() => {})
  }, [a?.id])

  useEffect(() => {
    setData(null)
    load()
    const offs = [
      on<{ assignmentId: number }>('students:changed', (p) => p.assignmentId === a?.id && load()),
      on<{ running: boolean }>('integrity:status', (p) => !p.running && load())
    ]
    return () => offs.forEach((f) => f())
  }, [load])

  if (!a) return <NoAssignment />

  const stat = (icon: JSX.Element, label: string, value: string, sub?: string, onClick?: () => void): JSX.Element => (
    <div className="card stat" style={{ cursor: onClick ? 'pointer' : undefined }} onClick={onClick}>
      <div className="stat-label">
        {icon}
        {label}
      </div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">{t('Dashboard')}</div>
          <div className="meta mt-8">
            {a.name}
            {a.className && ` · ${a.className}`} · Ngưỡng đạt {a.passThreshold}/10
          </div>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => go('queue')}>
            {t('Hàng đợi chấm')}
          </button>
          <button className="btn btn-primary" onClick={() => go('students')}>
            {t('Sinh viên')} <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Overview → Statistics */}
      <div className="grid-4">
        {stat(<Users size={14} />, 'Sinh viên', data ? String(data.students) : '—', data ? `${data.graded} bài đã chấm` : undefined, () => go('students'))}
        {stat(
          <TrendingUp size={14} />,
          t('Điểm trung bình'),
          data?.average !== null && data ? fmtScore(data.average) : '—',
          data && data.median !== null ? `Trung vị ${fmtScore(data.median)} · Cao ${fmtScore(data.max)} · Thấp ${fmtScore(data.min)}` : undefined
        )}
        {stat(
          <GraduationCap size={14} />,
          t('Tỉ lệ đạt'),
          data?.passRate !== null && data ? `${data.passRate}%` : '—',
          `Điểm ≥ ${a.passThreshold}`,
          () => go('students', { filter: { scoreMin: a.passThreshold } })
        )}
        {stat(<Clock size={14} />, t('Chờ chấm'), data ? String(data.pending) : '—', 'Chờ, đang chấm hoặc lỗi', () => go('queue'))}
      </div>

      {/* Charts */}
      <div className="grid-2 mt-16">
        <div className="card">
          <div className="card-header">
            <span className="card-title">{t('Phân bố điểm')}</span>
            <span className="meta">Click cột để xem danh sách</span>
          </div>
          {data && data.graded > 0 ? (
            <Histogram
              bins={data.histogram}
              passThreshold={a.passThreshold}
              onBarClick={(i) => go('students', { filter: { scoreMin: i, scoreMax: i === 9 ? 10 : i + 0.999 } })}
            />
          ) : (
            <Empty title="Chưa có bài nào chấm xong" />
          )}
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">{t('Tín hiệu AI & Trùng lặp')}</span>
            <a className="meta" onClick={() => go('integrity')}>
              Mở Integrity
            </a>
          </div>
          {data ? (
            <div className="col gap-12">
              <div className="list-row clickable" onClick={() => go('integrity', { tab: 'ai' })}>
                <Sparkles size={18} className="ai-color" />
                <div className="grow">
                  <div>
                    <b>{data.aiReview}</b> bài có tín hiệu dùng AI mức Trung bình/Cao
                  </div>
                  <div className="meta">
                    {data.aiMediumHighRate !== null ? `${data.aiMediumHighRate}% số bài đã chấm` : 'Chưa có dữ liệu'}
                    {data.aiAvgPercent !== null && ` · trung bình ~${data.aiAvgPercent}% code AI`}
                    {data.aiPenalized > 0 && ` · ${data.aiPenalized} bài bị trừ điểm`}
                  </div>
                </div>
              </div>
              {data.similarityEnabled ? (
                <div className="list-row clickable" onClick={() => go('integrity', { tab: 'stats' })}>
                  <ShieldAlert size={18} className="warning" />
                  <div className="grow">
                    <div>
                      <b>{data.similarStudents}</b> sinh viên có code giống bạn khác · <b>{data.similarPairs}</b> cặp vượt ngưỡng
                    </div>
                    <div className="meta">{data.clusters} nhóm ≥ 3 sinh viên giống nhau</div>
                  </div>
                </div>
              ) : (
                <div className="list-row clickable" onClick={() => go('settings', { tab: 'general' })}>
                  <ShieldAlert size={18} style={{ color: 'var(--pending)' }} />
                  <div className="grow">
                    <div>So sánh code giống nhau đang tắt</div>
                    <div className="meta">Bật trong Cài đặt → Chung</div>
                  </div>
                </div>
              )}
              <div className="meta" style={{ padding: '0 10px' }}>
                Tín hiệu AI chỉ để tham khảo, không phải kết luận. Không tự động trừ điểm.
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid-2 mt-16">
        <div className="card">
          <div className="card-header">
            <span className="card-title">{t('Điểm TB theo tiêu chí')}</span>
            <span className="meta">Cả lớp yếu phần nào</span>
          </div>
          {data && data.graded > 0 ? (
            <CriteriaBars items={data.criteriaAvg} onClick={(id) => go('students', { filter: { criterionId: id } })} />
          ) : (
            <Empty title="Chưa có dữ liệu" />
          )}
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">{t('Cảnh báo')}</span>
          </div>
          {data && data.alerts.length ? (
            <div className="col gap-4">
              {data.alerts.map((al) => (
                <div
                  key={al.kind}
                  className="list-row clickable"
                  onClick={() =>
                    al.kind === 'failed' || al.kind === 'compile'
                      ? go('students', { filter: { status: al.kind === 'failed' ? 'failed' : undefined, flag: al.kind } })
                      : go('assignments', { tab: 'submissions' })
                  }
                >
                  <AlertTriangle size={16} className={al.kind === 'failed' || al.kind === 'broken' ? 'error' : 'warning'} />
                  <span>
                    <b>{al.count}</b> {al.label}
                  </span>
                  <ChevronRight size={14} className="muted" style={{ marginLeft: 'auto' }} />
                </div>
              ))}
            </div>
          ) : (
            <div className="list-row">
              <CheckCircle2 size={16} className="success" /> Không có cảnh báo
            </div>
          )}
        </div>
      </div>

      <div className="card mt-16">
        <div className="card-header">
          <span className="card-title">{t('Hoạt động chấm gần đây')}</span>
        </div>
        {data && data.recent.length ? (
          <table className="table">
            <tbody>
              {data.recent.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => go('review', { studentId: r.id })}>
                  <td className="mono">{r.mssv}</td>
                  <td>{r.name}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="num score-pill">{fmtScore(r.total)}</td>
                  <td className="meta">{fmtTime(r.finishedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="meta">Chưa có hoạt động.</div>
        )}
      </div>
    </div>
  )
}
