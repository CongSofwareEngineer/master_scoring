// TTS từ file: mở file → xem trước cách tách dòng (sửa / bỏ chọn / nghe thử) → chọn thư mục → xuất voice1.wav, voice2.wav…
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileText, FolderOpen, Loader2, Play, Square, Upload, XCircle } from 'lucide-react'
import { TTS_MAX_CHARS } from '@shared/constants'
import type { TtsBatchEvent, TtsBatchSummary, TtsFileLine, TtsFileParse, TtsLineSkip, TtsRequest, TtsResult } from '@shared/types'
import { call, on } from '../lib/api'
import { cls } from '../lib/format'
import { useT } from '../lib/i18n'
import { attempt, useStore } from '../lib/store'
import { Progress, Switch } from '../components/ui'

interface Row extends TtsFileLine {
  checked: boolean
}

interface RowStatus {
  n: number // số file đã xuất cho dòng này
  status: TtsBatchEvent['status']
  message?: string
  durationSec?: number
}

const SKIP_LABEL: Record<TtsLineSkip, string> = {
  empty: 'Dòng trống',
  symbols: 'Chỉ có ký hiệu, không có chữ',
  markup: 'Chỉ là ký hiệu định dạng'
}

export function TtsBatchPanel(props: { base: Omit<TtsRequest, 'text'>; ready: boolean }): JSX.Element {
  const t = useT()
  const userId = useStore((s) => s.user?.id)
  const [file, setFile] = useState<Omit<TtsFileParse, 'lines'> | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [showSkipped, setShowSkipped] = useState(false)
  const [folder, setFolder] = useState<string | null>(null)
  const [status, setStatus] = useState<Record<number, RowStatus>>({}) // theo vị trí dòng trong `rows`
  const [running, setRunning] = useState(false)
  const [summary, setSummary] = useState<TtsBatchSummary | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [warn, setWarn] = useState<string[][]>([])
  const [playing, setPlaying] = useState<{ idx: number; url: string; label: string } | null>(null)
  const [loadingIdx, setLoadingIdx] = useState<number | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const nToIdx = useRef(new Map<number, number>())

  useEffect(() => void call<string | null>('tts:batchFolder').then(setFolder), [])
  useEffect(
    () =>
      on<TtsBatchEvent>('tts:batch', (e) => {
        if (e.userId !== userId) return
        const idx = nToIdx.current.get(e.n)
        if (idx === undefined) return
        setStatus((s) => ({ ...s, [idx]: { n: e.n, status: e.status, message: e.message, durationSec: e.durationSec } }))
      }),
    [userId]
  )
  useEffect(() => () => void (playing && URL.revokeObjectURL(playing.url)), [playing])

  // Số file theo thứ tự các dòng được chọn: voice1, voice2… (liền mạch, không nhảy số)
  const numbers = useMemo(() => {
    const out: (number | null)[] = []
    let n = 0
    for (const r of rows) out.push(!r.skip && r.checked ? ++n : null)
    return out
  }, [rows])
  const total = numbers.filter((n) => n !== null).length
  const keptCount = rows.filter((r) => !r.skip).length
  const skippedCount = rows.length - keptCount

  // Cảnh báo từ model không đọc được (Piper) — kiểm tra lại khi đổi model / sửa chữ
  const keptTexts = useMemo(() => rows.map((r) => (r.skip ? '' : r.text)), [rows])
  useEffect(() => {
    if (!rows.length) return setWarn([])
    const h = setTimeout(
      () =>
        void call<string[][]>('tts:checkLines', props.base.modelId, keptTexts)
          .then(setWarn)
          .catch(() => setWarn([])),
      300
    )
    return () => clearTimeout(h)
  }, [keptTexts, props.base.modelId])

  const openFile = async (): Promise<void> => {
    const r = await attempt(() => call<TtsFileParse | null>('tts:openFile'))
    if (!r) return
    const { lines, ...info } = r
    setFile(info)
    setRows(lines.map((l) => ({ ...l, checked: !l.skip && l.text.length <= TTS_MAX_CHARS })))
    setStatus({})
    setSummary(null)
    setEditing(null)
  }

  const update = (idx: number, patch: Partial<Row>, resetAll = false): void => {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
    // Đổi chọn → số file các dòng sau thay đổi → bỏ trạng thái đã xuất; sửa chữ → chỉ bỏ trạng thái dòng đó
    setStatus((s) => {
      if (resetAll) return {}
      const { [idx]: _drop, ...rest } = s
      return rest
    })
  }
  const setAll = (checked: boolean): void => {
    setRows((rs) => rs.map((r) => (r.skip ? r : { ...r, checked: checked && r.text.length <= TTS_MAX_CHARS })))
    setStatus({})
  }

  const play = async (idx: number, mode: 'preview' | 'exported'): Promise<void> => {
    if (loadingIdx !== null) return
    setLoadingIdx(idx)
    try {
      let bytes: Uint8Array | null = null
      if (mode === 'exported') {
        bytes = (await attempt(() => call<Uint8Array>('tts:batchFile', status[idx].n))) ?? null
      } else {
        const r = await attempt(() => call<TtsResult>('tts:synthesize', { ...props.base, text: rows[idx].text }))
        bytes = r?.wav ?? null
      }
      if (!bytes) return
      const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'audio/wav' }))
      const label = mode === 'exported' ? `voice${status[idx].n}.wav` : `${t('Nghe thử')} · ${t('dòng')} ${rows[idx].line}`
      setPlaying({ idx, url, label })
      setTimeout(() => void audioRef.current?.play().catch(() => {}), 50)
    } finally {
      setLoadingIdx(null)
    }
  }

  const pickFolder = async (): Promise<string | null> => {
    const f = await attempt(() => call<string | null>('tts:pickFolder'))
    if (f !== undefined) setFolder(f)
    return f ?? null
  }

  const exportAll = async (): Promise<void> => {
    if (!total || running) return
    const dir = folder ?? (await pickFolder())
    if (!dir) return
    const items: { n: number; text: string }[] = []
    nToIdx.current = new Map()
    const pending: Record<number, RowStatus> = {}
    rows.forEach((r, i) => {
      const n = numbers[i]
      if (n === null) return
      items.push({ n, text: r.text })
      nToIdx.current.set(n, i)
      pending[i] = { n, status: 'running', message: 'pending' }
    })
    setStatus(pending)
    setSummary(null)
    setEditing(null)
    setRunning(true)
    try {
      const s = await attempt(() => call<TtsBatchSummary>('tts:batch', props.base, items))
      if (!s) return
      setSummary(s)
      // Dừng giữa chừng → các dòng chưa chạy bỏ trạng thái chờ
      setStatus((st) => Object.fromEntries(Object.entries(st).filter(([, v]) => v.message !== 'pending')))
      const tone = s.failed ? 'error' : 'success'
      useStore
        .getState()
        .toast(t('Đã lưu {done} file, lỗi {failed}').replace('{done}', String(s.done)).replace('{failed}', String(s.failed)), tone)
    } finally {
      setRunning(false)
    }
  }

  const doneCount = Object.values(status).filter((s) => s.status === 'done').length
  const failCount = Object.values(status).filter((s) => s.status === 'error').length
  const visible = rows.map((r, i) => ({ r, i })).filter(({ r }) => showSkipped || !r.skip)

  return (
    <div className="mt-12">
      <div className="row wrap">
        <button className="btn" disabled={running} onClick={() => void openFile()}>
          <Upload size={14} /> {file ? t('Mở file khác') : t('Mở file văn bản')}
        </button>
        <span className="meta">{t('Mỗi dòng có chữ thành 1 file: voice1.wav, voice2.wav… Dòng trống được bỏ qua.')}</span>
      </div>
      <div className="meta mt-8">
        {t(
          'Hỗ trợ: .txt .md .html .xml .srt .vtt .csv .tsv .json, Word (.docx .doc .rtf), Excel (.xlsx .xls), PowerPoint (.pptx .ppt), OpenDocument (.odt .ods .odp), EPUB. Chưa hỗ trợ PDF.'
        )}
      </div>

      {file && (
        <>
          <div className="tts-file-head mt-12">
            <FileText size={16} />
            <span className="card-title truncate">{file.name}</span>
            <span className="meta">
              {t(file.kind)}
              {file.encoding ? ` (${file.encoding})` : ''} · {t('tách ra {n} dòng có chữ').replace('{n}', String(keptCount))} ·{' '}
              {t('bỏ {n} dòng').replace('{n}', String(skippedCount))} · {t('chọn xuất {n} file').replace('{n}', String(total))}
            </span>
          </div>
          {file.truncated && <div className="callout warning mt-8">{t('File quá nhiều dòng — chỉ lấy 5.000 dòng có chữ đầu tiên.')}</div>}

          <div className="row wrap mt-8" style={{ justifyContent: 'space-between' }}>
            <div className="row wrap">
              <button className="btn btn-sm btn-ghost" disabled={running} onClick={() => setAll(true)}>
                {t('Chọn tất cả')}
              </button>
              <button className="btn btn-sm btn-ghost" disabled={running} onClick={() => setAll(false)}>
                {t('Bỏ chọn tất cả')}
              </button>
            </div>
            <Switch
              checked={showSkipped}
              onChange={setShowSkipped}
              label={t('Hiện cả dòng bị bỏ ({n})').replace('{n}', String(skippedCount))}
            />
          </div>

          <div className="table-wrap tts-lines mt-8">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 36 }} />
                  <th style={{ width: 64 }}>{t('Dòng')}</th>
                  <th style={{ width: 110 }}>{t('File')}</th>
                  <th>{t('Nội dung sẽ đọc')}</th>
                  <th style={{ width: 150 }} />
                </tr>
              </thead>
              <tbody>
                {visible.map(({ r, i }) => {
                  const n = numbers[i]
                  const st = status[i]
                  const tooLong = !r.skip && r.text.length > TTS_MAX_CHARS
                  const words = warn[i] ?? []
                  return (
                    <tr key={i} className={cls(r.skip && 'tts-line-skip', !r.skip && !r.checked && 'tts-line-off')}>
                      <td>
                        {!r.skip && (
                          <input
                            type="checkbox"
                            checked={r.checked}
                            disabled={running || tooLong}
                            onChange={(e) => update(i, { checked: e.target.checked }, true)}
                          />
                        )}
                      </td>
                      <td className="meta num">{r.line}</td>
                      <td className="mono">
                        {n !== null ? `voice${n}.wav` : r.skip ? '—' : <span className="meta">{t('không xuất')}</span>}
                      </td>
                      <td>
                        {r.skip ? (
                          <div className="meta">
                            <i>{t(SKIP_LABEL[r.skip])}</i>
                            {(r.raw ?? r.text) ? <span className="mono"> · {r.raw ?? r.text}</span> : null}
                          </div>
                        ) : editing === i ? (
                          <textarea
                            className="textarea"
                            autoFocus
                            rows={Math.min(6, Math.max(2, Math.ceil(r.text.length / 80)))}
                            defaultValue={r.text}
                            onBlur={(e) => {
                              const v = e.target.value.replace(/\s+/g, ' ').trim()
                              setEditing(null)
                              if (v !== r.text) update(i, { text: v, checked: r.checked && !!v && v.length <= TTS_MAX_CHARS }, !v)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                ;(e.target as HTMLTextAreaElement).blur()
                              }
                              if (e.key === 'Escape') setEditing(null)
                            }}
                          />
                        ) : (
                          <div
                            className={cls('tts-line-text', !running && 'editable')}
                            title={running ? undefined : t('Bấm để sửa nội dung sẽ đọc (không đổi file gốc)')}
                            onClick={() => !running && setEditing(i)}
                          >
                            {r.text || <i className="meta">{t('(trống)')}</i>}
                          </div>
                        )}
                        {!r.skip && r.raw && editing !== i && (
                          <div className="meta mono truncate tts-line-raw">
                            {t('Gốc')}: {r.raw}
                          </div>
                        )}
                        {tooLong && (
                          <div className="tts-line-warn">
                            <AlertTriangle size={12} />{' '}
                            {t('Dòng quá dài ({n} ký tự, tối đa 5.000) — sửa ngắn lại để xuất').replace(
                              '{n}',
                              r.text.length.toLocaleString()
                            )}
                          </div>
                        )}
                        {words.length > 0 && (
                          <div className="tts-line-warn">
                            <AlertTriangle size={12} /> {t('Từ model không đọc được (sẽ bỏ qua)')}: {words.join(', ')}
                          </div>
                        )}
                        {st?.status === 'error' && <div className="tts-line-err">{st.message}</div>}
                      </td>
                      <td>
                        {!r.skip && (
                          <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                            <RowState st={st} />
                            {st?.status === 'done' ? (
                              <button
                                className="btn btn-sm btn-ghost"
                                disabled={loadingIdx !== null}
                                onClick={() => void play(i, 'exported')}
                              >
                                <Play size={13} /> {t('Nghe lại')}
                              </button>
                            ) : (
                              <button
                                className="btn btn-sm btn-ghost"
                                disabled={!props.ready || running || loadingIdx !== null || !r.text || tooLong}
                                onClick={() => void play(i, 'preview')}
                              >
                                {loadingIdx === i ? <Loader2 size={13} className="tts-spin" /> : <Play size={13} />} {t('Nghe thử')}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {playing && (
            <div className="tts-player mt-12">
              <div className="meta">{playing.label}</div>
              <audio ref={audioRef} src={playing.url} controls />
            </div>
          )}

          <div className="tts-export mt-12">
            <div className="row wrap">
              <span className="meta">{t('Lưu vào')}:</span>
              <span className={cls('mono truncate grow', !folder && 'meta')}>{folder ?? t('(chưa chọn thư mục)')}</span>
              <button className="btn btn-sm" disabled={running} onClick={() => void pickFolder()}>
                <FolderOpen size={14} /> {t('Chọn thư mục')}
              </button>
            </div>
            <div className="meta mt-8">{t('File trùng tên trong thư mục (voice1.wav…) sẽ bị ghi đè.')}</div>
            <div className="row wrap mt-12">
              <button className="btn btn-primary" disabled={!props.ready || !total || running} onClick={() => void exportAll()}>
                <Upload size={14} /> {running ? t('Đang xuất…') : t('Xuất {n} file').replace('{n}', String(total))}
              </button>
              {running && (
                <button className="btn" onClick={() => void call('tts:cancel')}>
                  <Square size={14} /> {t('Dừng')}
                </button>
              )}
              {summary && !running && folder && (
                <button className="btn btn-ghost" onClick={() => void attempt(() => call('tts:openFolder'))}>
                  <FolderOpen size={14} /> {t('Mở thư mục')}
                </button>
              )}
            </div>
            {running && (
              <div className="mt-12">
                <Progress value={total ? ((doneCount + failCount) / total) * 100 : 0} />
                <div className="meta mt-8">
                  {t('Đang đọc {done}/{total}')
                    .replace('{done}', String(Math.min(doneCount + failCount + 1, total)))
                    .replace('{total}', String(total))}
                </div>
              </div>
            )}
            {summary && !running && (
              <div className={cls('callout mt-12', summary.failed ? 'warning' : 'info')}>
                {t('Đã lưu {done} file, lỗi {failed}').replace('{done}', String(summary.done)).replace('{failed}', String(summary.failed))}
                {summary.cancelled ? ` · ${t('đã dừng giữa chừng')}` : ''} · {summary.folder}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function RowState({ st }: { st?: RowStatus }): JSX.Element | null {
  const t = useT()
  if (!st) return null
  if (st.status === 'running' && st.message === 'pending') return <span className="meta">{t('Chờ')}</span>
  if (st.status === 'running') return <Loader2 size={14} className="tts-spin" />
  if (st.status === 'done')
    return (
      <span className="tts-ok" title={st.durationSec ? `${st.durationSec.toFixed(1)} s` : undefined}>
        <CheckCircle2 size={14} />
      </span>
    )
  return (
    <span className="tts-err" title={st.message}>
      <XCircle size={14} />
    </span>
  )
}
