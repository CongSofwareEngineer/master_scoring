import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { STATUS_META } from '@shared/constants'
import type { GradeStatus, LocalState } from '@shared/types'
import { useT } from '../lib/i18n'
import { useStore } from '../lib/store'
import { cls } from '../lib/format'

export function Modal(props: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props.onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className={cls('modal', props.wide && 'wide')} role="dialog" aria-modal="true">
        <div className="modal-header">
          <div className="section-title">{props.title}</div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={props.onClose} aria-label="Đóng">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{props.children}</div>
        {props.footer && <div className="modal-footer">{props.footer}</div>}
      </div>
    </div>
  )
}

export function StatusBadge({ status }: { status: GradeStatus }): JSX.Element {
  const t = useT()
  const m = STATUS_META[status] ?? STATUS_META.pending
  const active = status === 'extracting' || status === 'analyzing' || status === 'ai_grading'
  return (
    <span className="badge">
      {active ? <span className="spinner" style={{ width: 10, height: 10, borderTopColor: m.color }} /> : <span className="dot" style={{ background: m.color }} />}
      {t(m.label)}
    </span>
  )
}

export function AiLevelBadge({ level, percent }: { level: 'low' | 'medium' | 'high' | null; percent?: number | null }): JSX.Element | null {
  if (!level) return null
  const map = {
    low: { label: 'Thấp', color: 'var(--pending)' },
    medium: { label: 'Trung bình', color: 'var(--warning)' },
    high: { label: 'Cao', color: 'var(--error)' }
  }
  const m = map[level]
  return (
    <span className="badge" title={percent != null ? 'Ước lượng % code do AI viết — không phải kết luận' : 'Tín hiệu dùng AI — chỉ để tham khảo'}>
      <span className="dot" style={{ background: m.color }} />
      {percent != null ? `AI ~${percent}%` : `AI: ${m.label}`}
    </span>
  )
}

export function Toasts(): JSX.Element {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismiss)
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cls('toast', t.kind)}>
          {t.kind === 'success' ? (
            <CheckCircle2 size={16} className="success" />
          ) : t.kind === 'error' ? (
            <XCircle size={16} className="error" />
          ) : t.kind === 'warning' ? (
            <AlertTriangle size={16} className="warning" />
          ) : (
            <Info size={16} style={{ color: 'var(--info)' }} />
          )}
          <div className="grow" style={{ whiteSpace: 'pre-wrap' }}>
            {t.message}
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => dismiss(t.id)} aria-label="Đóng">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }): JSX.Element {
  return (
    <div className="empty">
      {icon}
      <div className="card-title" style={{ color: 'var(--text)' }}>
        {title}
      </div>
      {children}
    </div>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }): JSX.Element {
  return (
    <label className="check">
      <span className="switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span />
      </span>
      {label}
    </label>
  )
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

export function Progress({ value, ai, indeterminate }: { value: number; ai?: boolean; indeterminate?: boolean }): JSX.Element {
  return (
    <div className={cls('progress', ai && 'ai', indeterminate && 'indeterminate')}>
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

// ───── Hộp thoại xác nhận (thay cho window.confirm) ─────
type ConfirmReq = { message: string; danger?: boolean; okLabel?: string; resolve: (v: boolean) => void }
let pushConfirm: ((r: ConfirmReq) => void) | null = null

export function confirmDialog(message: string, opts: { danger?: boolean; okLabel?: string } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!pushConfirm) return resolve(window.confirm(message))
    pushConfirm({ message, ...opts, resolve })
  })
}

export function ConfirmHost(): JSX.Element | null {
  const [req, setReq] = useState<ConfirmReq | null>(null)
  const t = useT()
  useEffect(() => {
    pushConfirm = setReq
    return () => {
      pushConfirm = null
    }
  }, [])
  if (!req) return null
  const close = (v: boolean): void => {
    req.resolve(v)
    setReq(null)
  }
  return (
    <Modal
      title="Xác nhận"
      onClose={() => close(false)}
      footer={
        <>
          <button className="btn" onClick={() => close(false)}>
            {t('Huỷ')}
          </button>
          <button className={cls('btn', req.danger ? 'btn-danger' : 'btn-primary')} onClick={() => close(true)} autoFocus>
            {req.okLabel ?? 'Đồng ý'}
          </button>
        </>
      }
    >
      <div style={{ whiteSpace: 'pre-wrap' }}>{req.message}</div>
    </Modal>
  )
}

// ───── Trạng thái Local AI ─────
export function localStateView(s: LocalState | undefined): { label: string; color: string; pulse: boolean } {
  if (!s) return { label: 'Đang tải...', color: 'var(--pending)', pulse: true }
  switch (s.kind) {
    case 'ready':
      return { label: 'Local AI: Sẵn sàng', color: 'var(--success)', pulse: false }
    case 'downloading':
      return { label: s.paused ? `Tạm dừng tải ${s.percent.toFixed(0)}%` : `Đang tải model ${s.percent.toFixed(0)}%`, color: 'var(--info)', pulse: !s.paused }
    case 'verifying':
      return { label: 'Đang kiểm tra file', color: 'var(--info)', pulse: true }
    case 'starting':
      return { label: 'Local AI: Đang khởi động', color: 'var(--warning)', pulse: true }
    case 'error':
      return { label: 'Local AI: Lỗi', color: 'var(--error)', pulse: false }
    case 'stopped':
      return { label: 'Local AI: Đã dừng', color: 'var(--pending)', pulse: false }
    default:
      return { label: 'Chưa cấu hình AI', color: 'var(--pending)', pulse: false }
  }
}

// Thanh tỉ lệ nguồn gốc code: SV tự viết / AI / code khung (theo % tổng số dòng).
export function OriginBar({ student, ai, starter, height = 8 }: { student: number; ai: number; starter: number; height?: number }): JSX.Element {
  return (
    <div className="origin-bar" style={{ height }} title={`SV tự viết ${student}% · AI ${ai}% · Code khung ${starter}%`}>
      {student > 0 && <div className="origin-student" style={{ width: student + '%' }} />}
      {ai > 0 && <div className="origin-ai" style={{ width: ai + '%' }} />}
      {starter > 0 && <div className="origin-starter" style={{ width: starter + '%' }} />}
    </div>
  )
}
