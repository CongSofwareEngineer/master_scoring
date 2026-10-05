import { useEffect, useState, type FormEvent } from 'react'
import type { User } from '@shared/types'
import { call, platform } from '../lib/api'
import { cls } from '../lib/format'
import { useT } from '../lib/i18n'
import { useStore } from '../lib/store'
import { Logo } from '../components/Shell'

export function DragBar(): JSX.Element {
  return <div className={cls('topbar', 'drag-bar', platform === 'win32' && 'win', platform === 'darwin' && 'mac')} style={{ background: 'transparent', border: 'none' }} />
}

export function LoginPage(): JSX.Element {
  const t = useT()
  const setUser = useStore((s) => s.setUser)
  const [mode, setMode] = useState<'login' | 'register' | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)

  useEffect(() => {
    void call<boolean>('auth:hasUser').then((has) => setMode(has ? 'login' : 'register'))
    void call<string | null>('auth:defaultHint').then((h) => {
      setHint(h)
      if (h) setUsername(h)
    })
  }, [])

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    setError('')
    if (mode === 'register' && password !== confirm) return setError(t('Mật khẩu nhập lại không khớp'))
    setBusy(true)
    try {
      const u =
        mode === 'register'
          ? await call<User>('auth:register', username, password, displayName)
          : await call<User>('auth:login', username, password)
      setUser(u)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!mode) return <div className="center-screen" />

  return (
    <div className="center-screen">
      <DragBar />
      <div className="center-body">
        <form className="card auth-card" onSubmit={submit} style={{ padding: 28 }}>
          <div className="auth-logo">
            <Logo size={20} />
            Master Scoring
          </div>
          {mode === 'register' && (
            <div className="callout info mb-12">
              <span>
                Tạo thêm tài khoản giáo viên. {t('Tài khoản lưu trên máy này, không cần Internet.')}
              </span>
            </div>
          )}
          {mode === 'login' && hint && (
            <div className="callout info mb-12">
              <span>
                Tài khoản mặc định: <b className="mono">{hint}</b> / <b className="mono">admin</b> — hãy đổi mật khẩu sau khi đăng nhập (Cài đặt → Tài khoản).
              </span>
            </div>
          )}
          <div className="col gap-12">
            {mode === 'register' && (
              <div className="field">
                <label>{t('Tên hiển thị')}</label>
                <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="VD: Nguyễn Văn B" />
              </div>
            )}
            <div className="field">
              <label>{t('Tên đăng nhập')}</label>
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
            </div>
            <div className="field">
              <label>{t('Mật khẩu')}</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              />
            </div>
            {mode === 'register' && (
              <div className="field">
                <label>{t('Nhập lại mật khẩu')}</label>
                <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
              </div>
            )}
            {error && <div className="callout error">{error}</div>}
            <button className="btn btn-primary btn-lg" type="submit" disabled={busy || !username || !password}>
              {busy && <span className="spinner" style={{ borderTopColor: 'white' }} />}
              {mode === 'register' ? t('Tạo tài khoản') : t('Đăng nhập')}
            </button>
            <div className="meta" style={{ textAlign: 'center' }}>
              {mode === 'login' ? (
                <>
                  {t('Chưa có tài khoản?')} <a onClick={() => (setMode('register'), setError(''))}>{t('Tạo tài khoản')}</a>
                </>
              ) : (
                <>
                  {t('Đã có tài khoản?')} <a onClick={() => (setMode('login'), setError(''))}>{t('Đăng nhập')}</a>
                </>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
