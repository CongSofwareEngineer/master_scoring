import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Bot, Calculator, Eraser, FileSpreadsheet, FolderOpen, Maximize2, Minimize2, PanelRightClose, PanelRightOpen, Search, Send, Square, Trash2, User as UserIcon, X } from 'lucide-react'
import { CLOUD_PROVIDERS } from '@shared/constants'
import type { CloudProvider, DataBackendChoice, DataChatState, DataChatTurn, DataColumn, DataPreview, DataQuery, DataTable } from '@shared/types'
import { call, on } from '../lib/api'
import { cls } from '../lib/format'
import { useT } from '../lib/i18n'
import { attempt, useStore } from '../lib/store'
import { ChartCard } from '../components/DataChart'
import { confirmDialog, Empty } from '../components/ui'

const PAGE_ROWS = 200
const BACKEND_KEY = 'ms:dataChatBackend'
const CHAT_W_KEY = 'ms:dataChatWidth'
const CHAT_HIDDEN_KEY = 'ms:dataChatCollapsed'
const CHAT_MIN = 320
// Phần bảng dữ liệu luôn chừa lại tối thiểu (CSS cũng chặn bằng min(…, 100% - DATA_MIN))
const DATA_MIN = 320

function readBackend(): DataBackendChoice | null {
  try {
    return (localStorage.getItem(BACKEND_KEY) as DataBackendChoice | null) || null
  } catch {
    return null
  }
}
function saveBackend(v: DataBackendChoice): void {
  try {
    localStorage.setItem(BACKEND_KEY, v)
  } catch {
    /* bỏ qua */
  }
}

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function savePref(key: string, v: string | null): void {
  try {
    if (v === null) localStorage.removeItem(key)
    else localStorage.setItem(key, v)
  } catch {
    /* bỏ qua */
  }
}

