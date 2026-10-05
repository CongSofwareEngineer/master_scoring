import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Cpu, Download, FolderOpen, Pause, Play, RotateCcw, Upload, XCircle } from 'lucide-react'
import { CLOUD_PROVIDERS, MODELS } from '@shared/constants'
import type { CloudProvider, HardwareInfo, LocalState } from '@shared/types'
import { call } from '../lib/api'
import { fmtBytes, fmtDuration } from '../lib/format'
import { useT } from '../lib/i18n'
import { attempt, useStore } from '../lib/store'
import { Progress } from './ui'

export function useHardware(): [HardwareInfo | null, () => void] {
  const [hw, setHw] = useState<HardwareInfo | null>(null)
  const load = (): void => void call<HardwareInfo>('ai:hardware').then(setHw).catch(() => {})
  useEffect(load, [])
  return [hw, load]
}

export function HardwareLine({ hw }: { hw: HardwareInfo | null }): JSX.Element {
  const t = useT()
  if (!hw) return <span className="meta">…</span>
  return (
    <span className="meta">
      {t('Máy của bạn')}: RAM {Math.round(hw.ramGb)} GB · CPU {hw.cpuCores} nhân · GPU {hw.gpu || '—'}
      {hw.diskFreeGb !== null && ` · Ổ trống ${hw.diskFreeGb.toFixed(1)} GB`}
    </span>
  )
}

