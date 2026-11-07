import { useEffect, useMemo, useRef, useState } from 'react'
import { Baby, Download, Pause, Pencil, Save, Square, Trash2, User, UserRound, Volume2 } from 'lucide-react'
import { TTS_MAX_CHARS } from '@shared/constants'
import type { TtsDownloadEvent, TtsModelInfo, TtsRequest, TtsResult, TtsVoice } from '@shared/types'
import { call, on } from '../lib/api'
import { cls, fmtBytes } from '../lib/format'
import { useT } from '../lib/i18n'
import { attempt, useStore } from '../lib/store'
import { confirmDialog, Field, Progress } from '../components/ui'

const VOICES: { id: TtsVoice; label: string; icon: typeof User }[] = [
  { id: 'male', label: 'Nam', icon: User },
  { id: 'female', label: 'Nữ', icon: UserRound },
  { id: 'child', label: 'Trẻ em', icon: Baby }
]

const PREF_KEY = 'ms:tts'

interface Prefs {
  modelId: string
  voice: TtsVoice
  speed: number
  pitch: number
  speakers: Record<string, number> // người đọc đã chọn theo model (-1 = tự chọn theo giọng)
}

function loadPrefs(): Prefs {
  const def: Prefs = { modelId: 'mms-tts-vie', voice: 'female', speed: 1, pitch: 0, speakers: {} }
  try {
    return { ...def, ...(JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') as Partial<Prefs>) }
  } catch {
    return def
  }
}

function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p))
  } catch {
    /* bỏ qua */
  }
}

