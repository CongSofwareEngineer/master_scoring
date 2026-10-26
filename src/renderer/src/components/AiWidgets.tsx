import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Cpu, Download, FolderOpen, Pause, Play, RotateCcw, Upload, XCircle } from 'lucide-react'
import { MODELS } from '@shared/constants'
import type { HardwareInfo, LocalState } from '@shared/types'
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

// Gợi ý URL (chuẩn OpenAI Chat Completions) — giáo viên tự nhập URL khác tuỳ ý
const URL_HINTS = [
  'https://api.deepseek.com/v1',
  'https://openrouter.ai/api/v1',
  'https://api.openai.com/v1',
  'https://generativelanguage.googleapis.com/v1beta/openai',
  'http://localhost:11434/v1'
]

/** Cấu hình Cloud API chung: URL + API key + model (key lưu mã hoá ở main process). */
export function CloudConfigForm(): JSX.Element {
  const t = useT()
  const toast = useStore((s) => s.toast)
  const [url, setUrl] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const load = async (): Promise<void> => {
    const cfg = await call<{ url: string; model: string; hasKey: boolean }>('ai:cloudConfig')
    setUrl(cfg.url)
    setModel(cfg.model)
    setHasKey(cfg.hasKey)
    setApiKey('')
  }
  useEffect(() => {
    void load().catch(() => {})
  }, [])

  const save = async (): Promise<void> => {
    try {
      await call('ai:saveCloud', url, model, apiKey ? apiKey : null)
      toast(t('Đã lưu cấu hình Cloud API'), 'success')
      await load()
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }
  const test = async (): Promise<void> => {
    setTesting(true)
    setResult(null)
    try {
      const out = await call<string>('ai:testCloud', url, model, apiKey ? apiKey : null)
      setResult({ ok: true, msg: `${t('Kết nối thành công · phản hồi:')} "${out}"` })
      await load()
    } catch (e: any) {
      setResult({ ok: false, msg: e.message })
    } finally {
      setTesting(false)
    }
  }
  const removeKey = async (): Promise<void> => {
    await attempt(() => call('ai:saveCloud', url, model, ''), t('Đã xoá API key'))
    await load()
  }
  return (
    <div className="col gap-12">
      <div className="field">
        <label>{t('URL API (chuẩn OpenAI — DeepSeek, OpenRouter, Kilo, OpenCode, 9Router, Ollama…)')}</label>
        <input className="input mono" list="cloud-url-hints" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://.../v1" />
        <datalist id="cloud-url-hints">
          {URL_HINTS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
      </div>
      <div className="form-grid">
        <div className="field">
          <label>Model</label>
          <input className="input mono" value={model} onChange={(e) => setModel(e.target.value)} placeholder={t('vd. deepseek-chat, qwen2.5-coder:7b')} />
        </div>
        <div className="field">
          <label>
            API Key {hasKey && <span className="success">· {t('đã lưu (mã hoá)')}</span>}
          </label>
          <div className="row">
            <input
              className="input mono"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasKey ? t('•••••••• (để trống nếu không đổi)') : t('Nhập API key (bỏ trống nếu API không cần key)')}
            />
            {hasKey && (
              <button className="btn btn-ghost btn-sm" onClick={removeKey}>
                {t('Xoá key')}
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="callout warning">
        <AlertTriangle size={16} />
        <span>{t('Code sinh viên sẽ được gửi tới máy chủ API (đã ẩn họ tên và MSSV). Chỉ dùng cho assignment bạn chọn Cloud API.')}</span>
      </div>
      {result && (
        <div className={'callout ' + (result.ok ? 'info' : 'error')}>
          {result.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          <span style={{ whiteSpace: 'pre-wrap' }}>{result.msg}</span>
        </div>
      )}
      <div className="row">
        <button className="btn" onClick={test} disabled={testing || !url.trim() || !model.trim()}>
          {testing && <span className="spinner" />} {t('Kiểm tra kết nối')}
        </button>
        <button className="btn btn-primary" onClick={save}>
          {t('Lưu')}
        </button>
      </div>
    </div>
  )
}

/** Ô tích "Dùng Cloud API": tích vào thì hiện form URL / API key / model (đã cấu hình → mở sẵn). */
export function CloudApiToggle(): JSX.Element {
  const t = useT()
  const configured = useStore((s) => !!s.ai?.cloudConfigured)
  const [open, setOpen] = useState(configured)
  useEffect(() => {
    if (configured) setOpen(true)
  }, [configured])
  return (
    <div className="col gap-12">
      <label className="check">
        <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />
        <b>{t('Dùng Cloud API')}</b>
        <span className="meta">· {configured ? t('đã cấu hình') : t('nhập URL, API key, model của bất kỳ API chuẩn OpenAI nào')}</span>
      </label>
      {open && <CloudConfigForm />}
    </div>
  )
}
