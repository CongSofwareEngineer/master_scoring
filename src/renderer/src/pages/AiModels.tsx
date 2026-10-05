import { useEffect, useState } from 'react'
import { CheckCircle2, Cloud, Cpu, FolderOpen, HardDrive, Play, Power, RotateCcw, Trash2, Upload } from 'lucide-react'
import type { AppSettings, ModelInfo } from '@shared/types'
import { call, platform } from '../lib/api'
import { fmtBytes } from '../lib/format'
import { useT } from '../lib/i18n'
import { attempt, useStore } from '../lib/store'
import { CloudConfigForm, HardwareLine, LocalStatePanel, useHardware } from '../components/AiWidgets'
import { confirmDialog, Field, localStateView } from '../components/ui'

export function AiModelsPage(): JSX.Element {
  const t = useT()
  const ai = useStore((s) => s.ai)
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const refreshAi = useStore((s) => s.refreshAi)
  const [models, setModels] = useState<(ModelInfo & { partial: number })[]>([])
  const [hw, reloadHw] = useHardware()
  const [runtime, setRuntime] = useState<Partial<AppSettings>>({})

  const loadModels = (): void => void call<(ModelInfo & { partial: number })[]>('ai:models').then(setModels)
  useEffect(loadModels, [ai?.local.kind, settings?.modelsDir])
  useEffect(() => {
    if (settings) setRuntime({ llamaVariant: settings.llamaVariant, contextSize: settings.contextSize, threads: settings.threads, gpuLayers: settings.gpuLayers })
  }, [settings])

  const view = localStateView(ai?.local)
  const activeId = ai?.activeModelId
  const saveRuntime = async (): Promise<void> => {
    const r = await attempt(() => call<AppSettings>('settings:update', runtime), 'Đã lưu, đang khởi động lại Local AI…')
    if (r) {
      setSettings(r)
      await attempt(() => call('ai:restart'))
      await refreshAi()
    }
  }
  const changeDir = async (): Promise<void> => {
    const d = await attempt(() => call<string | null>('ai:changeModelsDir'))
    if (d) {
      setSettings(await call('settings:get'))
      reloadHw()
      await refreshAi()
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">{t('AI Models')}</div>
          <div className="meta mt-8">Local AI là backend mặc định — chạy llama-server trên máy, chỉ lắng nghe 127.0.0.1, không cần mạng sau khi tải model.</div>
        </div>
        <div className="actions">
          {ai?.local.kind === 'ready' ? (
            <button className="btn" onClick={() => void attempt(() => call('ai:stop')).then(refreshAi)}>
              <Power size={14} /> Dừng Local AI
            </button>
          ) : (
            <button className="btn" onClick={() => void attempt(() => call('ai:start')).then(refreshAi)}>
              <Play size={14} /> Khởi động Local AI
            </button>
          )}
        </div>
      </div>

      <div className="card mb-12">
        <div className="row wrap" style={{ justifyContent: 'space-between' }}>
          <div className="row">
            <span className="dot" style={{ background: view.color, width: 10, height: 10 }} />
            <span className="card-title">{t(view.label)}</span>
          </div>
          <HardwareLine hw={hw} />
        </div>
        {ai?.local.kind === 'error' && <div className="callout error mt-12" style={{ whiteSpace: 'pre-wrap' }}>{ai.local.message}</div>}
        {!ai?.runtimeAvailable && (
          <div className="callout warning mt-12">
            <span>Chưa có llama-server trong bộ cài. App sẽ tự tải từ GitHub (llama.cpp) khi khởi động Local AI lần đầu.{platform === 'darwin' && ' Hoặc cài sẵn bằng: brew install llama.cpp'}</span>
          </div>
        )}
      </div>

      <div className="col gap-12">
        {models.map((m) => (
          <div key={m.id} className={'choice-card' + (activeId === m.id ? ' selected' : '')}>
            <div className="row wrap" style={{ justifyContent: 'space-between' }}>
              <div className="row">
                <Cpu size={16} className="text-2" />
                <span className="card-title">{m.name}</span>
                <span className="meta">Q4_K_M · {m.sizeLabel}</span>
                {activeId === m.id && <span className="badge" style={{ color: '#a5b4fc' }}>Đang dùng</span>}
                {m.installed && (
                  <span className="badge">
                    <CheckCircle2 size={12} className="success" /> Đã tải
                  </span>
                )}
              </div>
              <div className="row">
                {m.installed && activeId !== m.id && (
                  <button className="btn btn-sm btn-primary" onClick={() => void attempt(() => call('ai:switch', m.id)).then(refreshAi)}>
                    Dùng model này
                  </button>
                )}
                <button
                  className="btn btn-sm btn-ghost"
                  title="Nhập file model (.gguf) đã tải sẵn"
                  onClick={async () => {
                    const ok = await attempt(() => call<boolean>('ai:importModel', m.id))
                    if (ok) {
                      useStore.getState().toast('Đã nhập model', 'success')
                      loadModels()
                    }
                  }}
                >
                  <Upload size={13} /> Nhập .gguf
                </button>
                {(m.installed || m.partial > 0) && (
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={async () => {
                      if (!(await confirmDialog(`Xoá model ${m.name} khỏi máy?`, { danger: true, okLabel: 'Xoá' }))) return
                      await attempt(() => call('ai:deleteModel', m.id), 'Đã xoá model')
                      loadModels()
                      await refreshAi()
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
            <div className="meta mt-8">{m.note}</div>
            {m.partial > 0 && !m.installed && <div className="meta">Đã tải dở {fmtBytes(m.partial)} — bấm Tải để tiếp tục phần còn lại.</div>}
            {(!m.installed || activeId === m.id) && (
              <div className="mt-12">
                <LocalStatePanel modelId={m.id} compact />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid-2 mt-16" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Cấu hình chạy Local AI</span>
          </div>
          <div className="form-grid">
            {platform === 'darwin' ? (
              <Field label="Bản llama-server" hint="macOS: Apple Silicon tự dùng GPU qua Metal, máy Intel chạy CPU">
                <input className="input" readOnly value="macOS (CPU + Metal)" />
              </Field>
            ) : (
              <Field label="Bản llama-server" hint="Tự động: có GPU rời → Vulkan (đưa model lên GPU), còn lại CPU">
                <select className="select" value={runtime.llamaVariant} onChange={(e) => setRuntime({ ...runtime, llamaVariant: e.target.value as AppSettings['llamaVariant'] })}>
                  <option value="auto">Tự động</option>
                  <option value="cpu">CPU (tự chọn AVX2 / máy đời cũ)</option>
                  <option value="vulkan">GPU Vulkan (NVIDIA / AMD / Intel)</option>
                </select>
              </Field>
            )}
            <Field label="Context (token)" hint="Lớn hơn tốn RAM hơn; bài vượt context được tóm tắt từng file">
              <select className="select" value={runtime.contextSize} onChange={(e) => setRuntime({ ...runtime, contextSize: Number(e.target.value) })}>
                {[4096, 8192, 12288, 16384, 32768].map((n) => (
                  <option key={n} value={n}>
                    {n / 1024}K{n === 8192 ? ' (mặc định)' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Số luồng CPU" hint="0 = tự động">
              <input className="input" type="number" min={0} max={64} value={runtime.threads} onChange={(e) => setRuntime({ ...runtime, threads: Number(e.target.value) })} />
            </Field>
            <Field label="Số layer đưa lên GPU" hint="-1 = tự động (Vulkan / Metal), 0 = chỉ CPU">
              <input className="input" type="number" min={-1} max={200} value={runtime.gpuLayers} onChange={(e) => setRuntime({ ...runtime, gpuLayers: Number(e.target.value) })} />
            </Field>
          </div>
          <div className="row mt-12" style={{ justifyContent: 'space-between' }}>
            <div className="row meta">
              <HardDrive size={13} />
              <span className="mono truncate" style={{ maxWidth: 300 }} title={settings?.modelsDir}>
                {settings?.modelsDir}
              </span>
              <a onClick={changeDir}>
                <FolderOpen size={12} /> Đổi
              </a>
            </div>
            <button className="btn btn-primary btn-sm" onClick={saveRuntime}>
              <RotateCcw size={13} /> Lưu & khởi động lại
            </button>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <Cloud size={14} style={{ verticalAlign: -2 }} /> Cloud AI (tuỳ chọn)
            </span>
          </div>
          <div className="meta mb-12">Tắt mặc định. Chỉ dùng cho assignment bạn bật Cloud AI riêng. API key lưu bằng Windows DPAPI.</div>
          <CloudConfigForm />
        </div>
      </div>
    </div>
  )
}
