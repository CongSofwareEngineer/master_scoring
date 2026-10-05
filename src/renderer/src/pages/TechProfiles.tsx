import { useEffect, useState } from 'react'
import { CheckCircle2, Download, FolderOpen, Layers, Plus, RotateCcw, Save, Trash2, XCircle } from 'lucide-react'
import { BUILTIN_PROFILES } from '@shared/constants'
import type { TechProfile } from '@shared/types'
import { call, on, platform } from '../lib/api'
import { cls } from '../lib/format'
import { useT } from '../lib/i18n'
import { attempt, useStore } from '../lib/store'
import { RubricEditor } from '../components/RubricEditor'
import { confirmDialog, Field, Modal, Progress, Switch } from '../components/ui'

const lines = (s: string): string[] =>
  s
    .split(/\r?\n|,/)
    .map((x) => x.trim())
    .filter(Boolean)

export function TechProfilesPage(): JSX.Element {
  const t = useT()
  const profiles = useStore((s) => s.profiles)
  const loadProfiles = useStore((s) => s.loadProfiles)
  const [selected, setSelected] = useState(profiles[0]?.id ?? 'cpp')
  const [draft, setDraft] = useState<TechProfile | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    const p = profiles.find((x) => x.id === selected)
    setDraft(p ? structuredClone(p) : null)
  }, [selected, profiles])

  const save = async (): Promise<void> => {
    if (!draft) return
    const ok = await attempt(() => call('profiles:save', draft).then(() => true), 'Đã lưu Tech Profile')
    if (ok) await loadProfiles()
  }
  const reset = async (): Promise<void> => {
    if (!draft) return
    const builtin = BUILTIN_PROFILES.some((b) => b.id === draft.id)
    if (!(await confirmDialog(builtin ? 'Khôi phục profile về cấu hình mặc định?' : 'Xoá profile này?', { danger: !builtin }))) return
    await attempt(() => call('profiles:delete', draft.id))
    await loadProfiles()
    if (!builtin) setSelected(profiles[0]?.id ?? 'cpp')
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">{t('Tech Profiles')}</div>
          <div className="meta mt-8">Cấu hình theo công nghệ: cách nhận diện, thư mục bỏ qua, công cụ kiểm tra, rubric mẫu. Thêm profile mới (Python, Flutter...).</div>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setCreating(true)}>
            <Plus size={14} /> Thêm profile
          </button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <div className="card flush" style={{ padding: 6 }}>
          {profiles.map((p) => (
            <div
              key={p.id}
              className={cls('list-row clickable')}
              style={p.id === selected ? { background: 'var(--primary-soft)' } : undefined}
              onClick={() => setSelected(p.id)}
            >
              <Layers size={15} className="text-2" />
              <span className="grow">{p.name}</span>
              {!p.builtin && <span className="meta">tuỳ chỉnh</span>}
            </div>
          ))}
        </div>
        {draft && (
          <div className="col gap-16">
            <div className="card">
              <div className="card-header">
                <span className="section-title">{draft.name}</span>
                <div className="row">
                  <button className="btn btn-ghost btn-sm" onClick={reset}>
                    {draft.builtin ? <RotateCcw size={13} /> : <Trash2 size={13} />} {draft.builtin ? 'Khôi phục mặc định' : 'Xoá'}
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={save}>
                    <Save size={13} /> Lưu
                  </button>
                </div>
              </div>
              <div className="form-grid">
                <Field label="Tên hiển thị">
                  <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </Field>
                <Field label="Mã profile">
                  <input className="input mono" value={draft.id} disabled />
                </Field>
              </div>
              <div className="grid-3 mt-12">
                <Field label="Nhận diện (mỗi dòng 1 mẫu)" hint="Tên file, *.ext, hoặc file:dependency (vd. package.json:next)">
                  <textarea className="textarea mono" rows={7} value={draft.detect.join('\n')} onChange={(e) => setDraft({ ...draft, detect: lines(e.target.value) })} />
                </Field>
                <Field label="Bỏ qua (không giải nén)" hint="thư-mục/, *.ext, tên file">
                  <textarea className="textarea mono" rows={7} value={draft.ignore.join('\n')} onChange={(e) => setDraft({ ...draft, ignore: lines(e.target.value) })} />
                </Field>
                <Field label="Phần mở rộng file mã nguồn" hint="Các file được đọc & đưa cho AI">
                  <textarea
                    className="textarea mono"
                    rows={7}
                    value={draft.extensions.join('\n')}
                    onChange={(e) => setDraft({ ...draft, extensions: lines(e.target.value).map((x) => (x.startsWith('.') ? x : '.' + x)) })}
                  />
                </Field>
              </div>
              <div className="mt-12 col gap-8">
                <div className="meta">Kiểm tra: {draft.checks}</div>
                <Switch
                  checked={draft.buildEnabled}
                  onChange={(v) => setDraft({ ...draft, buildEnabled: v })}
                  label={draft.id === 'c' || draft.id === 'cpp' ? 'Compile & chạy test case' : 'Bật build (cần công cụ cài trên máy)'}
                />
                <div className="meta">{draft.buildNote}</div>
              </div>
            </div>
            {(draft.id === 'c' || draft.id === 'cpp') && <MingwCard />}
            {draft.id === 'android' && <AndroidToolsCard />}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Rubric mẫu</span>
                <span className="meta">Dùng khi tạo assignment mới với profile này</span>
              </div>
              <RubricEditor value={draft.rubric} onChange={(rubric) => setDraft({ ...draft, rubric })} />
            </div>
          </div>
        )}
      </div>
      {creating && (
        <NewProfile
          onClose={() => setCreating(false)}
          onCreated={async (id) => {
            await loadProfiles()
            setSelected(id)
            setCreating(false)
          }}
        />
      )}
    </div>
  )
}

