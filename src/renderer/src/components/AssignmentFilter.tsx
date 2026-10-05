// Bộ lọc Assignment dùng chung cho Báo cáo / Liêm chính: chọn assignment ngay trên trang, xem tiến độ chấm,
// và reset & chấm lại từ đầu. Số liệu tự cập nhật khi chấm lại (sự kiện students:changed).
import { useEffect, useState } from 'react'
import { FolderKanban, RotateCcw } from 'lucide-react'
import type { Assignment, QueueState, StudentRow } from '@shared/types'
import { call, on } from '../lib/api'
import { useT } from '../lib/i18n'
import { attempt, useStore } from '../lib/store'
import { confirmDialog } from './ui'

/** Hỏi xác nhận rồi xoá toàn bộ kết quả chấm của assignment và chấm lại cả lớp. Trả về true nếu đã bắt đầu chấm lại. */
export async function resetAndRegrade(a: Assignment, t: (s: string, vars?: Record<string, string | number>) => string): Promise<boolean> {
  const ok = await confirmDialog(
    t(
      'Reset "{name}" và chấm lại từ đầu? Toàn bộ kết quả chấm sẽ bị xoá: điểm, điểm giáo viên đã sửa, trạng thái duyệt, điểm trừ/câu hỏi AI và kết quả so sánh trùng lặp. Ghi chú giáo viên được giữ lại. Báo cáo và Liêm chính sẽ cập nhật theo kết quả chấm mới.',
      { name: a.name }
    ),
    { danger: true, okLabel: t('Reset & chấm lại') }
  )
  if (!ok) return false
  const r = await attempt(() => call<QueueState>('queue:reset', a.id), t('Đã reset — đang chấm lại từ đầu'))
  return !!r
}

export function AssignmentFilter({ assignment: a }: { assignment: Assignment }): JSX.Element {
  const t = useT()
  const assignments = useStore((s) => s.assignments)
  const setCurrent = useStore((s) => s.setCurrentAssignment)
  const queue = useStore((s) => s.queue)
  const [rows, setRows] = useState<StudentRow[] | null>(null)

  useEffect(() => {
    setRows(null)
    const load = (): void => void call<StudentRow[]>('students:list', a.id).then(setRows).catch(() => {})
    load()
    return on<{ assignmentId: number }>('students:changed', (p) => p.assignmentId === a.id && load())
  }, [a.id])

  const valid = rows?.filter((r) => r.scanStatus === 'valid') ?? []
  const graded = valid.filter((r) => r.status === 'completed' || r.status === 'reviewed').length
  const grading = !!queue && queue.assignmentId === a.id && (queue.running || queue.paused)

  return (
    <div className="card mb-12">
      <div className="row wrap gap-8">
        <FolderKanban size={16} className="meta" />
        <span className="label">{t('Assignment')}</span>
        <select className="select input-sm" style={{ width: 320 }} value={a.id} onChange={(e) => setCurrent(Number(e.target.value))}>
          {assignments.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
              {x.className ? ` · ${x.className}` : ''}
            </option>
          ))}
        </select>
        {rows && (
          <span className="badge" title={t('Số bài hợp lệ đã chấm xong')}>
            {t('Đã chấm {n}/{total}', { n: graded, total: valid.length })}
          </span>
        )}
        {grading && (
          <span className="badge" style={{ color: 'var(--warning)' }}>
            {!queue.paused && <span className="spinner" style={{ width: 10, height: 10 }} />}
            {queue.paused ? t('Tạm dừng chấm') : t('Đang chấm {done}/{total}', { done: queue.done, total: queue.total })} · {t('số liệu đang cập nhật')}
          </span>
        )}
        <div className="grow" />
        <button className="btn btn-sm" title={t('Xoá kết quả chấm cũ và chấm lại cả lớp')} onClick={() => void resetAndRegrade(a, t)}>
          <RotateCcw size={14} /> {t('Reset & chấm lại')}
        </button>
      </div>
    </div>
  )
}
