import { useEffect, useState } from 'react'
import { Database, Globe, HardDrive, Info, KeyRound, Settings as SettingsIcon, Trash2 } from 'lucide-react'
import type { AppSettings, NetLogEntry, StorageUsage, User } from '@shared/types'
import { call } from '../lib/api'
import { cls, fmtBytes, fmtTime } from '../lib/format'
import { useT } from '../lib/i18n'
import { attempt, useStore } from '../lib/store'
import { confirmDialog, Field, Switch } from '../components/ui'

type Tab = 'general' | 'account' | 'data' | 'network' | 'about'

export function SettingsPage(): JSX.Element {
  const t = useT()
  const params = useStore((s) => s.params)
  const [tab, setTab] = useState<Tab>((params.tab as Tab) || 'general')
  useEffect(() => {
    if (params.tab) setTab(params.tab as Tab)
  }, [params])
  const tabs: [Tab, string, JSX.Element][] = [
    ['general', 'Chung', <SettingsIcon key="g" size={14} />],
    ['account', 'Tài khoản', <KeyRound key="a" size={14} />],
    ['data', 'Dữ liệu', <Database key="d" size={14} />],
    ['network', 'Kết nối mạng', <Globe key="n" size={14} />],
    ['about', 'Giới thiệu', <Info key="i" size={14} />]
  ]
  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">{t('Cài đặt')}</div>
      </div>
      <div className="tabs">
        {tabs.map(([k, label, icon]) => (
          <button key={k} className={cls('tab', tab === k && 'active')} onClick={() => setTab(k)}>
            {icon} {t(label)}
          </button>
        ))}
      </div>
      {tab === 'general' && <General />}
      {tab === 'account' && <Account />}
      {tab === 'data' && <DataTab />}
      {tab === 'network' && <Network />}
      {tab === 'about' && <About />}
    </div>
  )
}

function General(): JSX.Element {
  const t = useT()
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const [draft, setDraft] = useState<AppSettings | null>(settings)
  useEffect(() => setDraft(settings), [settings])
  if (!draft) return <div />
  const save = async (): Promise<void> => {
    const r = await attempt(() => call<AppSettings>('settings:update', draft), 'Đã lưu cài đặt')
    if (r) setSettings(r)
  }
  return (
    <div className="card col gap-16" style={{ maxWidth: 900 }}>
      <div className="form-grid">
        <Field label={t('Ngôn ngữ')}>
          <select className="select" value={draft.lang} onChange={(e) => setDraft({ ...draft, lang: e.target.value as AppSettings['lang'] })}>
            <option value="vi">Tiếng Việt</option>
            <option value="en">English</option>
          </select>
        </Field>
        <Field label="Mẫu MSSV (regex)" hint="Mặc định: ^\d{4,12}$ (vd 23546)">
          <input className="input mono" value={draft.mssvPattern} onChange={(e) => setDraft({ ...draft, mssvPattern: e.target.value })} />
        </Field>
        <Field label="Giới hạn giải nén (MB)" hint="Chống zip bomb">
          <input className="input" type="number" min={50} value={draft.maxUnzipMb} onChange={(e) => setDraft({ ...draft, maxUnzipMb: Number(e.target.value) })} />
        </Field>
        <Field label="Giới hạn số file mỗi bài">
          <input className="input" type="number" min={100} value={draft.maxFiles} onChange={(e) => setDraft({ ...draft, maxFiles: Number(e.target.value) })} />
        </Field>
      </div>
      <div className="divider" />
      <div className="card-title">{t('Liêm chính')}</div>
      <div className="col gap-8">
        <Switch
          checked={draft.similarityEnabled}
          onChange={(v) => setDraft({ ...draft, similarityEnabled: v })}
          label="So sánh & thống kê code giống nhau giữa các sinh viên"
        />
        <div className="meta">Chạy tự động sau khi chấm xong cả lớp (cùng assignment, loại trừ code khung). Lớp đông sẽ mất thêm thời gian.</div>
        {draft.similarityEnabled && (
          <div className="form-grid">
            <Field label="Ngưỡng trùng lặp (%)" hint="Cặp giống nhau từ ngưỡng này trở lên được cảnh báo">
              <input
                className="input"
                type="number"
                min={30}
                max={100}
                value={draft.similarityThreshold}
                onChange={(e) => setDraft({ ...draft, similarityThreshold: Number(e.target.value) })}
              />
            </Field>
          </div>
        )}
      </div>
      <div className="col gap-8">
        <Switch
          checked={draft.aiQuestionsEnabled}
          onChange={(v) => setDraft({ ...draft, aiQuestionsEnabled: v })}
          label="AI đề xuất câu hỏi vấn đáp cho bài có tỉ lệ code AI cao"
        />
        <div className="meta">
          Khi chấm, bài có % code AI (ước lượng) từ ngưỡng trở lên sẽ được AI soạn sẵn ~6 câu hỏi bám vào các đoạn nghi ngờ, để giảng viên hỏi trực tiếp sinh viên.
          Tốn thêm 1 lượt gọi AI cho mỗi bài đạt ngưỡng.
        </div>
        {draft.aiQuestionsEnabled && (
          <div className="form-grid">
            <Field label="Ngưỡng % code AI" hint="Mặc định 60% (mức tín hiệu Cao)">
              <input
                className="input"
                type="number"
                min={0}
                max={100}
                value={draft.aiQuestionsMinPercent}
                onChange={(e) => setDraft({ ...draft, aiQuestionsMinPercent: Number(e.target.value) })}
              />
            </Field>
          </div>
        )}
      </div>
      <div className="divider" />
      <Switch checked={draft.preventSleep} onChange={(v) => setDraft({ ...draft, preventSleep: v })} label="Ngăn Windows chuyển sang Sleep khi đang chấm" />
      <Switch
        checked={draft.anonymizeCloud}
        onChange={(v) => setDraft({ ...draft, anonymizeCloud: v })}
        label="Ẩn họ tên và MSSV khỏi nội dung gửi Cloud AI (thay bằng mã ẩn danh)"
      />
      <div>
        <button className="btn btn-primary" onClick={save}>
          Lưu
        </button>
      </div>
    </div>
  )
}