/** Hiển thị trạng thái + điều khiển Local AI cho một model. */
export function LocalStatePanel({ modelId, compact }: { modelId: string; compact?: boolean }): JSX.Element {
  const t = useT()
  const ai = useStore((s) => s.ai)
  const refreshAi = useStore((s) => s.refreshAi)
  const local: LocalState | undefined = ai?.local
  const isThis = local && 'modelId' in local && local.modelId === modelId
  const install = (): void => void attempt(async () => {
    await call('ai:install', modelId)
    await refreshAi()
  })

  if (local && isThis && local.kind === 'downloading') {
    return (
      <div className="col gap-4" style={{ width: '100%' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="meta">
            {local.paused ? 'Đã tạm dừng' : t('Đang tải')} · {local.percent.toFixed(1)}%
            {!local.paused && local.speed > 0 && ` · ${fmtBytes(local.speed)}/s · còn ${fmtDuration(local.remainingSec)}`}
          </span>
          {local.paused ? (
            <button className="btn btn-sm" onClick={install}>
              <Play size={13} /> {t('Tiếp tục')}
            </button>
          ) : (
            <button className="btn btn-sm" onClick={() => void call('ai:pauseDownload')}>
              <Pause size={13} /> {t('Tạm dừng')}
            </button>
          )}
        </div>
        <Progress value={local.percent} />
      </div>
    )
  }
  if (local && isThis && local.kind === 'verifying') {
    return (
      <div className="col gap-4" style={{ width: '100%' }}>
        <span className="meta">{t('Đang kiểm tra file')} (SHA-256)…</span>
        <Progress value={0} indeterminate />
      </div>
    )
  }
  if (local && isThis && local.kind === 'starting') {
    return (
      <div className="col gap-4" style={{ width: '100%' }}>
        <span className="meta">{t('Đang khởi động')} llama-server…</span>
        <Progress value={0} indeterminate />
      </div>
    )
  }
  if (local && isThis && local.kind === 'ready') {
    return (
      <div className="row">
        <CheckCircle2 size={16} className="success" />
        <span>
          {t('Sẵn sàng')} <span className="meta">· {local.variant} · 127.0.0.1:{local.port}</span>
        </span>
      </div>
    )
  }
  if (local && local.kind === 'error' && (local.modelId === modelId || !local.modelId)) {
    return (
      <div className="col gap-8" style={{ width: '100%' }}>
        <div className="callout error">
          <XCircle size={16} />
          <span style={{ whiteSpace: 'pre-wrap' }}>{local.message}</span>
        </div>
        <div>
          <button className="btn btn-sm" onClick={install}>
            <RotateCcw size={13} /> {t('Thử lại')}
          </button>
        </div>
      </div>
    )
  }
  return (
    <button className={compact ? 'btn btn-sm btn-primary' : 'btn btn-primary btn-lg'} onClick={install}>
      <Download size={15} /> {t('Tải & Sử dụng')}
    </button>
  )
}

export function LocalAiSetupCard(): JSX.Element {
  const t = useT()
  const [hw, reloadHw] = useHardware()
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const refreshAi = useStore((s) => s.refreshAi)
  const m = MODELS[0]
  const changeDir = async (): Promise<void> => {
    const dir = await attempt(() => call<string | null>('ai:changeModelsDir'))
    if (dir) {
      setSettings(await call('settings:get'))
      reloadHw()
    }
  }
  const importFile = async (): Promise<void> => {
    const ok = await attempt(() => call<boolean>('ai:importModel', m.id), undefined)
    if (ok) {
      useStore.getState().toast('Đã nhập model, đang khởi động Local AI…', 'success')
      await call('ai:switch', m.id).catch((e) => useStore.getState().toast(e.message, 'error'))
      await refreshAi()
    }
  }
  return (
    <div className="choice-card selected">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <span className="dot" style={{ background: 'var(--primary)', width: 10, height: 10 }} />
          <span className="card-title">Local AI</span>
          <span className="badge" style={{ color: '#a5b4fc' }}>
            {t('Khuyến nghị')}
          </span>
        </div>
        <Cpu size={18} className="text-2" />
      </div>
      <div className="meta mt-8">{t('Code sinh viên không rời khỏi máy')}</div>
      <div className="divider" />
      <div className="col gap-4">
        <div>
          Model: <b>{m.name}</b> <span className="meta">({m.quant})</span>
        </div>
        <div className="meta">
          {t('Dung lượng')}: {m.sizeLabel} · Phù hợp máy từ 8 GB RAM · Có thể đổi model mạnh hơn trong Settings → AI Models
        </div>
        <HardwareLine hw={hw} />
        <div className="row meta" style={{ marginTop: 2 }}>
          <FolderOpen size={13} />
          <span className="truncate mono" style={{ maxWidth: 420 }} title={settings?.modelsDir}>
            {t('Lưu tại')}: {settings?.modelsDir}
          </span>
          <a onClick={changeDir}>[{t('Đổi')}]</a>
        </div>
      </div>
      <div className="mt-16 row wrap" style={{ justifyContent: 'space-between' }}>
        <LocalStatePanel modelId={m.id} />
        <a className="meta row gap-4" onClick={importFile} title="Dùng file đã tải sẵn (USB, ổ mạng nội bộ)">
          <Upload size={13} /> {t('Nhập file model (.gguf)')}
        </a>
      </div>
    </div>
  )
}

/** Cấu hình một nhà cung cấp Cloud AI (key lưu bằng DPAPI ở main process). */
export function CloudConfigForm({ initialProvider = 'gemini' }: { initialProvider?: CloudProvider }): JSX.Element {
  const t = useT()
  const toast = useStore((s) => s.toast)
  const [provider, setProvider] = useState<CloudProvider>(initialProvider)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [url, setUrl] = useState('')
  const [configured, setConfigured] = useState<CloudProvider[]>([])
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const load = async (): Promise<void> => {
    const cfg = await call<{ compatibleUrl: string; models: Partial<Record<CloudProvider, string>>; configured: CloudProvider[] }>('ai:cloudConfig')
    setConfigured(cfg.configured)
    setModel(cfg.models[provider] || CLOUD_PROVIDERS[provider].defaultModel)
    setUrl(cfg.compatibleUrl)
    setApiKey('')
    setResult(null)
  }
  useEffect(() => {
    void load().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider])

  const save = async (): Promise<void> => {
    try {
      await call('ai:saveCloud', provider, apiKey ? apiKey : null, model, provider === 'compatible' ? url : undefined)
      toast('Đã lưu cấu hình Cloud AI', 'success')
      await load()
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }
  const test = async (): Promise<void> => {
    setTesting(true)
    setResult(null)
    try {
      const out = await call<string>('ai:testCloud', provider, apiKey ? apiKey : null, model, provider === 'compatible' ? url : undefined)
      setResult({ ok: true, msg: `Kết nối thành công · phản hồi: "${out}"` })
      await load()
    } catch (e: any) {
      setResult({ ok: false, msg: e.message })
    } finally {
      setTesting(false)
    }
  }
  const removeKey = async (): Promise<void> => {
    await attempt(() => call('ai:saveCloud', provider, '', model), 'Đã xoá API key')
    await load()
  }
  const isConfigured = configured.includes(provider)
  return (
    <div className="col gap-12">
      <div className="form-grid">
        <div className="field">
          <label>{t('Nhà cung cấp')}</label>
          <select className="select" value={provider} onChange={(e) => setProvider(e.target.value as CloudProvider)}>
            {(Object.keys(CLOUD_PROVIDERS) as CloudProvider[]).map((p) => (
              <option key={p} value={p}>
                {CLOUD_PROVIDERS[p].name}
                {configured.includes(p) ? ' ✓' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Model</label>
          <input className="input" list={'models-' + provider} value={model} onChange={(e) => setModel(e.target.value)} placeholder="Tên model" />
          <datalist id={'models-' + provider}>
            {CLOUD_PROVIDERS[provider].models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
      </div>
      {provider === 'compatible' && (
        <div className="field">
          <label>Base URL (chuẩn OpenAI, ví dụ http://192.168.1.10:8000/v1)</label>
          <input className="input mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://.../v1" />
        </div>
      )}
      <div className="field">
        <label>API Key {isConfigured && <span className="success">· đã lưu (mã hoá DPAPI)</span>}</label>
        <div className="row">
          <input
            className="input mono"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={isConfigured ? '•••••••••••• (để trống nếu không đổi)' : 'Nhập API key'}
          />
          {isConfigured && (
            <button className="btn btn-ghost btn-sm" onClick={removeKey}>
              Xoá key
            </button>
          )}
        </div>
      </div>
      <div className="callout warning">
        <AlertTriangle size={16} />
        <span>Code sinh viên sẽ được gửi tới máy chủ của nhà cung cấp (đã ẩn họ tên và MSSV). Chỉ dùng cho assignment bạn bật Cloud AI.</span>
      </div>
      {result && (
        <div className={'callout ' + (result.ok ? 'info' : 'error')}>
          {result.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          <span style={{ whiteSpace: 'pre-wrap' }}>{result.msg}</span>
        </div>
      )}
      <div className="row">
        <button className="btn" onClick={test} disabled={testing || (!apiKey && !isConfigured && provider !== 'compatible')}>
          {testing && <span className="spinner" />} {t('Kiểm tra kết nối')}
        </button>
        <button className="btn btn-primary" onClick={save}>
          Lưu
        </button>
      </div>
    </div>
  )
}
