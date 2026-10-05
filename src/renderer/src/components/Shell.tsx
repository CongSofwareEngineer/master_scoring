import { useEffect, useRef, useState } from 'react'
import {
  Bot,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ClipboardCheck,
  CodeXml,
  FileChartColumn,
  FolderKanban,
  KeyRound,
  Layers,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldAlert,
  Users
} from 'lucide-react'
import { CLOUD_PROVIDERS } from '@shared/constants'
import type { User } from '@shared/types'
import { call, platform } from '../lib/api'
import { cls } from '../lib/format'
import { useT } from '../lib/i18n'
import { useCurrentAssignment, useStore, type Page } from '../lib/store'
import { localStateView, Modal } from './ui'

const NAV: { page: Page; label: string; icon: typeof LayoutDashboard; group: number }[] = [
  { page: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 0 },
  { page: 'assignments', label: 'Assignments', icon: FolderKanban, group: 0 },
  { page: 'students', label: 'Sinh viên', icon: Users, group: 0 },
  { page: 'queue', label: 'Hàng đợi chấm', icon: ClipboardCheck, group: 0 },
  { page: 'review', label: 'Code Review', icon: CodeXml, group: 0 },
  { page: 'integrity', label: 'Liêm chính', icon: ShieldAlert, group: 0 },
  { page: 'reports', label: 'Báo cáo', icon: FileChartColumn, group: 0 },
  { page: 'profiles', label: 'Tech Profiles', icon: Layers, group: 1 },
  { page: 'models', label: 'AI Models', icon: Bot, group: 1 }
]

export function Logo({ size = 14 }: { size?: number }): JSX.Element {
  return (
    <span className="brand-logo">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 7 3 12l4 5" />
        <path d="m17 7 4 5-4 5" />
        <path d="m9 12.5 2.2 2.2L15.5 9.5" />
      </svg>
    </span>
  )
}

export function Sidebar(): JSX.Element {
  const t = useT()
  const page = useStore((s) => s.page)
  const go = useStore((s) => s.go)
  const collapsed = useStore((s) => s.settings?.sidebarCollapsed ?? false)
  const updateSettings = useStore((s) => s.updateSettings)
  const queue = useStore((s) => s.queue)
  const item = (n: (typeof NAV)[number] | { page: Page; label: string; icon: typeof LayoutDashboard }): JSX.Element => {
    const Icon = n.icon
    const badge = n.page === 'queue' && queue?.running ? `${queue.done}/${queue.total}` : null
    return (
      <button
        key={n.page}
        className={cls('nav-item', page === n.page && 'active', collapsed && 'tooltip-host')}
        data-tip={collapsed ? t(n.label) : undefined}
        onClick={() => go(n.page)}
      >
        <Icon size={17} strokeWidth={1.8} />
        <span className="nav-label">{t(n.label)}</span>
        {badge && <span className="nav-badge">{badge}</span>}
      </button>
    )
  }
  return (
    <nav className="sidebar">
      {NAV.filter((n) => n.group === 0).map(item)}
      <div className="nav-sep" />
      {NAV.filter((n) => n.group === 1).map(item)}
      <div className="nav-sep" />
      {item({ page: 'settings', label: 'Cài đặt', icon: Settings })}
      <div className="sidebar-footer">
        <button
          className={cls('nav-item', collapsed && 'tooltip-host')}
          data-tip={collapsed ? t('Mở rộng') : undefined}
          onClick={() => void updateSettings({ sidebarCollapsed: !collapsed })}
        >
          {collapsed ? <ChevronsRight size={17} /> : <ChevronsLeft size={17} />}
          <span className="nav-label">{t('Thu gọn')}</span>
        </button>
      </div>
    </nav>
  )
}

function AiIndicator(): JSX.Element {
  const t = useT()
  const ai = useStore((s) => s.ai)
  const go = useStore((s) => s.go)
  const a = useCurrentAssignment()
  let view = localStateView(ai?.local)
  if (a?.backend === 'cloud' && a.rubric.some((c) => c.source === 'ai')) {
    const configured = ai?.cloudConfigured.includes(a.cloudProvider)
    view = {
      label: `Cloud: ${CLOUD_PROVIDERS[a.cloudProvider].name}${configured ? '' : ' (chưa cấu hình)'}`,
      color: configured ? 'var(--warning)' : 'var(--error)',
      pulse: false
    }
  }
  return (
    <button className="ai-indicator" onClick={() => go('models')} title="Mở AI Models">
      <span className={cls('dot', view.pulse && 'pulse')} style={{ background: view.color }} />
      {t(view.label)}
    </button>
  )
}