function Account(): JSX.Element {
  const user = useStore((s) => s.user)
  const setUser = useStore((s) => s.setUser)
  const toast = useStore((s) => s.toast)
  const [username, setUsername] = useState(user?.username ?? '')
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirm, setConfirm] = useState('')
  useEffect(() => {
    setUsername(user?.username ?? '')
    setDisplayName(user?.displayName ?? '')
  }, [user])
  const saveProfile = async (): Promise<void> => {
    const u = await attempt(() => call<User>('auth:updateProfile', username, displayName), 'Đã lưu thông tin tài khoản')
    if (u) setUser(u)
  }
  const savePassword = async (): Promise<void> => {
    if (newPw !== confirm) return toast('Mật khẩu nhập lại không khớp', 'error')
    const u = await attempt(() => call<User>('auth:changePassword', oldPw, newPw), 'Đã đổi mật khẩu')
    if (u) {
      setUser(u)
      setOldPw('')
      setNewPw('')
      setConfirm('')
    }
  }
  return (
    <div className="col gap-16" style={{ maxWidth: 720 }}>
      {user?.defaultPassword && (
        <div className="callout warning">
          <span>Tài khoản đang dùng mật khẩu mặc định. Hãy đổi tên đăng nhập và mật khẩu bên dưới.</span>
        </div>
      )}
      <div className="card">
        <div className="card-title mb-12">Thông tin tài khoản</div>
        <div className="form-grid">
          <Field label="Tên đăng nhập" hint="3–32 ký tự: chữ, số, dấu . _ -">
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} />
          </Field>
          <Field label="Tên hiển thị">
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
        </div>
        <button
          className="btn btn-primary mt-12"
          disabled={!username.trim() || (username === user?.username && displayName === user?.displayName)}
          onClick={saveProfile}
        >
          Lưu thông tin
        </button>
      </div>
      <div className="card">
        <div className="card-title mb-12">Đổi mật khẩu</div>
        <div className="form-grid">
          <Field label="Mật khẩu hiện tại" hint={user?.defaultPassword ? 'Mật khẩu mặc định là admin' : undefined}>
            <input className="input" type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} autoComplete="current-password" />
          </Field>
          <Field label="Mật khẩu mới" hint="Tối thiểu 6 ký tự">
            <input className="input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Nhập lại mật khẩu mới">
            <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
        <button className="btn btn-primary mt-12" disabled={!oldPw || !newPw || !confirm} onClick={savePassword}>
          <KeyRound size={14} /> Đổi mật khẩu
        </button>
      </div>
      <div className="meta">Tài khoản local, offline — mật khẩu lưu dạng hash bcrypt, không lưu bản rõ. Dữ liệu từng giáo viên tách riêng trên cùng máy.</div>
    </div>
  )
}