function NewProfile({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }): JSX.Element {
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const create = async (): Promise<void> => {
    const p: TechProfile = {
      id: id.trim().toLowerCase(),
      name: name.trim(),
      builtin: false,
      detect: [],
      ignore: ['build/', 'dist/', '.venv/', '__pycache__/'],
      extensions: ['.txt', '.md'],
      checks: 'Phân tích tĩnh cơ bản + AI',
      buildEnabled: false,
      buildNote: 'Profile tuỳ chỉnh: chấm bằng phân tích tĩnh và AI.',
      rubric: [
        { id: 'requirements', name: 'Đúng yêu cầu đề', max: 5, source: 'ai', description: '' },
        { id: 'structure', name: 'Cấu trúc code', max: 3, source: 'ai', description: '' },
        { id: 'clean_code', name: 'Clean code', max: 2, source: 'ai', description: '' }
      ]
    }
    const ok = await attempt(() => call('profiles:save', p).then(() => true), 'Đã tạo profile')
    if (ok) onCreated(p.id)
  }
  return (
    <Modal
      title="Thêm Tech Profile"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Huỷ
          </button>
          <button className="btn btn-primary" disabled={!id || !name} onClick={create}>
            Tạo
          </button>
        </>
      }
    >
      <div className="col gap-12">
        <Field label="Mã profile (a-z, 0-9, _ -)">
          <input className="input mono" value={id} onChange={(e) => setId(e.target.value)} placeholder="python" autoFocus />
        </Field>
        <Field label="Tên hiển thị">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Python" />
        </Field>
      </div>
    </Modal>
  )
}

function MingwCard(): JSX.Element {
  const [status, setStatus] = useState<{ gcc: string | null; gpp: string | null } | null>(null)
  const [progress, setProgress] = useState<{ message: string; percent?: number } | null>(null)
  const load = (): void => void call('mingw:status').then(setStatus as any)
  useEffect(() => {
    load()
    return on<{ message: string; percent?: number }>('mingw:progress', setProgress)
  }, [])
  const download = async (): Promise<void> => {
    setProgress({ message: 'Bắt đầu tải...' })
    await attempt(() => call('mingw:download'), 'Đã cài MinGW-w64')
    setProgress(null)
    load()
  }
  const pick = async (): Promise<void> => {
    await attempt(() => call('mingw:pick'))
    load()
  }
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Bộ compile gcc / g++ (MinGW-w64)</span>
      </div>
      <div className="col gap-8">
        {status ? (
          <>
            <div className="row">
              {status.gpp ? <CheckCircle2 size={15} className="success" /> : <XCircle size={15} className="error" />}
              <span>g++: </span>
              <span className="mono meta truncate">{status.gpp ?? 'Chưa tìm thấy'}</span>
            </div>
            <div className="row">
              {status.gcc ? <CheckCircle2 size={15} className="success" /> : <XCircle size={15} className="error" />}
              <span>gcc: </span>
              <span className="mono meta truncate">{status.gcc ?? 'Chưa tìm thấy'}</span>
            </div>
          </>
        ) : (
          <span className="meta">Đang kiểm tra…</span>
        )}
        {progress && (
          <div className="col gap-4">
            <span className="meta">{progress.message}</span>
            <Progress value={progress.percent ?? 0} indeterminate={progress.percent === undefined} />
          </div>
        )}
        <div className="row mt-8">
          {platform === 'win32' && (
            <button className="btn btn-sm" disabled={!!progress} onClick={download}>
              <Download size={13} /> Tải MinGW-w64 portable (~250 MB)
            </button>
          )}
          <button className="btn btn-sm" onClick={pick}>
            <FolderOpen size={13} /> Chọn thư mục MinGW có sẵn
          </button>
        </div>
        <div className="meta">App tự tìm gcc/g++ trên máy. Chỉ tải khi có assignment C/C++ — không đóng gói sẵn để bộ cài nhẹ.</div>
      </div>
    </div>
  )
}

function AndroidToolsCard(): JSX.Element {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const pick = async (key: 'androidSdkPath' | 'jdkPath'): Promise<void> => {
    const r = await attempt(() => call<string | null>('settings:pickDir', key))
    if (r) setSettings(await call('settings:get'))
  }
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Công cụ build Android (tuỳ chọn)</span>
      </div>
      <div className="form-grid">
        <Field label="Android SDK">
          <div className="row">
            <input className="input mono" readOnly value={settings?.androidSdkPath ?? ''} placeholder="Chưa chọn" />
            <button className="btn btn-sm" onClick={() => pick('androidSdkPath')}>
              Chọn
            </button>
          </div>
        </Field>
        <Field label="JDK (JAVA_HOME)">
          <div className="row">
            <input className="input mono" readOnly value={settings?.jdkPath ?? ''} placeholder="Chưa chọn" />
            <button className="btn btn-sm" onClick={() => pick('jdkPath')}>
              Chọn
            </button>
          </div>
        </Field>
      </div>
      <div className="meta mt-8">Build dùng Gradle cài trên máy giáo viên (lệnh gradle trong PATH). App không chạy gradlew.bat của sinh viên.</div>
    </div>
  )
}
