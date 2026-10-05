import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { AiStatus, AppSettings, LocalState, QueueState, User } from '@shared/types'
import { call, on } from './lib/api'
import { attempt, useStore } from './lib/store'
import { cls } from './lib/format'
import { Sidebar, TopBar } from './components/Shell'
import { ConfirmHost, Toasts } from './components/ui'
import { LoginPage } from './pages/Login'
import { AiSetupPage } from './pages/AiSetup'
import { DashboardPage } from './pages/Dashboard'
import { AssignmentsPage } from './pages/Assignments'
import { StudentsPage } from './pages/Students'
import { QueuePage } from './pages/Queue'
import { CodeReviewPage } from './pages/CodeReview'
import { IntegrityPage } from './pages/Integrity'
import { ReportsPage } from './pages/Reports'
import { TechProfilesPage } from './pages/TechProfiles'
import { AiModelsPage } from './pages/AiModels'
import { SettingsPage } from './pages/Settings'

type Phase = 'loading' | 'auth' | 'setup' | 'main'

function skippedSetup(userId: number): boolean {
  try {
    return localStorage.getItem('ms:skipSetup:' + userId) === '1'
  } catch {
    return false
  }
}

export default function App(): JSX.Element {
  const user = useStore((s) => s.user)
  const setUser = useStore((s) => s.setUser)
  const setSettings = useStore((s) => s.setSettings)
  const setAi = useStore((s) => s.setAi)
  const setQueue = useStore((s) => s.setQueue)
  const [phase, setPhase] = useState<Phase>('loading')

  // Sự kiện nền từ main process
  useEffect(() => {
    const offs = [
      on<LocalState>('ai:local', (local) => {
        const cur = useStore.getState().ai
        if (cur) setAi({ ...cur, local })
        else void useStore.getState().refreshAi().catch(() => {})
      }),
      on('ai:cloud-changed', () => void useStore.getState().refreshAi().catch(() => {})),
      on<QueueState>('queue:state', (q) => setQueue(q)),
      on<string>('ai:runtime-progress', (m) => useStore.getState().toast(m, 'info'))
    ]
    return () => offs.forEach((f) => f())
  }, [setAi, setQueue])

  useEffect(() => {
    void (async () => {
      setSettings(await call<AppSettings>('settings:get'))
      const u = await call<User | null>('auth:current')
      if (u) setUser(u)
      else setPhase('auth')
    })()
  }, [setSettings, setUser])

  // Sau khi đăng nhập: tải dữ liệu và quyết định có cần màn AI Configuration không
  useEffect(() => {
    if (!user) {
      setPhase((p) => (p === 'loading' ? p : 'auth'))
      return
    }
    void (async () => {
      setSettings(await call<AppSettings>('settings:get'))
      const st = useStore.getState()
      await attempt(() => st.loadAssignments())
      await attempt(() => st.loadProfiles())
      const ai = await call<AiStatus>('ai:status')
      setAi(ai)
      setQueue(await call<QueueState>('queue:state'))
      const needsSetup = ai.local.kind === 'not_installed' && ai.cloudConfigured.length === 0 && !skippedSetup(user.id)
      setPhase(needsSetup ? 'setup' : 'main')
    })()
    // Chỉ chạy lại khi đổi người dùng (đổi tên/mật khẩu không tải lại toàn bộ)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, setAi, setQueue, setSettings])

  // Phím tắt toàn cục
  useEffect(() => {
    if (phase !== 'main') return
    const onKey = async (e: KeyboardEvent): Promise<void> => {
      const st = useStore.getState()
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        const id = st.currentAssignmentId
        if (!id) return st.go('assignments', { tab: 'new' })
        const updated = await attempt(() => call('assign:pickFolder', id))
        if (updated) {
          await st.loadAssignments()
          const sum: any = await attempt(() => call('assign:scan', id))
          if (sum) st.toast(`Đã quét: ${sum.valid} bài hợp lệ / ${sum.total} file`, 'success')
          st.go('assignments', { tab: 'submissions' })
        }
      } else if (e.ctrlKey && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        st.go('reports')
      }
    }
    const handler = (e: KeyboardEvent): void => void onKey(e)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase])

  return (
    <>
      {phase === 'loading' && <div className="center-screen" />}
      {phase === 'auth' && <LoginPage />}
      {phase === 'setup' && user && (
        <AiSetupPage
          onDone={(skipped) => {
            if (skipped) {
              try {
                localStorage.setItem('ms:skipSetup:' + user.id, '1')
              } catch {
                /* bỏ qua */
              }
            }
            setPhase('main')
          }}
        />
      )}
      {phase === 'main' && <Main />}
      <Toasts />
      <ConfirmHost />
    </>
  )
}

function DefaultPasswordBanner(): JSX.Element | null {
  const user = useStore((s) => s.user)
  const go = useStore((s) => s.go)
  if (!user?.defaultPassword) return null
  return (
    <div className="callout warning" style={{ margin: '12px 24px 0' }}>
      <AlertTriangle size={16} />
      <span className="grow">Bạn đang dùng mật khẩu mặc định (admin/admin). Hãy đổi tên đăng nhập và mật khẩu để bảo vệ dữ liệu và API key.</span>
      <a onClick={() => go('settings', { tab: 'account' })}>Đổi ngay</a>
    </div>
  )
}

function Main(): JSX.Element {
  const page = useStore((s) => s.page)
  const collapsedSetting = useStore((s) => s.settings?.sidebarCollapsed ?? false)
  const [narrow, setNarrow] = useState(() => window.innerWidth < 1180)
  useEffect(() => {
    const onResize = (): void => setNarrow(window.innerWidth < 1180)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  // Màn hình nhỏ: sidebar tự thu gọn
  const collapsed = collapsedSetting || narrow
  return (
    <div className="app-shell">
      <TopBar />
      <div className={cls('body-grid', collapsed && 'collapsed')}>
        <Sidebar />
        <main className="content">
          {page !== 'review' && <DefaultPasswordBanner />}
          {page === 'dashboard' && <DashboardPage />}
          {page === 'assignments' && <AssignmentsPage />}
          {page === 'students' && <StudentsPage />}
          {page === 'queue' && <QueuePage />}
          {page === 'review' && <CodeReviewPage />}
          {page === 'integrity' && <IntegrityPage />}
          {page === 'reports' && <ReportsPage />}
          {page === 'profiles' && <TechProfilesPage />}
          {page === 'models' && <AiModelsPage />}
          {page === 'settings' && <SettingsPage />}
        </main>
      </div>
    </div>
  )
}