function AssignmentPicker(): JSX.Element {
  const t = useT()
  const assignments = useStore((s) => s.assignments)
  const current = useStore((s) => s.currentAssignmentId)
  const setCurrent = useStore((s) => s.setCurrentAssignment)
  const go = useStore((s) => s.go)
  if (!assignments.length) {
    return (
      <button className="btn btn-sm no-drag" onClick={() => go('assignments', { tab: 'new' })}>
        + {t('Tạo assignment')}
      </button>
    )
  }
  return (
    <select
      className="select input-sm no-drag"
      style={{ width: 300, height: 28 }}
      value={current ?? ''}
      onChange={(e) => setCurrent(Number(e.target.value))}
      title="Assignment đang làm việc"
    >
      {assignments.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
          {a.className ? ` · ${a.className}` : ''}
        </option>
      ))}
    </select>
  )
}

function UserMenu(): JSX.Element {
  const t = useT()
  const user = useStore((s) => s.user)
  const setUser = useStore((s) => s.setUser)
  const go = useStore((s) => s.go)
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDoc = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  return (
    <div className="relative no-drag" ref={ref}>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(!open)}>
        <span
          className="brand-logo"
          style={{ width: 20, height: 20, borderRadius: '50%', fontSize: 11, background: 'var(--surface-2)', border: '1px solid var(--border)' }}
        >
          {(user?.displayName || user?.username || '?').slice(0, 1).toUpperCase()}
        </span>
        <span className="truncate" style={{ maxWidth: 140 }}>
          {user?.displayName}
        </span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="dropdown">
          <div className="list-row meta">@{user?.username}</div>
          <div className="divider" style={{ margin: '4px 0' }} />
          <div className="list-row clickable" onClick={() => (setOpen(false), go('settings'))}>
            <Settings size={15} /> {t('Cài đặt')}
          </div>
          <div className="list-row clickable" onClick={() => (setOpen(false), setPw(true))}>
            <KeyRound size={15} /> Đổi mật khẩu
          </div>
          <div
            className="list-row clickable"
            onClick={async () => {
              await call('auth:logout')
              setUser(null)
            }}
          >
            <LogOut size={15} /> {t('Đăng xuất')}
          </div>
        </div>
      )}
      {pw && <ChangePassword onClose={() => setPw(false)} />}
    </div>
  )
}

export function ChangePassword({ onClose }: { onClose: () => void }): JSX.Element {
  const toast = useStore((s) => s.toast)
  const [oldPw, setOld] = useState('')
  const [newPw, setNew] = useState('')
  const [confirm, setConfirm] = useState('')
  const submit = async (): Promise<void> => {
    if (newPw !== confirm) return toast('Mật khẩu nhập lại không khớp', 'error')
    try {
      useStore.getState().setUser(await call<User>('auth:changePassword', oldPw, newPw))
      toast('Đã đổi mật khẩu', 'success')
      onClose()
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }
  return (
    <Modal
      title="Đổi mật khẩu"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Huỷ
          </button>
          <button className="btn btn-primary" onClick={submit}>
            Lưu
          </button>
        </>
      }
    >
      <div className="col gap-12">
        <input className="input" type="password" placeholder="Mật khẩu hiện tại" value={oldPw} onChange={(e) => setOld(e.target.value)} />
        <input className="input" type="password" placeholder="Mật khẩu mới (≥ 6 ký tự)" value={newPw} onChange={(e) => setNew(e.target.value)} />
        <input className="input" type="password" placeholder="Nhập lại mật khẩu mới" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
    </Modal>
  )
}

export function TopBar(): JSX.Element {
  const go = useStore((s) => s.go)
  return (
    <header className={cls('topbar', platform === 'win32' && 'win', platform === 'darwin' && 'mac')}>
      <div className="brand">
        <Logo />
        Master Scoring
      </div>
      <div className="no-drag" style={{ marginLeft: 12 }}>
        <AssignmentPicker />
      </div>
      <div className="topbar-spacer" />
      <div className="no-drag">
        <AiIndicator />
      </div>
      <UserMenu />
      <button className="btn btn-ghost btn-icon btn-sm no-drag" onClick={() => go('settings')} title="Cài đặt">
        <Settings size={16} />
      </button>
    </header>
  )
}
