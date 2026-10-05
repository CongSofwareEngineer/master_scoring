import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Moon, Pause, Play, RotateCcw, Square } from 'lucide-react'
import type { StudentRow } from '@shared/types'
import { call, on } from '../lib/api'
import { fmtDuration, fmtScore } from '../lib/format'
import { useT } from '../lib/i18n'
import { attempt, useCurrentAssignment, useStore } from '../lib/store'
import { confirmDialog, Progress, StatusBadge, Switch } from '../components/ui'
import { NoAssignment } from './Dashboard'

export function QueuePage(): JSX.Element {
  const t = useT()
  const a = useCurrentAssignment()
  const queue = useStore((s) => s.queue)
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const go = useStore((s) => s.go)
  const ai = useStore((s) => s.ai)
  const [rows, setRows] = useState<StudentRow[]>([])
  const [canStart, setCanStart] = useState<{ ok: boolean; reason?: string }>({ ok: false })

  const load = useCallback(() => {
    if (!a) return
    void call<StudentRow[]>('students:list', a.id).then(setRows).catch(() => {})
    void call<{ ok: boolean; reason?: string }>('queue:canStart', a.id).then(setCanStart).catch(() => {})
  }, [a?.id])
  useEffect(() => {
    load()
    return on<{ assignmentId: number }>('students:changed', (p) => p.assignmentId === a?.id && load())
  }, [load, ai])

  if (!a) return <NoAssignment />
  const valid = rows.filter((r) => r.scanStatus === 'valid')
  const isThis = queue?.assignmentId === a.id
  const running = !!(isThis && queue?.running && !queue.paused)
  const paused = !!(isThis && queue?.paused && queue.total > 0)
  const otherRunning = !!(queue?.running && queue.assignmentId !== a.id)
  const done = valid.filter((r) => ['completed', 'reviewed', 'failed', 'cancelled'].includes(r.status)).length
  const current = rows.find((r) => r.id === queue?.currentStudentId)
  const remaining = valid.filter((r) => ['pending', 'failed', 'cancelled'].includes(r.status)).length

  const start = (mode: 'remaining' | 'all'): void =>
    void (async () => {
      if (mode === 'all' && !(await confirmDialog('Chấm lại cả lớp? Bài giáo viên đã sửa điểm hoặc đã duyệt sẽ được giữ nguyên.'))) return
      await attempt(() => call('queue:start', a.id, [], mode))
    })()

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">{t('Hàng đợi chấm')}</div>
          <div className="meta mt-8">Chấm lần lượt từng sinh viên để tránh quá tải RAM. Đóng app giữa chừng, lần mở sau sẽ tiếp tục.</div>
        </div>
        <div className="actions">
          {running ? (
            <>
              <button className="btn" onClick={() => void call('queue:pause')}>
                <Pause size={14} /> {t('Tạm dừng')}
              </button>
              <button className="btn btn-danger" onClick={async () => (await confirmDialog('Huỷ chấm các bài còn lại?', { danger: true })) && void call('queue:cancel')}>
                <Square size={14} /> {t('Huỷ chấm')}
              </button>
            </>
          ) : paused ? (
            <>
              <button className="btn btn-primary" onClick={() => void attempt(() => call('queue:resume'))}>
                <Play size={14} /> {t('Tiếp tục')}
              </button>
              <button className="btn btn-danger" onClick={() => void call('queue:cancel')}>
                <Square size={14} /> {t('Huỷ chấm')}
              </button>
            </>
          ) : (
            <>
              <button className="btn" disabled={!canStart.ok || otherRunning} onClick={() => start('all')}>
                <RotateCcw size={14} /> {t('Chấm lại cả lớp')}
              </button>
              <button className="btn btn-primary" disabled={!canStart.ok || otherRunning || remaining === 0} onClick={() => start('remaining')} title={canStart.reason}>
                <Play size={14} /> {t('Bắt đầu chấm')} {remaining > 0 && `(${remaining})`}
              </button>
            </>
          )}
        </div>
      </div>

      {!canStart.ok && canStart.reason && !running && (
        <div className="callout warning mb-12">
          <AlertTriangle size={16} />
          <span>
            Chưa thể chấm: {canStart.reason}
            {/Local AI/.test(canStart.reason) && (
              <>
                {' '}
                · <a onClick={() => go('models')}>Mở AI Models</a>
              </>
            )}
          </span>
        </div>
      )}
      {otherRunning && (
        <div className="callout info mb-12">
          <span>Đang chấm một assignment khác. Hãy chờ hoặc tạm dừng trước khi chấm assignment này.</span>
        </div>
      )}

      <div className="card">
        <div className="row wrap" style={{ justifyContent: 'space-between' }}>
          <div>
            <div className="card-title">
              Tiến trình: {done}/{valid.length} bài
            </div>
            <div className="meta mt-8">
              {running && current ? (
                <>
                  Đang chấm <b style={{ color: 'var(--text)' }}>{current.name}</b> ({current.mssv}) — {queue?.currentStep}
                </>
              ) : paused ? (
                queue?.currentStep || 'Đã tạm dừng'
              ) : remaining ? (
                `${remaining} bài chưa chấm`
              ) : (
                'Đã chấm xong tất cả bài hợp lệ'
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="meta">Thời gian ước tính còn lại</div>
            <div className="section-title">{isThis && queue?.etaSec !== null && queue?.etaSec !== undefined ? fmtDuration(queue.etaSec) : '—'}</div>
            {isThis && queue?.avgSec ? <div className="meta">~{fmtDuration(queue.avgSec)} / bài</div> : null}
          </div>
        </div>
        <div className="mt-12">
          <Progress value={valid.length ? (done / valid.length) * 100 : 0} ai={running} />
        </div>
        <div className="row mt-12">
          <Moon size={14} className="text-2" />
          <Switch checked={!!settings?.preventSleep} onChange={(v) => void updateSettings({ preventSleep: v })} label="Ngăn Windows chuyển sang Sleep khi đang chấm" />
        </div>
      </div>

      <div className="table-wrap mt-16">
        <table className="table">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>MSSV</th>
              <th>Họ tên</th>
              <th>Trạng thái</th>
              <th className="num">Điểm</th>
              <th className="num">Thời gian</th>
              <th>Ghi chú</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {valid.map((r, i) => (
              <tr key={r.id}>
                <td className="num meta">{i + 1}</td>
                <td className="mono">{r.mssv}</td>
                <td>{r.name}</td>
                <td>
                  <StatusBadge status={r.status} />
                </td>
                <td className="num score-pill">{fmtScore(r.total)}</td>
                <td className="num meta">{r.durationMs ? fmtDuration(r.durationMs / 1000) : '—'}</td>
                <td className="wrap error" style={{ maxWidth: 360, fontSize: 12 }}>
                  {r.status === 'failed' ? r.error : ''}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => go('review', { studentId: r.id })}>
                    Xem
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={!canStart.ok || otherRunning || ['extracting', 'analyzing', 'ai_grading'].includes(r.status)}
                    onClick={() => void attempt(() => call('queue:start', a.id, [r.id]))}
                    title="Chấm lại bài này (F5 trong Code Review)"
                  >
                    <RotateCcw size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