/** Độ rộng khung chat (kéo mép trái, null = mặc định theo CSS) + thu gọn. Lưu theo máy. */
function useChatLayout(): {
  ref: React.RefObject<HTMLDivElement | null>
  width: number | null
  collapsed: boolean
  resizing: boolean
  wide: boolean
  startResize: (e: React.PointerEvent) => void
  reset: () => void
  toggleWide: () => void
  setCollapsed: (v: boolean) => void
} {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number | null>(() => Number(readPref(CHAT_W_KEY)) || null)
  const [collapsed, setCollapsedState] = useState(() => readPref(CHAT_HIDDEN_KEY) === '1')
  const [resizing, setResizing] = useState(false)
  const maxW = (): number => (ref.current?.clientWidth ?? 1200) - DATA_MIN
  const save = (w: number | null): void => (setWidth(w), savePref(CHAT_W_KEY, w === null ? null : String(w)))

  const startResize = (e: React.PointerEvent): void => {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    e.preventDefault()
    setResizing(true)
    let w = width
    const onMove = (ev: PointerEvent): void => {
      w = Math.round(Math.max(CHAT_MIN, Math.min(box.right - ev.clientX, box.width - DATA_MIN)))
      setWidth(w)
    }
    const onUp = (): void => {
      setResizing(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      save(w)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  // "Phóng to" = khung chat chiếm tối đa, chỉ chừa DATA_MIN cho bảng; bấm lần nữa về mặc định
  const wide = width !== null && width >= maxW() - 8
  return {
    ref,
    width,
    collapsed,
    resizing,
    wide,
    startResize,
    reset: () => save(null),
    toggleWide: () => save(wide ? null : maxW()),
    setCollapsed: (v) => (setCollapsedState(v), savePref(CHAT_HIDDEN_KEY, v ? '1' : null))
  }
}

function useNumberFormat(): (v: string | number | null, pct?: boolean) => string {
  const lang = useStore((s) => s.settings?.lang ?? 'vi')
  return useMemo(() => {
    const nf = new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN', { maximumFractionDigits: 6 })
    return (v, pct) => (v === null || v === undefined ? '' : typeof v === 'number' ? nf.format(v) + (pct ? '%' : '') : String(v))
  }, [lang])
}

export function DataChatPage(): JSX.Element {
  const t = useT()
  const [state, setState] = useState<DataChatState>({ files: [], history: [], busy: false })
  const [tableName, setTableName] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const layout = useChatLayout()

  const tables = useMemo(() => state.files.flatMap((f) => f.tables), [state.files])
  const table = tables.find((x) => x.name === tableName) ?? tables[0] ?? null

  useEffect(() => {
    void attempt(() => call<DataChatState>('data:state')).then((s) => s && setState(s))
  }, [])

  const openFiles = async (): Promise<void> => {
    setOpening(true)
    try {
      const r = await attempt(() => call<{ state: DataChatState; errors: string[] } | null>('data:open'))
      if (!r) return
      const before = new Set(tables.map((x) => x.name))
      setState(r.state)
      const added = r.state.files.flatMap((f) => f.tables).find((x) => !before.has(x.name))
      if (added) setTableName(added.name)
      for (const e of r.errors) useStore.getState().toast(e, 'error')
    } finally {
      setOpening(false)
    }
  }

  const closeAll = async (): Promise<void> => {
    if (!(await confirmDialog(t('Đóng tất cả file và xoá hội thoại?'), { danger: true }))) return
    const s = await attempt(() => call<DataChatState>('data:closeAll'))
    if (s) setState(s)
  }

  return (
    <div
      ref={layout.ref}
      className={cls('page full datachat', layout.collapsed && 'chat-collapsed', layout.resizing && 'resizing')}
      style={layout.width ? ({ '--dc-chat-w': `${layout.width}px` } as React.CSSProperties) : undefined}
    >
      <section className="dc-data">
        <div className="page-header" style={{ marginBottom: 12 }}>
          <div>
            <h1 className="page-title">{t('Phân tích dữ liệu')}</h1>
            <div className="meta">{t('Mở file Excel / CSV rồi hỏi trợ lý kế toán AI ở khung bên phải.')}</div>
          </div>
          <div className="actions">
            {state.files.length > 0 && (
              <button className="btn" onClick={() => void closeAll()} disabled={state.busy}>
                <Trash2 size={15} /> {t('Đóng tất cả')}
              </button>
            )}
            <button className="btn btn-primary" onClick={() => void openFiles()} disabled={opening}>
              {opening ? <span className="spinner" /> : <FolderOpen size={15} />} {t('Mở file')}
            </button>
          </div>
        </div>

        {!state.files.length ? (
          <div className="card grow" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Empty icon={<FileSpreadsheet size={40} />} title={t('Chưa mở file dữ liệu nào')}>
              <div className="meta">{t('Hỗ trợ .xlsx, .xls, .csv, .tsv — mở được nhiều file, mỗi sheet là một bảng.')}</div>
              <button className="btn btn-primary mt-8" onClick={() => void openFiles()} disabled={opening}>
                <FolderOpen size={15} /> {t('Mở file Excel / CSV')}
              </button>
            </Empty>
          </div>
        ) : (
          <>
            <div className="dc-files">
              {state.files.map((f) => (
                <span key={f.id} className="dc-file" title={f.path}>
                  <FileSpreadsheet size={14} />
                  <span className="truncate">{f.name}</span>
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    title={t('Đóng file')}
                    disabled={state.busy}
                    onClick={async () => {
                      const s = await attempt(() => call<DataChatState>('data:remove', f.id))
                      if (s) setState(s)
                    }}
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
            {tables.length > 1 && (
              <div className="tabs" style={{ marginBottom: 10 }}>
                {tables.map((x) => (
                  <button key={x.name} className={cls('tab', table?.name === x.name && 'active')} onClick={() => setTableName(x.name)} title={x.label}>
                    {x.label}
                  </button>
                ))}
              </div>
            )}
            {table && <TableView key={table.name} table={table} />}
          </>
        )}
      </section>
      {layout.collapsed && (
        <div className="dc-chat-rail">
          <button className="btn btn-ghost btn-icon btn-sm" title={t('Mở khung chat')} onClick={() => layout.setCollapsed(false)}>
            <PanelRightOpen size={16} />
          </button>
          <button className="dc-rail-bot" title={t('Mở khung chat')} onClick={() => layout.setCollapsed(false)}>
            {state.busy ? <span className="spinner" /> : <Calculator size={15} />}
          </button>
        </div>
      )}
      {/* Luôn giữ ChatPanel (chỉ ẩn bằng CSS) để câu đang hỏi không mất khi thu gọn */}
      <ChatPanel state={state} setState={setState} tables={tables} layout={layout} />
    </div>
  )
}

// ───────────── Bảng dữ liệu + thống kê cột ─────────────

// Bỏ dấu + chữ thường từng ký tự (giữ đúng vị trí để tô sáng chỗ khớp)
const foldChar = (c: string): string => {
  const f = c.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase()
  return f.length === 1 ? f : c.toLowerCase()
}
const fold = (s: string): string => Array.from(s.normalize('NFC'), foldChar).join('')

// Từ khoá dạng số (1.500.000 kiểu VN hoặc 1,500,000 kiểu US) có bằng giá trị ô không — giống cách main lọc
function numberMatches(term: string, v: number): boolean {
  const x = term.replace(/[\s₫đ$%]|vnđ|vnd/gi, '')
  return [x.replace(/\./g, '').replace(',', '.'), x.replace(/,/g, '')].some((c) => c !== '' && Number(c) === v)
}

function Highlight({ text, term }: { text: string; term: string }): JSX.Element {
  const chars = Array.from(text.normalize('NFC'))
  const hay = chars.map(foldChar).join('')
  const needle = fold(term)
  if (!needle || hay.length !== chars.length) return <>{text}</>
  const out: ReactNode[] = []
  let from = 0
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, from)) {
    if (i > from) out.push(chars.slice(from, i).join(''))
    out.push(<mark key={i}>{chars.slice(i, i + needle.length).join('')}</mark>)
    from = i + needle.length
  }
  if (from < chars.length) out.push(chars.slice(from).join(''))
  return <>{out}</>
}

function TableView({ table }: { table: DataTable }): JSX.Element {
  const t = useT()
  const fmt = useNumberFormat()
  const [view, setView] = useState<'rows' | 'columns'>('rows')
  const [data, setData] = useState<DataPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [input, setInput] = useState('')
  const [term, setTerm] = useState('')
  const [column, setColumn] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // Gõ xong 300ms mới tìm (bảng lớn không bị giật)
  useEffect(() => {
    const h = setTimeout(() => setTerm(input.trim()), 300)
    return () => clearTimeout(h)
  }, [input])

  // Ctrl/Cmd+F → ô tìm kiếm
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setView('rows')
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const load = useCallback(
    async (offset: number) => {
      setLoading(true)
      try {
        const p = await attempt(() => call<DataPreview>('data:preview', table.name, offset, PAGE_ROWS, { search: term, column }))
        if (p) setData((prev) => (offset && prev ? { ...p, rows: [...prev.rows, ...p.rows], rowIds: [...prev.rowIds, ...p.rowIds] } : p))
      } finally {
        setLoading(false)
      }
    },
    [table.name, term, column]
  )
  useEffect(() => void load(0), [load])

  const numbers = table.columns.filter((c) => c.type === 'number').length
  const cellView = (v: string | number | null, c: DataColumn | undefined): ReactNode => {
    const shown = fmt(v, c?.percent)
    if (!term || (column && c?.name !== column)) return shown
    // Ô số khớp theo giá trị (vd gõ 1.500.000) → tô cả ô; còn lại tô đoạn chữ khớp
    if (typeof v === 'number' && !fold(shown).includes(fold(term))) return numberMatches(term, v) ? <mark>{shown}</mark> : shown
    return <Highlight text={shown} term={term} />
  }
  return (
    <div className="dc-table">
      <div className="row wrap" style={{ marginBottom: 8 }}>
        <div className="dc-search">
          <Search size={14} />
          <input
            ref={searchRef}
            className="input input-sm"
            placeholder={t('Tìm trong dữ liệu… (Ctrl+F)')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setInput('')
              if (e.key === 'Enter') setTerm(input.trim())
            }}
          />
          {input && (
            <button className="btn btn-ghost btn-icon btn-sm" title={t('Xoá tìm kiếm')} onClick={() => (setInput(''), setTerm(''))}>
              <X size={13} />
            </button>
          )}
        </div>
        <select className="select input-sm" style={{ width: 180 }} value={column} onChange={(e) => setColumn(e.target.value)} title={t('Tìm trong cột')}>
          <option value="">{t('Tất cả cột')}</option>
          {table.columns.map((c) => (
            <option key={c.name} value={c.name}>
              {c.label}
            </option>
          ))}
        </select>
        <span className="meta">
          {term
            ? t('Tìm thấy {n} / {rows} dòng', { n: fmt(data?.total ?? 0), rows: fmt(table.rowCount) })
            : t('{rows} dòng · {cols} cột · {nums} cột số', { rows: fmt(table.rowCount), cols: table.columns.length, nums: numbers })}{' '}
          · <span className="mono">{table.name}</span>
        </span>
        <div className="grow" />
        <div className="dc-seg">
          <button className={cls(view === 'rows' && 'active')} onClick={() => setView('rows')}>
            {t('Dữ liệu')}
          </button>
          <button className={cls(view === 'columns' && 'active')} onClick={() => setView('columns')}>
            {t('Thống kê cột')}
          </button>
        </div>
      </div>
      {table.notes.map((n, i) => (
        <div key={i} className="callout info" style={{ marginBottom: 8, padding: '6px 10px' }}>
          <span className="meta">{t(n.text, n.vars)}</span>
        </div>
      ))}
      {view === 'columns' ? (
        <ColumnStats table={table} />
      ) : (
        <div className="table-wrap grow selectable">
          <table className="table">
            <thead>
              <tr>
                <th className="num muted" title={t('Số thứ tự dòng dữ liệu (dòng 1 = dòng đầu sau tiêu đề)')}>
                  #
                </th>
                {table.columns.map((c) => (
                  <th key={c.name} className={cls(c.type === 'number' && 'num', column === c.name && term && 'dc-col-hit')} title={`${c.name} · ${c.type}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.rows.map((r, i) => (
                <tr key={data.rowIds[i] ?? i}>
                  <td className="num muted">{data.rowIds[i] ?? i + 1}</td>
                  {r.map((v, j) => {
                    const c = table.columns[j]
                    return (
                      <td key={j} className={cls(c?.type === 'number' && 'num', 'dc-cell')} title={typeof v === 'string' && v.length > 40 ? v : undefined}>
                        {cellView(v, c)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {data && term && !data.total && (
            <div className="empty" style={{ padding: 24 }}>
              {t('Không có dòng nào khớp "{q}"', { q: term })}
            </div>
          )}
          {data && data.rows.length < data.total && (
            <div className="row" style={{ justifyContent: 'center', padding: 10 }}>
              <button className="btn btn-sm" disabled={loading} onClick={() => void load(data.rows.length)}>
                {loading && <span className="spinner" />}
                {t('Tải thêm ({shown}/{total})', { shown: fmt(data.rows.length), total: fmt(data.total) })}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ColumnStats({ table }: { table: DataTable }): JSX.Element {
  const t = useT()
  const fmt = useNumberFormat()
  const typeLabel = (c: DataColumn): string => (c.type === 'number' ? (c.percent ? t('Số (%)') : t('Số')) : c.type === 'date' ? t('Ngày') : t('Chữ'))
  return (
    <div className="table-wrap grow selectable">
      <table className="table">
        <thead>
          <tr>
            <th>{t('Cột')}</th>
            <th>{t('Kiểu')}</th>
            <th className="num">{t('Có dữ liệu')}</th>
            <th className="num">{t('Khác nhau')}</th>
            <th className="num">{t('Tổng')}</th>
            <th className="num">{t('Trung bình')}</th>
            <th className="num">Min</th>
            <th className="num">Max</th>
            <th>{t('Hay gặp')}</th>
          </tr>
        </thead>
        <tbody>
          {table.columns.map((c) => (
            <tr key={c.name}>
              <td>
                {c.label}
                <div className="meta mono">{c.name}</div>
              </td>
              <td>{typeLabel(c)}</td>
              <td className="num">{fmt(c.filled)}</td>
              <td className="num">{fmt(c.distinct)}</td>
              <td className="num">{c.sum !== undefined ? fmt(c.sum, c.percent) : ''}</td>
              <td className="num">{c.avg !== undefined ? fmt(Math.round(c.avg * 100) / 100, c.percent) : ''}</td>
              <td className="num">{c.min !== undefined ? fmt(c.min, c.percent) : ''}</td>
              <td className="num">{c.max !== undefined ? fmt(c.max, c.percent) : ''}</td>
              <td className="wrap meta" style={{ maxWidth: 320 }}>
                {c.type === 'text' ? c.top?.slice(0, 5).map((x) => `${x.value} (${x.count})`).join(', ') : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ───────────── Khung chat ─────────────

function suggestions(tables: DataTable[], t: ReturnType<typeof useT>): string[] {
  const tb = tables[0]
  if (!tb) return []
  const nums = tb.columns.filter((c) => c.type === 'number' && !c.percent)
  const money = nums.find((c) => /tien|doanh_thu|gia|amount|total|chi_phi|luong/.test(c.name)) ?? nums[0]
  const pct = tb.columns.find((c) => c.type === 'number' && c.percent)
  const group = tb.columns.find((c) => c.type === 'text' && c.distinct >= 2 && c.distinct <= 50)
  const date = tb.columns.find((c) => c.type === 'date')
  const out: string[] = []
  if (money) out.push(t('Tổng {col} là bao nhiêu?', { col: money.label }))
  if (pct) out.push(t('{col} trung bình là bao nhiêu %?', { col: pct.label }))
  if (money && group) out.push(t('Vẽ biểu đồ cột tổng {col} theo từng {group}', { col: money.label, group: group.label }))
  if (money && group && group.distinct <= 12) out.push(t('Biểu đồ tròn tỉ trọng {col} theo {group}', { col: money.label, group: group.label }))
  if (money && date) out.push(t('Vẽ biểu đồ đường {col} theo từng tháng', { col: money.label }))
  if (money) out.push(t('Top 5 dòng có {col} cao nhất?', { col: money.label }))
  out.push(t('Tóm tắt nhanh bộ dữ liệu này như một kế toán'))
  return out.slice(0, 6)
}

function ChatPanel({
  state,
  setState,
  tables,
  layout
}: {
  state: DataChatState
  setState: (s: DataChatState) => void
  tables: DataTable[]
  layout: ReturnType<typeof useChatLayout>
}): JSX.Element {
  const t = useT()
  const ai = useStore((s) => s.ai)
  const userId = useStore((s) => s.user?.id)
  const [input, setInput] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [step, setStep] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const cloud: CloudProvider[] = ai?.cloudConfigured ?? []
  const localReady = ai?.local.kind === 'ready'
  const [choice, setChoice] = useState<DataBackendChoice>(() => readBackend() ?? (localReady || !cloud.length ? 'local' : cloud[0]))
  // Lựa chọn cũ không còn dùng được (vd. xoá key Cloud) → chọn AI khả dụng đầu tiên
  useEffect(() => {
    if (choice !== 'local' && !cloud.includes(choice)) setChoice(localReady || !cloud.length ? 'local' : cloud[0])
  }, [choice, cloud.join(','), localReady])

  useEffect(
    () =>
      on<{ userId: number; msg: string }>('data:progress', (p) => {
        if (p.userId === userId) setStep(p.msg)
      }),
    [userId]
  )
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [state.history.length, pending])

  const busy = pending !== null || state.busy
  const send = async (text: string): Promise<void> => {
    const q = text.trim()
    if (!q || busy) return
    if (!tables.length) return useStore.getState().toast(t('Hãy mở file dữ liệu trước'), 'warning')
    setInput('')
    setPending(q)
    setStep(t('AI đang phân tích câu hỏi…'))
    try {
      await attempt(() => call<DataChatTurn>('data:ask', q, choice))
    } finally {
      const s = await attempt(() => call<DataChatState>('data:state'))
      if (s) setState(s)
      setPending(null)
      setStep('')
    }
  }

  const clearChat = async (): Promise<void> => {
    const s = await attempt(() => call<DataChatState>('data:clearChat'))
    if (s) setState(s)
  }

  const sugg = suggestions(tables, t)
  return (
    <aside className="dc-chat">
      <div className="dc-chat-resizer" title={t('Kéo để đổi độ rộng · nhấp đúp để về mặc định')} onPointerDown={layout.startResize} onDoubleClick={layout.reset} />
      <div className="dc-chat-head">
        <span className="brand-logo" style={{ background: 'var(--ai-soft)', color: 'var(--ai)', width: 26, height: 26 }}>
          <Calculator size={15} />
        </span>
        <div className="grow">
          <div className="card-title">{t('Trợ lý kế toán AI')}</div>
          <div className="meta">{t('Số liệu được tính bằng truy vấn trên toàn bộ dữ liệu')}</div>
        </div>
        <button className="btn btn-ghost btn-icon btn-sm" title={t('Xoá hội thoại')} disabled={busy || !state.history.length} onClick={() => void clearChat()}>
          <Eraser size={15} />
        </button>
        <button
          className="btn btn-ghost btn-icon btn-sm"
          title={layout.wide ? t('Thu nhỏ khung chat') : t('Phóng to khung chat')}
          onClick={layout.toggleWide}
        >
          {layout.wide ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
        <button className="btn btn-ghost btn-icon btn-sm" title={t('Thu gọn khung chat')} onClick={() => layout.setCollapsed(true)}>
          <PanelRightClose size={15} />
        </button>
      </div>
      <div className="row" style={{ padding: '0 14px 10px' }}>
        <select
          className="select input-sm grow"
          value={choice}
          onChange={(e) => {
            const v = e.target.value as DataBackendChoice
            setChoice(v)
            saveBackend(v)
          }}
          disabled={busy}
        >
          <option value="local">Local AI{localReady ? '' : ` (${t('chưa sẵn sàng')})`}</option>
          {cloud.map((p) => (
            <option key={p} value={p}>
              Cloud: {CLOUD_PROVIDERS[p].name}
            </option>
          ))}
        </select>
      </div>
      {choice !== 'local' && (
        <div className="callout warning" style={{ margin: '0 14px 10px', padding: '6px 10px' }}>
          <span className="meta">{t('Cloud AI: mô tả cột, vài dòng mẫu và kết quả truy vấn sẽ được gửi tới nhà cung cấp AI.')}</span>
        </div>
      )}

      <div className="dc-messages selectable" ref={listRef}>
        {!state.history.length && !pending && (
          <div className="col" style={{ padding: '8px 2px' }}>
            <div className="meta">
              {tables.length ? t('Gợi ý câu hỏi:') : t('Mở file Excel / CSV ở bên trái để bắt đầu hỏi về dữ liệu.')}
            </div>
            {sugg.map((s) => (
              <button key={s} className="dc-suggest" onClick={() => void send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {state.history.map((m) => (
          <Message key={m.id} turn={m} />
        ))}
        {pending && (
          <>
            <Message turn={{ id: 'pending', role: 'user', content: pending, ts: '' }} />
            <div className="dc-msg assistant">
              <span className="dc-avatar">
                <Bot size={14} />
              </span>
              <div className="dc-bubble">
                <div className="row">
                  <span className="spinner" />
                  <span className="meta grow">{step}</span>
                  <button className="btn btn-sm" onClick={() => void call('data:cancel')}>
                    <Square size={12} /> {t('Dừng')}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="dc-composer">
        <textarea
          className="textarea"
          rows={2}
          placeholder={t('Hỏi về dữ liệu… (Enter để gửi, Shift+Enter xuống dòng)')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void send(input)
            }
          }}
        />
        <button className="btn btn-primary btn-icon" title={t('Gửi')} disabled={busy || !input.trim()} onClick={() => void send(input)}>
          <Send size={15} />
        </button>
      </div>
    </aside>
  )
}

function Message({ turn }: { turn: DataChatTurn }): JSX.Element {
  const t = useT()
  const user = turn.role === 'user'
  return (
    <div className={cls('dc-msg', turn.role)}>
      <span className="dc-avatar">{user ? <UserIcon size={14} /> : <Bot size={14} />}</span>
      <div className={cls('dc-bubble', turn.error && 'error')}>
        {user ? <div style={{ whiteSpace: 'pre-wrap' }}>{turn.content}</div> : turn.content && <Markdown text={turn.content} />}
        {turn.charts?.map((c, i) => (
          <ChartCard key={i} chart={c} />
        ))}
        {!!turn.queries?.length && (
          <details className="dc-queries">
            <summary>{t('Truy vấn đã chạy ({n})', { n: turn.queries.length })}</summary>
            {turn.queries.map((q, i) => (
              <QueryView key={i} q={q} />
            ))}
          </details>
        )}
        {turn.backend && <div className="meta" style={{ marginTop: 4, fontSize: 11 }}>{turn.backend}</div>}
      </div>
    </div>
  )
}

function QueryView({ q }: { q: DataQuery }): JSX.Element {
  const t = useT()
  const fmt = useNumberFormat()
  return (
    <div className="dc-query">
      {q.purpose && <div className="meta">{q.purpose}</div>}
      <pre className="mono">{q.sql}</pre>
      {q.error ? (
        <div className="error meta">{q.error}</div>
      ) : (
        <>
          <div className="table-wrap" style={{ maxHeight: 220 }}>
            <table className="table">
              <thead>
                <tr>
                  {q.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {q.rows.slice(0, 50).map((r, i) => (
                  <tr key={i}>
                    {r.map((v, j) => (
                      <td key={j} className={cls(typeof v === 'number' && 'num')}>
                        {fmt(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="meta" style={{ fontSize: 11 }}>
            {t('{n} dòng kết quả', { n: fmt(q.total) })}
          </div>
        </>
      )}
    </div>
  )
}

// ───────────── Markdown tối giản cho câu trả lời AI ─────────────

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) out.push(<strong key={k++}>{tok.slice(2, -2)}</strong>)
    else if (tok.startsWith('`')) out.push(<code key={k++}>{tok.slice(1, -1)}</code>)
    else out.push(<em key={k++}>{tok.slice(1, -1)}</em>)
    last = m.index + tok.length
  }
  if (last < s.length) out.push(s.slice(last))
  return out
}

const splitRow = (l: string): string[] =>
  l
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())

function Markdown({ text }: { text: string }): JSX.Element {
  const lines = text.replace(/\r/g, '').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let k = 0
  while (i < lines.length) {
    const l = lines[i]
    if (!l.trim()) {
      i++
      continue
    }
    if (/^```/.test(l)) {
      const body: string[] = []
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) body.push(lines[i])
      i++
      blocks.push(<pre key={k++} className="mono">{body.join('\n')}</pre>)
      continue
    }
    const h = l.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      blocks.push(<div key={k++} className="dc-md-h">{inline(h[2])}</div>)
      i++
      continue
    }
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = splitRow(l)
      const rows: string[][] = []
      for (i += 2; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]); i++) rows.push(splitRow(lines[i]))
      const numeric = (s: string): boolean => /^[-+(]?[\d.,\s]+%?\)?(\s*\S{0,4})?$/.test(s) && /\d/.test(s)
      blocks.push(
        <div key={k++} className="table-wrap" style={{ margin: '6px 0' }}>
          <table className="table">
            <thead>
              <tr>
                {head.map((c, j) => (
                  <th key={j}>{inline(c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, j) => (
                    <td key={j} className={cls(numeric(c) && 'num', 'wrap')}>
                      {inline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(l)) {
      const ordered = /^\s*\d+[.)]/.test(l)
      const items: string[] = []
      for (; i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i]); i++) items.push(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ''))
      const List = ordered ? 'ol' : 'ul'
      blocks.push(
        <List key={k++} className="dc-md-list">
          {items.map((it, j) => (
            <li key={j}>{inline(it)}</li>
          ))}
        </List>
      )
      continue
    }
    const para: string[] = []
    for (; i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*\||\s*([-*•]|\d+[.)])\s+)/.test(lines[i]); i++) para.push(lines[i])
    if (!para.length) {
      // dòng bắt đầu bằng "|" nhưng không phải bảng hợp lệ
      para.push(lines[i])
      i++
    }
    blocks.push(
      <p key={k++} className="dc-md-p">
        {para.map((p, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(p)}
          </Fragment>
        ))}
      </p>
    )
  }
  return <div className="dc-md">{blocks}</div>
}