export function TextToSpeechPage(): JSX.Element {
  const t = useT()
  const userId = useStore((s) => s.user?.id)
  const [models, setModels] = useState<TtsModelInfo[]>([])
  const [downloading, setDownloading] = useState<string | null>(null)
  const [dl, setDl] = useState<TtsDownloadEvent | null>(null)
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<Omit<TtsResult, 'wav'> | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [editRepo, setEditRepo] = useState<{ id: string; value: string } | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  const reload = (): void =>
    void call<{ models: TtsModelInfo[]; downloading: string | null }>('tts:models').then((r) => {
      setModels(r.models)
      setDownloading(r.downloading)
    })

  useEffect(reload, [])
  useEffect(() => savePrefs(prefs), [prefs])
  useEffect(
    () =>
      on<TtsDownloadEvent>('tts:download', (e) => {
        setDl(e)
        if (e.phase === 'downloading' || e.phase === 'verifying') setDownloading(e.modelId)
        else {
          setDownloading(null)
          if (e.phase === 'error') useStore.getState().toast(e.message ?? t('Tải model thất bại'), 'error')
          if (e.phase === 'done') useStore.getState().toast(t('Đã tải xong model'), 'success')
          reload()
        }
      }),
    []
  )
  useEffect(
    () =>
      on<{ userId: number; done: number; total: number }>('tts:progress', (p) => {
        if (p.userId === userId) setProgress({ done: p.done, total: p.total })
      }),
    [userId]
  )
  useEffect(() => () => void (audioUrl && URL.revokeObjectURL(audioUrl)), [audioUrl])

  const model = models.find((m) => m.id === prefs.modelId)
  const set = (patch: Partial<Prefs>): void => setPrefs((p) => ({ ...p, ...patch }))
  // Model đã chọn trước đây không còn trong danh sách (vd. đã bỏ khỏi app) → chọn model đầu
  useEffect(() => {
    if (models.length && !model) set({ modelId: models[0].id })
  }, [models, model])
  const speakerId = prefs.speakers?.[prefs.modelId] ?? -1
  const multiSpeaker = !!model && model.speakers.length > 1

  const generate = async (): Promise<void> => {
    if (!text.trim() || busy) return
    setBusy(true)
    setProgress(null)
    try {
      const req: TtsRequest = {
        text,
        modelId: prefs.modelId,
        voice: prefs.voice,
        speed: prefs.speed,
        pitch: prefs.pitch,
        speaker: multiSpeaker ? speakerId : undefined
      }
      const r = await attempt(() => call<TtsResult>('tts:synthesize', req))
      if (!r) return
      const { wav, ...info } = r
      setResult(info)
      setAudioUrl(URL.createObjectURL(new Blob([wav as Uint8Array<ArrayBuffer>], { type: 'audio/wav' })))
      setTimeout(() => void audioRef.current?.play().catch(() => {}), 50)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const download = (id: string): void => {
    setDl(null)
    void attempt(() => call('tts:download', id)).then((ok) => ok && setDownloading(id))
  }
  const remove = async (m: TtsModelInfo): Promise<void> => {
    if (!(await confirmDialog(t('Xoá model {name}?').replace('{name}', m.name), { danger: true }))) return
    const r = await attempt(() => call<TtsModelInfo[]>('tts:delete', m.id), t('Đã xoá model'))
    if (r) setModels(r)
  }
  const saveRepo = async (): Promise<void> => {
    if (!editRepo) return
    const r = await attempt(() => call<TtsModelInfo[]>('tts:setRepo', editRepo.id, editRepo.value))
    if (r) {
      setModels(r)
      setEditRepo(null)
    }
  }

  const chars = text.length
  const canGenerate = !!model?.installed && !!text.trim() && chars <= TTS_MAX_CHARS && !busy
  const pct = useMemo(() => (progress && progress.total ? (progress.done / progress.total) * 100 : 0), [progress])

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">{t('Chuyển văn bản thành giọng nói')}</div>
          <div className="meta mt-8">{t('Đọc văn bản tiếng Việt bằng model VITS / Piper chạy ngay trên máy — không gửi văn bản ra ngoài.')}</div>
        </div>
      </div>

      <div className="tts-grid">
        <div className="card">
          <Field label={t('Văn bản')} hint={`${chars.toLocaleString()} / ${TTS_MAX_CHARS.toLocaleString()} ${t('ký tự')}`}>
            <textarea
              className="textarea"
              rows={10}
              value={text}
              maxLength={TTS_MAX_CHARS}
              placeholder={t('Nhập hoặc dán văn bản tiếng Việt cần đọc…')}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') void generate()
              }}
            />
          </Field>

          <div className="tts-options mt-12">
            <Field label={t('Giọng')}>
              <div className="seg-toggle tts-voice">
                {VOICES.map((v) => (
                  <button key={v.id} className={cls(prefs.voice === v.id && 'active')} onClick={() => set({ voice: v.id })}>
                    <v.icon size={14} /> {t(v.label)}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={`${t('Tốc độ')} · ${prefs.speed.toFixed(2)}×`}>
              <input type="range" min={0.5} max={2} step={0.05} value={prefs.speed} onChange={(e) => set({ speed: Number(e.target.value) })} />
            </Field>
            <Field label={`${t('Tinh chỉnh cao độ')} · ${prefs.pitch > 0 ? '+' : ''}${prefs.pitch}`}>
              <input type="range" min={-6} max={6} step={1} value={prefs.pitch} onChange={(e) => set({ pitch: Number(e.target.value) })} />
            </Field>
            <Field label={t('Model')}>
              <select className="select" value={prefs.modelId} onChange={(e) => set({ modelId: e.target.value })}>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.installed ? '' : ` (${t('chưa tải')})`}
                  </option>
                ))}
              </select>
            </Field>
            {multiSpeaker && model && (
              <Field label={t('Người đọc')}>
                <select
                  className="select"
                  value={speakerId}
                  onChange={(e) => set({ speakers: { ...prefs.speakers, [model.id]: Number(e.target.value) } })}
                >
                  <option value={-1}>{t('Tự chọn theo giọng Nam / Nữ')}</option>
                  {model.speakers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {t(s.name)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>

          {model && !model.installed && (
            <div className="callout warning mt-12">{t('Model này chưa được tải — tải ở danh sách model bên phải trước khi đọc.')}</div>
          )}

          <div className="row mt-12 wrap">
            <button className="btn btn-primary" disabled={!canGenerate} onClick={() => void generate()}>
              <Volume2 size={14} /> {busy ? t('Đang tạo giọng nói…') : t('Đọc văn bản')}
            </button>
            {busy && (
              <button className="btn" onClick={() => void call('tts:cancel')}>
                <Square size={14} /> {t('Dừng')}
              </button>
            )}
            <span className="meta">Ctrl+Enter</span>
          </div>
          {busy && (
            <div className="mt-12">
              <Progress value={pct} indeterminate={!progress} />
              {progress && (
                <div className="meta mt-8">
                  {t('Đang đọc đoạn {done}/{total}').replace('{done}', String(Math.min(progress.done + 1, progress.total))).replace('{total}', String(progress.total))}
                </div>
              )}
            </div>
          )}

          {audioUrl && result && (
            <div className="tts-player mt-16">
              <audio ref={audioRef} src={audioUrl} controls />
              <div className="row wrap" style={{ justifyContent: 'space-between' }}>
                <span className="meta">
                  {result.speaker ? `${t(result.speaker)} · ` : ''}
                  {result.durationSec.toFixed(1)} s · {result.sampleRate / 1000} kHz · {t('tạo trong {s} s').replace('{s}', (result.elapsedMs / 1000).toFixed(1))}
                  {result.baseF0 ? ` · ${t('cao độ gốc')} ${result.baseF0} Hz × ${result.pitchFactor}` : ''}
                </span>
                <button className="btn btn-sm" onClick={() => void attempt(() => call<string | null>('tts:save')).then((p) => p && useStore.getState().toast(t('Đã lưu') + ': ' + p, 'success'))}>
                  <Save size={14} /> {t('Lưu file .wav')}
                </button>
              </div>
              {result.skipped.length > 0 && (
                <div className="meta mt-8">
                  {t('Ký tự / từ model không đọc được (đã bỏ qua)')}: {result.skipped.join(' ')}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title mb-12">{t('Model hỗ trợ sẵn')}</div>
          <div className="col gap-12">
            {models.map((m) => {
              const isDl = downloading === m.id
              const ev = dl && dl.modelId === m.id ? dl : null
              return (
                <div key={m.id} className={cls('choice-card', prefs.modelId === m.id && 'selected')} onClick={() => set({ modelId: m.id })}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="card-title truncate">{m.name}</span>
                    <span className={cls('badge', m.installed ? 'success' : '')}>{m.installed ? t('Đã tải') : t('Chưa tải')}</span>
                  </div>
                  <div className="meta mt-8">{t(m.note)}</div>
                  <div className="meta mt-8 mono truncate">
                    {t('Repo')}: {m.repo || <i>{t('(chưa có)')}</i>}
                    {m.installed && m.bytes ? ` · ${fmtBytes(m.bytes)}` : m.sizeLabel ? ` · ${m.sizeLabel}` : ''}
                    {m.license ? ` · ${m.license}` : ''}
                  </div>
                  {m.installed && m.installedRepo && m.installedRepo !== m.repo && (
                    <div className="meta mt-8">{t('Bản đang cài tải từ')} {m.installedRepo}</div>
                  )}

                  {editRepo?.id === m.id && (
                    <div className="row mt-8" onClick={(e) => e.stopPropagation()}>
                      <input
                        className="input input-sm grow mono"
                        autoFocus
                        placeholder="owner/ten-model"
                        value={editRepo.value}
                        onChange={(e) => setEditRepo({ id: m.id, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void saveRepo()
                          if (e.key === 'Escape') setEditRepo(null)
                        }}
                      />
                      <button className="btn btn-sm btn-primary" onClick={() => void saveRepo()}>
                        {t('Lưu')}
                      </button>
                      <button className="btn btn-sm" onClick={() => setEditRepo(null)}>
                        {t('Huỷ')}
                      </button>
                    </div>
                  )}

                  {isDl && (
                    <div className="mt-8">
                      <Progress value={ev?.percent ?? 0} indeterminate={!ev || ev.phase === 'verifying'} />
                      <div className="meta mt-8">
                        {ev?.phase === 'verifying'
                          ? t('Đang kiểm tra SHA-256…')
                          : ev && ev.total
                            ? `${fmtBytes(ev.received)} / ${fmtBytes(ev.total)} (${ev.percent.toFixed(0)}%)`
                            : t('Đang chuẩn bị tải…')}
                      </div>
                    </div>
                  )}

                  <div className="row mt-8 wrap" onClick={(e) => e.stopPropagation()}>
                    {isDl ? (
                      <button className="btn btn-sm" onClick={() => void call('tts:pause')}>
                        <Pause size={14} /> {t('Tạm dừng')}
                      </button>
                    ) : (
                      <button className="btn btn-sm" disabled={!!downloading || !m.repo} onClick={() => download(m.id)}>
                        <Download size={14} /> {m.installed ? t('Tải lại') : m.partial ? t('Tải tiếp') : t('Tải')}
                      </button>
                    )}
                    <button className="btn btn-sm btn-ghost" disabled={isDl} onClick={() => setEditRepo({ id: m.id, value: m.repo })}>
                      <Pencil size={14} /> {t('Sửa repo')}
                    </button>
                    {(m.installed || m.partial > 0) && (
                      <button className="btn btn-sm btn-ghost" disabled={isDl} onClick={() => void remove(m)}>
                        <Trash2 size={14} /> {t('Xoá')}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="meta mt-12">
            {t('Sửa repo nhận owner/ten-model hoặc owner/ten-model/duong-dan/file.onnx. Hỗ trợ 2 định dạng ONNX: VITS transformers.js (onnx/model.onnx + vocab.json + config.json) và Piper tiếng Việt (<tên>.onnx + <tên>.onnx.json). Repo chỉ có .safetensors / .pth không chạy được. Giọng Nam / Nữ / Trẻ em: model nhiều giọng chọn người đọc nam / nữ, sau đó đổi cao độ tới mức của giọng.')}
          </div>
        </div>
      </div>
    </div>
  )
}