function DataTab(): JSX.Element {
  const setUser = useStore((s) => s.setUser)
  const [usage, setUsage] = useState<StorageUsage | null>(null)
  const load = (): void => void call<StorageUsage>('system:storage').then(setUsage)
  useEffect(load, [])
  const rows: [string, string, keyof StorageUsage][] = [
    ['data\\app.db', 'Database: tài khoản, assignment, rubric, kết quả', 'data'],
    ['models\\', 'File model GGUF', 'models'],
    ['runtime\\', 'llama-server, MinGW (nếu tải)', 'runtime'],
    ['w\\', 'Thư mục làm việc tạm', 'work'],
    ['logs\\', 'Nhật ký ứng dụng', 'logs']
  ]
  return (
    <div className="col gap-16" style={{ maxWidth: 900 }}>
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <HardDrive size={14} style={{ verticalAlign: -2 }} /> Dung lượng đang dùng
          </span>
          {usage && (
            <a className="meta mono" onClick={() => void call('app:openPath', usage.root)}>
              {usage.root}
            </a>
          )}
        </div>
        <table className="table">
          <tbody>
            {rows.map(([p, label, k]) => (
              <tr key={k}>
                <td className="mono">{p}</td>
                <td className="meta">{label}</td>
                <td className="num">{usage ? fmtBytes(usage[k] as number) : '…'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row mt-12">
          <button
            className="btn btn-sm"
            onClick={async () => {
              await attempt(() => call('system:cleanWork'), 'Đã dọn thư mục tạm')
              load()
            }}
          >
            <Trash2 size={13} /> Dọn thư mục tạm
          </button>
        </div>
        <div className="meta mt-8">Code sinh viên không được chép vào database — app chỉ lưu đường dẫn file zip gốc và kết quả chấm.</div>
      </div>
      <div className="card">
        <div className="card-title mb-8">Sao lưu / Khôi phục</div>
        <div className="meta mb-12">Sao lưu toàn bộ database (tài khoản, assignment, rubric, kết quả chấm) ra một file .msbak.</div>
        <div className="row">
          <button className="btn" onClick={() => void attempt(() => call('system:backup')).then((p) => p && useStore.getState().toast('Đã sao lưu: ' + p, 'success'))}>
            Sao lưu…
          </button>
          <button
            className="btn btn-danger"
            onClick={async () => {
              if (!(await confirmDialog('Khôi phục sẽ thay toàn bộ dữ liệu hiện tại bằng bản sao lưu (bản hiện tại được giữ lại trong thư mục data). Tiếp tục?', { danger: true }))) return
              const ok = await attempt(() => call<boolean>('system:restore'))
              if (ok) {
                useStore.getState().toast('Đã khôi phục dữ liệu. Vui lòng đăng nhập lại.', 'success')
                setUser(null)
              }
            }}
          >
            Khôi phục…
          </button>
        </div>
      </div>
    </div>
  )
}

function Network(): JSX.Element {
  const [log, setLog] = useState<NetLogEntry[]>([])
  const load = (): void => void call<NetLogEntry[]>('system:netlog').then(setLog)
  useEffect(load, [])
  return (
    <div className="col gap-12">
      <div className="callout info">
        <Globe size={16} />
        <div className="col gap-4">
          <span>App chỉ dùng Internet khi bạn chủ động thao tác:</span>
          <span>• Tải model GGUF (Hugging Face) — không gửi dữ liệu sinh viên</span>
          <span>• Tải llama-server / MinGW (GitHub) — không gửi dữ liệu sinh viên</span>
          <span>• Cloud AI — gửi code (đã ẩn tên, MSSV), chỉ với assignment đã bật</span>
          <span>Không telemetry, không gửi log, không tự kiểm tra cập nhật. llama-server chỉ lắng nghe 127.0.0.1.</span>
        </div>
      </div>
      <div className="row">
        <span className="card-title grow">Nhật ký kết nối ra ngoài ({log.length})</span>
        <button className="btn btn-sm" onClick={load}>
          Làm mới
        </button>
        <button
          className="btn btn-sm btn-ghost"
          onClick={async () => {
            await call('system:clearNetlog')
            load()
          }}
        >
          Xoá nhật ký
        </button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Mục đích</th>
              <th>Địa chỉ</th>
              <th>Kết quả</th>
            </tr>
          </thead>
          <tbody>
            {log.map((l) => (
              <tr key={l.id}>
                <td className="meta">{fmtTime(l.ts)}</td>
                <td>{l.purpose}</td>
                <td className="mono truncate selectable" style={{ maxWidth: 420 }} title={l.url}>
                  {l.url}
                </td>
                <td className="mono">{l.status}</td>
              </tr>
            ))}
            {!log.length && (
              <tr>
                <td colSpan={4} className="meta">
                  Chưa có kết nối nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function About(): JSX.Element {
  const [info, setInfo] = useState<{ version: string; platform: string; dataDir: string } | null>(null)
  useEffect(() => void call('app:info').then(setInfo as any), [])
  return (
    <div className="card" style={{ maxWidth: 700 }}>
      <div className="section-title">Master Scoring</div>
      <div className="meta mt-8">Ứng dụng chấm điểm code sinh viên — Java Android, Next.js, C, C++ (mở rộng được).</div>
      <div className="divider" />
      <div className="col gap-4">
        <div>Phiên bản: {info?.version}</div>
        <div>Nền tảng: {info?.platform}</div>
        <div className="mono meta">Dữ liệu: {info?.dataDir}</div>
      </div>
      <div className="divider" />
      <div className="col gap-4 meta">
        <div>
          Phím tắt: <span className="kbd">Ctrl+O</span> chọn folder bài nộp · <span className="kbd">F5</span> chấm lại · <span className="kbd">Ctrl+Enter</span> duyệt & sang SV
          tiếp · <span className="kbd">Alt+←/→</span> SV trước/sau · <span className="kbd">Ctrl+F</span> tìm trong code · <span className="kbd">Ctrl+E</span> xuất báo cáo
        </div>
        <div>Local AI: llama.cpp (MIT) · Model: Qwen2.5-Coder (Apache 2.0)</div>
      </div>
    </div>
  )
}
