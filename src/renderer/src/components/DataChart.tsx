// Biểu đồ trong câu trả lời của Trợ lý dữ liệu: cột đứng / nhóm / chồng, thanh ngang / chồng, đường, vùng (gradient),
// đường 2 trục, kết hợp cột + đường, tròn, tròn rỗng, vùng cực, radar, phân tán, bong bóng và bảng.
// Số liệu lấy từ SQL app đã chạy (DataChart.rows) — cột đầu là nhãn, các cột số sau là chuỗi dữ liệu (tối đa 6).
// SVG tự viết, hợp dark theme: thanh ≤ 24px bo 4px đầu dữ liệu, đường 2px, lưới mờ, hover hiện tooltip.
import { useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { BarChart3, Maximize2, Table2 } from 'lucide-react'
import type { DataChart, DataChartType } from '@shared/types'
import { cls } from '../lib/format'
import { useT } from '../lib/i18n'
import { useStore } from '../lib/store'
import { Modal } from './ui'

const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-6)']
const OTHER = 'var(--series-other)'
const MAX_SERIES = 6
const MAX_BARS = 40
const MAX_POINTS = 200
const MAX_SLICES = 6
const MAX_POLAR = 12
const MAX_RADAR = 12

interface Series {
  name: string
  values: (number | null)[]
}
interface Prepared {
  labels: string[]
  series: Series[]
  cut: number // số dòng bị bỏ khi vẽ
}

function prepare(c: DataChart, maxRows: number): Prepared {
  const rows = c.rows.slice(0, maxRows)
  const series: Series[] = []
  for (let j = 1; j < c.columns.length && series.length < MAX_SERIES; j++) {
    if (!rows.some((r) => typeof r[j] === 'number')) continue
    series.push({ name: c.columns[j], values: rows.map((r) => (typeof r[j] === 'number' ? (r[j] as number) : null)) })
  }
  return { labels: rows.map((r) => (r[0] === null || r[0] === '' ? '(trống)' : String(r[0]))), series, cut: Math.max(0, c.total - rows.length) }
}

const maxRowsOf = (type: DataChartType): number =>
  type === 'line' || type === 'area' || type === 'multiaxis' ? MAX_POINTS : type === 'radar' ? MAX_RADAR : type === 'polar' ? MAX_POLAR : MAX_BARS

interface Fmt {
  full: (n: number) => string
  compact: (n: number) => string
}

function useFmt(): Fmt {
  const lang = useStore((s) => s.settings?.lang ?? 'vi')
  return useMemo(() => {
    const loc = lang === 'en' ? 'en-US' : 'vi-VN'
    const full = new Intl.NumberFormat(loc, { maximumFractionDigits: 2 })
    const compact = new Intl.NumberFormat(loc, { notation: 'compact', maximumFractionDigits: 1 })
    return { full: (n) => full.format(n), compact: (n) => (Math.abs(n) >= 1000 ? compact.format(n) : full.format(n)) }
  }, [lang])
}

// Thang trục "tròn số" bao [min, max] (mặc định luôn gồm 0; scatter thì không ép)
function niceScale(min: number, max: number, count = 4, zero = true): number[] {
  let lo = zero ? Math.min(0, min) : min
  let hi = zero ? Math.max(0, max) : max
  if (lo === hi) {
    if (zero) return [0, 1]
    lo -= Math.abs(lo) * 0.1 || 1
    hi += Math.abs(hi) * 0.1 || 1
  }
  const raw = (hi - lo) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let v = Math.floor(lo / step) * step; v < hi + step * 0.999; v += step) out.push(Number(v.toPrecision(12)))
  return out
}

const short = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + '…' : s)

// Thanh bo 4px ở đầu dữ liệu, vuông ở đường gốc (round = false → vuông cả 2 đầu, dùng cho đoạn giữa của cột chồng)
function vbar(x: number, base: number, end: number, w: number, round = true): string {
  const r = round ? Math.min(4, w / 2, Math.abs(base - end)) : 0
  const d = end <= base ? 1 : -1
  return `M${x},${base}V${end + d * r}Q${x},${end} ${x + r},${end}H${x + w - r}Q${x + w},${end} ${x + w},${end + d * r}V${base}Z`
}
function hbar(y: number, base: number, end: number, h: number, round = true): string {
  const r = round ? Math.min(4, h / 2, Math.abs(end - base)) : 0
  const d = end >= base ? 1 : -1
  return `M${base},${y}H${end - d * r}Q${end},${y} ${end},${y + r}V${y + h - r}Q${end},${y + h} ${end - d * r},${y + h}H${base}Z`
}

interface Tip {
  x: number
  y: number
  title: string
  items: { color: string; name: string; value: string }[]
}

function useTip(): { tip: Tip | null; wrapRef: React.RefObject<HTMLDivElement | null>; show: (e: React.MouseEvent, t: Omit<Tip, 'x' | 'y'>) => void; hide: () => void } {
  const [tip, setTip] = useState<Tip | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  return {
    tip,
    wrapRef,
    show: (e, t) => {
      const r = wrapRef.current?.getBoundingClientRect()
      if (r) setTip({ ...t, x: e.clientX - r.left, y: e.clientY - r.top })
    },
    hide: () => setTip(null)
  }
}

function TipBox({ tip, width }: { tip: Tip | null; width: number }): JSX.Element | null {
  if (!tip) return null
  const left = Math.min(Math.max(tip.x + 12, 0), Math.max(0, width - 200))
  return (
    <div className="dc-tip" style={{ left, top: Math.max(0, tip.y - 12) }}>
      <div className="dc-tip-title">{tip.title}</div>
      {tip.items.map((it, i) => (
        <div key={i} className="row" style={{ gap: 6 }}>
          <span className="dc-swatch" style={{ background: it.color }} />
          <span className="grow truncate meta">{it.name}</span>
          <span className="mono">{it.value}</span>
        </div>
      ))}
    </div>
  )
}

function Legend({ series, marks }: { series: Series[]; marks?: ('bar' | 'line')[] }): JSX.Element | null {
  if (series.length < 2) return null
  return (
    <div className="dc-legend">
      {series.map((s, i) => (
        <span key={s.name + i} className="row" style={{ gap: 5 }}>
          <span className={cls('dc-swatch', marks?.[i] === 'line' && 'line')} style={{ background: SERIES[i] }} />
          {s.name}
        </span>
      ))}
    </div>
  )
}

const allValues = (p: Prepared): number[] => p.series.flatMap((s) => s.values.filter((v): v is number => v !== null))

// Tổng dương / âm theo từng nhóm (cột chồng)
function stackExtent(p: Prepared): number[] {
  return p.labels.flatMap((_, i) => {
    let pos = 0
    let neg = 0
    for (const s of p.series) {
      const v = s.values[i] ?? 0
      if (v >= 0) pos += v
      else neg += v
    }
    return [pos, neg]
  })
}

const tipItems = (p: Prepared, i: number, fmt: Fmt): Tip['items'] =>
  p.series.map((s, j) => ({ color: SERIES[j], name: s.name, value: s.values[i] === null ? '—' : fmt.full(s.values[i] as number) }))

// SVG id an toàn cho url(#…) (useId trả về dạng «r0»)
const useSvgId = (): string => 'g' + useId().replace(/[^a-zA-Z0-9]/g, '')

// ───────────── Cột đứng: nhóm / chồng / kết hợp cột + đường ─────────────

function ColumnChart({ p, large, mode }: { p: Prepared; large: boolean; mode: 'group' | 'stack' | 'combo' }): JSX.Element {
  const fmt = useFmt()
  const { tip, wrapRef, show, hide } = useTip()
  const W = large ? 860 : 460
  const H = large ? 320 : 230
  const pad = { l: 46, r: 8, t: 16, b: 30 }
  const vals = mode === 'stack' ? stackExtent(p) : allValues(p)
  const ticks = niceScale(Math.min(...vals), Math.max(...vals))
  const lo = ticks[0]
  const hi = ticks[ticks.length - 1]
  const y = (v: number): number => pad.t + (H - pad.t - pad.b) * (1 - (v - lo) / (hi - lo))
  const n = p.labels.length
  // Số thanh cạnh nhau trong 1 nhóm: nhóm = mọi chuỗi; chồng / kết hợp = 1
  const k = mode === 'group' ? p.series.length : 1
  const band = (W - pad.l - pad.r) / n
  const maxW = mode === 'group' ? 24 : 36
  const barW = Math.max(2, Math.min(maxW, (band * 0.72 - (k - 1) * 2) / k))
  const groupW = barW * k + (k - 1) * 2
  const every = Math.ceil(n / Math.max(1, Math.floor((W - pad.l - pad.r) / 52)))
  const labelLimit = Math.max(4, Math.floor((band * every) / 6.5))
  const cx = (i: number): number => pad.l + i * band + band / 2
  const barSeries = mode === 'combo' ? p.series.slice(0, 1) : p.series
  const lineSeries = mode === 'combo' ? p.series.slice(1) : []
  const showVals = barSeries.length === 1 && lineSeries.length === 0 && n <= 10
  return (
    <div className="dc-chart" ref={wrapRef}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" onMouseLeave={hide}>
        {ticks.map((tk) => (
          <g key={tk}>
            <line className={tk === 0 ? 'base' : 'grid'} x1={pad.l} x2={W - pad.r} y1={y(tk)} y2={y(tk)} />
            <text x={pad.l - 6} y={y(tk) + 4} textAnchor="end">
              {fmt.compact(tk)}
            </text>
          </g>
        ))}
        {p.labels.map((lb, i) => {
          const x0 = pad.l + i * band + (band - groupW) / 2
          let bars: ReactNode
          if (mode === 'stack') {
            // Cộng dồn dương lên trên, âm xuống dưới; chỉ đoạn ngoài cùng mỗi phía được bo góc
            const segs = p.series.map((s, j) => ({ j, v: s.values[i] ?? 0 })).filter((x) => x.v !== 0)
            const lastPos = segs.filter((x) => x.v > 0).pop()?.j
            const lastNeg = segs.filter((x) => x.v < 0).pop()?.j
            let pos = 0
            let neg = 0
            bars = segs.map(({ j, v }) => {
              const from = v > 0 ? pos : neg
              const to = from + v
              if (v > 0) pos = to
              else neg = to
              return <path key={j} className="seg" d={vbar(x0, y(from), y(to), barW, j === lastPos || j === lastNeg)} fill={SERIES[j]} />
            })
          } else {
            bars = barSeries.map((s, j) => {
              const v = s.values[i]
              if (v === null) return null
              return <path key={j} d={vbar(x0 + j * (barW + 2), y(0), y(v), barW)} fill={SERIES[j]} />
            })
          }
          return (
            <g key={i}>
              {bars}
              {showVals && mode !== 'stack' && p.series[0].values[i] !== null && (
                <text
                  className="val"
                  x={x0 + barW / 2}
                  y={(p.series[0].values[i] as number) >= 0 ? y(p.series[0].values[i] as number) - 5 : y(p.series[0].values[i] as number) + 13}
                  textAnchor="middle"
                >
                  {fmt.compact(p.series[0].values[i] as number)}
                </text>
              )}
              {i % every === 0 && (
                <text x={cx(i)} y={H - 10} textAnchor="middle">
                  {short(lb, labelLimit)}
                </text>
              )}
            </g>
          )
        })}
        {lineSeries.map((s, jj) => {
          const j = jj + 1
          let d = ''
          let pen = false
          s.values.forEach((v, i) => {
            if (v === null) return void (pen = false)
            d += `${pen ? 'L' : 'M'}${cx(i)},${y(v)}`
            pen = true
          })
          return (
            <g key={j}>
              <path d={d} fill="none" stroke={SERIES[j]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((v, i) => (v === null ? null : <circle key={i} cx={cx(i)} cy={y(v)} r={3} fill={SERIES[j]} className="dot" />))}
            </g>
          )
        })}
        {p.labels.map((lb, i) => (
          <rect
            key={i}
            className="hit"
            x={pad.l + i * band}
            y={pad.t}
            width={band}
            height={H - pad.t - pad.b}
            onMouseMove={(e) => {
              const items = tipItems(p, i, fmt)
              if (mode === 'stack') {
                const sum = p.series.reduce((a, s) => a + (s.values[i] ?? 0), 0)
                items.push({ color: 'transparent', name: 'Σ', value: fmt.full(sum) })
              }
              show(e, { title: lb, items })
            }}
          />
        ))}
      </svg>
      <TipBox tip={tip} width={wrapRef.current?.clientWidth ?? 400} />
    </div>
  )
}

// ───────────── Thanh ngang: nhóm / chồng ─────────────

function BarChart({ p, large, stack }: { p: Prepared; large: boolean; stack: boolean }): JSX.Element {
  const fmt = useFmt()
  const { tip, wrapRef, show, hide } = useTip()
  const W = large ? 860 : 460
  const k = stack ? 1 : p.series.length
  const rowH = k === 1 ? 24 : 10 + k * 9
  const pad = { l: large ? 150 : 118, r: 52, t: 6, b: 22 }
  const n = p.labels.length
  const H = pad.t + pad.b + n * rowH
  const vals = stack ? stackExtent(p) : allValues(p)
  const ticks = niceScale(Math.min(...vals), Math.max(...vals), 3)
  const lo = ticks[0]
  const hi = ticks[ticks.length - 1]
  const x = (v: number): number => pad.l + (W - pad.l - pad.r) * ((v - lo) / (hi - lo))
  const barH = Math.min(16, (rowH - 8 - (k - 1) * 2) / k)
  return (
    <div className="dc-chart" ref={wrapRef}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" onMouseLeave={hide}>
        {ticks.map((tk) => (
          <g key={tk}>
            <line className={tk === 0 ? 'base' : 'grid'} x1={x(tk)} x2={x(tk)} y1={pad.t} y2={H - pad.b} />
            <text x={x(tk)} y={H - 6} textAnchor="middle">
              {fmt.compact(tk)}
            </text>
          </g>
        ))}
        {p.labels.map((lb, i) => {
          const y0 = pad.t + i * rowH + (rowH - (barH * k + (k - 1) * 2)) / 2
          let bars: ReactNode
          let total = 0
          if (stack) {
            const segs = p.series.map((s, j) => ({ j, v: s.values[i] ?? 0 })).filter((s) => s.v !== 0)
            const lastPos = segs.filter((s) => s.v > 0).pop()?.j
            const lastNeg = segs.filter((s) => s.v < 0).pop()?.j
            let pos = 0
            let neg = 0
            bars = segs.map(({ j, v }) => {
              const from = v > 0 ? pos : neg
              const to = from + v
              if (v > 0) pos = to
              else neg = to
              return <path key={j} className="seg" d={hbar(y0, x(from), x(to), barH, j === lastPos || j === lastNeg)} fill={SERIES[j]} />
            })
            total = pos + neg
          } else {
            bars = p.series.map((s, j) => {
              const v = s.values[i]
              if (v === null) return null
              return <path key={j} d={hbar(y0 + j * (barH + 2), x(0), x(v), barH)} fill={SERIES[j]} />
            })
          }
          const label = stack ? (p.series.length > 1 ? total : null) : k === 1 ? p.series[0].values[i] : null
          return (
            <g key={i}>
              <text x={pad.l - 8} y={pad.t + i * rowH + rowH / 2 + 4} textAnchor="end">
                {short(lb, large ? 24 : 18)}
              </text>
              {bars}
              {label !== null && (
                <text className="val" x={x(Math.max(0, label)) + 5} y={y0 + barH / 2 + 4}>
                  {fmt.compact(label)}
                </text>
              )}
              <rect
                className="hit"
                x={0}
                y={pad.t + i * rowH}
                width={W}
                height={rowH}
                onMouseMove={(e) => {
                  const items = tipItems(p, i, fmt)
                  if (stack) items.push({ color: 'transparent', name: 'Σ', value: fmt.full(total) })
                  show(e, { title: lb, items })
                }}
              />
            </g>
          )
        })}
      </svg>
      <TipBox tip={tip} width={wrapRef.current?.clientWidth ?? 400} />
    </div>
  )
}

// ───────────── Đường / vùng (gradient) / đường 2 trục ─────────────

function LineChart({ p, large, mode }: { p: Prepared; large: boolean; mode: 'line' | 'area' | 'dual' }): JSX.Element {
  const fmt = useFmt()
  const { tip, wrapRef, show, hide } = useTip()
  const gid = useSvgId()
  const [hover, setHover] = useState<number | null>(null)
  const dual = mode === 'dual' && p.series.length >= 2
  const W = large ? 860 : 460
  const H = large ? 320 : 230
  const pad = { l: 46, r: dual ? 46 : 14, t: 14, b: 30 }
  const valsOf = (ss: Series[]): number[] => ss.flatMap((s) => s.values.filter((v): v is number => v !== null))
  // 2 trục: chuỗi 2 dùng trục phải, các chuỗi còn lại dùng trục trái
  const left = dual ? p.series.filter((_, j) => j !== 1) : p.series
  const lv = valsOf(left)
  const ticks = niceScale(Math.min(...lv), Math.max(...lv))
  const rv = dual ? valsOf([p.series[1]]) : []
  const rticks = dual ? niceScale(Math.min(...rv), Math.max(...rv), ticks.length - 1) : []
  const n = p.labels.length
  const step = n > 1 ? (W - pad.l - pad.r) / (n - 1) : 0
  const x = (i: number): number => (n > 1 ? pad.l + i * step : (W + pad.l - pad.r) / 2)
  const yOn = (t: number[]) => (v: number): number => pad.t + (H - pad.t - pad.b) * (1 - (v - t[0]) / (t[t.length - 1] - t[0]))
  const yL = yOn(ticks)
  const yR = dual ? yOn(rticks) : yL
  const yOf = (j: number): ((v: number) => number) => (dual && j === 1 ? yR : yL)
  const every = Math.ceil(n / Math.max(1, Math.floor((W - pad.l - pad.r) / 56)))
  const pathOf = (s: Series, y: (v: number) => number): string => {
    let d = ''
    let pen = false
    s.values.forEach((v, i) => {
      if (v === null) return void (pen = false)
      d += `${pen ? 'L' : 'M'}${x(i)},${y(v)}`
      pen = true
    })
    return d
  }
  const first = (s: Series): number => s.values.findIndex((v) => v !== null)
  const last = (s: Series): number => {
    for (let i = s.values.length - 1; i >= 0; i--) if (s.values[i] !== null) return i
    return -1
  }
  const onMove = (e: React.MouseEvent<SVGRectElement>): void => {
    const svg = e.currentTarget.ownerSVGElement!.getBoundingClientRect()
    const mx = ((e.clientX - svg.left) / svg.width) * W
    const i = Math.max(0, Math.min(n - 1, Math.round((mx - pad.l) / (step || 1))))
    setHover(i)
    show(e, { title: p.labels[i], items: tipItems(p, i, fmt) })
  }
  // Vùng: tô gradient cho mọi chuỗi; đường thường: chỉ tô mờ khi có 1 chuỗi
  const fills = mode === 'area' ? p.series : mode === 'line' && p.series.length === 1 ? p.series : []
  const base = (y: (v: number) => number, t: number[]): number => y(Math.max(t[0], 0))
  return (
    <div className="dc-chart" ref={wrapRef}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" onMouseLeave={() => (hide(), setHover(null))}>
        <defs>
          {fills.map((_, j) => (
            <linearGradient key={j} id={`${gid}-${j}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES[j]} stopOpacity={mode === 'area' ? 0.45 : 0.18} />
              <stop offset="100%" stopColor={SERIES[j]} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((tk, ti) => (
          <g key={tk}>
            <line className={tk === 0 ? 'base' : 'grid'} x1={pad.l} x2={W - pad.r} y1={yL(tk)} y2={yL(tk)} />
            <text x={pad.l - 6} y={yL(tk) + 4} textAnchor="end" style={dual ? { fill: SERIES[0] } : undefined}>
              {fmt.compact(tk)}
            </text>
            {dual && rticks[ti] !== undefined && (
              <text x={W - pad.r + 6} y={yR(rticks[ti]) + 4} textAnchor="start" style={{ fill: SERIES[1] }}>
                {fmt.compact(rticks[ti])}
              </text>
            )}
          </g>
        ))}
        {p.labels.map((lb, i) =>
          i % every === 0 ? (
            <text key={i} x={x(i)} y={H - 10} textAnchor={n > 1 && i === n - 1 ? 'end' : n > 1 && i === 0 ? 'start' : 'middle'}>
              {short(lb, 10)}
            </text>
          ) : null
        )}
        {fills.map((s, j) => {
          const a = first(s)
          const b = last(s)
          if (a < 0) return null
          const y = yOf(j)
          const b0 = base(y, dual && j === 1 ? rticks : ticks)
          return <path key={j} d={`${pathOf(s, y)}L${x(b)},${b0}L${x(a)},${b0}Z`} fill={`url(#${gid}-${j})`} />
        })}
        {hover !== null && <line className="cross" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} />}
        {p.series.map((s, j) => (
          <path key={j} d={pathOf(s, yOf(j))} fill="none" stroke={SERIES[j]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {p.series.map((s, j) => {
          const i = hover ?? last(s)
          const v = s.values[i]
          if (i < 0 || v === null || v === undefined) return null
          return <circle key={j} cx={x(i)} cy={yOf(j)(v)} r={4} fill={SERIES[j]} className="dot" />
        })}
        {p.series.length === 1 && hover === null && last(p.series[0]) >= 0 && (
          <text className="val" x={x(last(p.series[0]))} y={yL(p.series[0].values[last(p.series[0])] as number) - 9} textAnchor="end">
            {fmt.compact(p.series[0].values[last(p.series[0])] as number)}
          </text>
        )}
        <rect className="hit" x={pad.l - 6} y={pad.t} width={W - pad.l - pad.r + 12} height={H - pad.t - pad.b} onMouseMove={onMove} />
      </svg>
      <TipBox tip={tip} width={wrapRef.current?.clientWidth ?? 400} />
    </div>
  )
}

// ───────────── Tròn / tròn rỗng ─────────────

function PieChart({ p, large, hole }: { p: Prepared; large: boolean; hole: boolean }): JSX.Element {
  const t = useT()
  const fmt = useFmt()
  const { tip, wrapRef, show, hide } = useTip()
  const s = p.series[0]
  // Lấy phần dương, sắp giảm dần; quá 6 phần → 5 phần lớn nhất + "Khác"
  let parts = p.labels.map((label, i) => ({ label, value: s.values[i] ?? 0 })).filter((x) => x.value > 0)
  parts.sort((a, b) => b.value - a.value)
  const folded = parts.length > MAX_SLICES
  if (folded) {
    const rest = parts.slice(MAX_SLICES - 1)
    parts = [...parts.slice(0, MAX_SLICES - 1), { label: t('Khác ({n})', { n: rest.length }), value: rest.reduce((a, b) => a + b.value, 0) }]
  }
  const total = parts.reduce((a, b) => a + b.value, 0)
  const color = (i: number): string => (folded && i === parts.length - 1 ? OTHER : SERIES[i])
  const size = large ? 240 : 170
  const R = size / 2 - 4
  const r0 = hole ? R * 0.6 : 0
  const c = size / 2
  let a0 = -Math.PI / 2
  const pt0 = (a: number, r: number): string => `${c + r * Math.cos(a)},${c + r * Math.sin(a)}`
  const arcs = parts.map((pt, i) => {
    const a1 = a0 + (pt.value / total) * Math.PI * 2
    const big = a1 - a0 > Math.PI ? 1 : 0
    let d: string
    if (parts.length === 1)
      d =
        `M${c - R},${c}A${R},${R} 0 1 1 ${c + R},${c}A${R},${R} 0 1 1 ${c - R},${c}` +
        (hole ? `M${c - r0},${c}A${r0},${r0} 0 1 0 ${c + r0},${c}A${r0},${r0} 0 1 0 ${c - r0},${c}Z` : 'Z')
    else if (hole) d = `M${pt0(a0, R)}A${R},${R} 0 ${big} 1 ${pt0(a1, R)}L${pt0(a1, r0)}A${r0},${r0} 0 ${big} 0 ${pt0(a0, r0)}Z`
    else d = `M${c},${c}L${pt0(a0, R)}A${R},${R} 0 ${big} 1 ${pt0(a1, R)}Z`
    a0 = a1
    return { d, i }
  })
  const pct = (v: number): string => `${fmt.full(Math.round((v / total) * 1000) / 10)}%`
  const dropped = p.labels.length - p.labels.filter((_, i) => (s.values[i] ?? 0) > 0).length
  return (
    <div className="dc-chart dc-pie" ref={wrapRef}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, flex: '0 0 auto' }} role="img" onMouseLeave={hide}>
        {arcs.map((a) => (
          <path
            key={a.i}
            d={a.d}
            fill={color(a.i)}
            fillRule="evenodd"
            className="slice"
            onMouseMove={(e) => show(e, { title: parts[a.i].label, items: [{ color: color(a.i), name: s.name, value: `${fmt.full(parts[a.i].value)} · ${pct(parts[a.i].value)}` }] })}
          />
        ))}
        {hole && (
          <>
            <text x={c} y={c - 2} textAnchor="middle" className="val" style={{ fontSize: large ? 18 : 14 }}>
              {fmt.compact(total)}
            </text>
            <text x={c} y={c + 14} textAnchor="middle">
              {short(s.name, 16)}
            </text>
          </>
        )}
      </svg>
      <div className="col grow" style={{ gap: 4, minWidth: 0 }}>
        {!hole && (
          <div className="meta" style={{ fontSize: 12 }}>
            {s.name}: <b className="mono">{fmt.full(total)}</b>
          </div>
        )}
        {parts.map((pt, i) => (
          <div key={i} className="row" style={{ gap: 6, fontSize: 12 }}>
            <span className="dc-swatch" style={{ background: color(i) }} />
            <span className="grow truncate" title={pt.label}>
              {pt.label}
            </span>
            <span className="meta mono">{pct(pt.value)}</span>
          </div>
        ))}
        {dropped > 0 && <div className="meta" style={{ fontSize: 11 }}>{t('Bỏ {n} nhóm có giá trị ≤ 0', { n: dropped })}</div>}
      </div>
      <TipBox tip={tip} width={wrapRef.current?.clientWidth ?? 400} />
    </div>
  )
}

// ───────────── Vùng cực (polar area): góc bằng nhau, bán kính theo giá trị ─────────────

function PolarChart({ p, large }: { p: Prepared; large: boolean }): JSX.Element {
  const t = useT()
  const fmt = useFmt()
  const { tip, wrapRef, show, hide } = useTip()
  const s = p.series[0]
  const parts = p.labels.map((label, i) => ({ label, value: s.values[i] ?? 0 })).filter((x) => x.value > 0)
  const size = large ? 280 : 190
  const R = size / 2 - 6
  const c = size / 2
  const ticks = niceScale(0, Math.max(...parts.map((x) => x.value)), 3)
  const hi = ticks[ticks.length - 1]
  const rad = (v: number): number => (R * v) / hi
  const da = (Math.PI * 2) / Math.max(1, parts.length)
  const pt0 = (a: number, r: number): string => `${c + r * Math.cos(a)},${c + r * Math.sin(a)}`
  // > 6 nhóm: màu lặp lại, vòng sau nhạt hơn để vẫn phân biệt được
  const color = (i: number): string => SERIES[i % SERIES.length]
  const dropped = p.labels.length - parts.length
  return (
    <div className="dc-chart dc-pie" ref={wrapRef}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, flex: '0 0 auto' }} role="img" onMouseLeave={hide}>
        {parts.map((pt, i) => {
          const a0 = -Math.PI / 2 + i * da
          const a1 = a0 + da
          const r = rad(pt.value)
          const d = parts.length === 1 ? `M${c - r},${c}A${r},${r} 0 1 1 ${c + r},${c}A${r},${r} 0 1 1 ${c - r},${c}Z` : `M${c},${c}L${pt0(a0, r)}A${r},${r} 0 0 1 ${pt0(a1, r)}Z`
          return (
            <path
              key={i}
              d={d}
              fill={color(i)}
              fillOpacity={i < SERIES.length ? 0.8 : 0.45}
              className="slice"
              onMouseMove={(e) => show(e, { title: pt.label, items: [{ color: color(i), name: s.name, value: fmt.full(pt.value) }] })}
            />
          )
        })}
        {ticks.slice(1).map((tk) => (
          <g key={tk} pointerEvents="none">
            <circle className="grid" cx={c} cy={c} r={rad(tk)} fill="none" />
            <text x={c + 3} y={c - rad(tk) + 11}>
              {fmt.compact(tk)}
            </text>
          </g>
        ))}
      </svg>
      <div className="col grow" style={{ gap: 4, minWidth: 0 }}>
        {parts.map((pt, i) => (
          <div key={i} className="row" style={{ gap: 6, fontSize: 12 }}>
            <span className="dc-swatch" style={{ background: color(i), opacity: i < SERIES.length ? 1 : 0.55 }} />
            <span className="grow truncate" title={pt.label}>
              {pt.label}
            </span>
            <span className="meta mono">{fmt.compact(pt.value)}</span>
          </div>
        ))}
        {dropped > 0 && <div className="meta" style={{ fontSize: 11 }}>{t('Bỏ {n} nhóm có giá trị ≤ 0', { n: dropped })}</div>}
      </div>
      <TipBox tip={tip} width={wrapRef.current?.clientWidth ?? 400} />
    </div>
  )
}

// ───────────── Radar: mỗi dòng 1 trục (tiêu chí), mỗi cột số 1 đa giác ─────────────

function RadarChart({ p, large }: { p: Prepared; large: boolean }): JSX.Element {
  const fmt = useFmt()
  const { tip, wrapRef, show, hide } = useTip()
  const [hover, setHover] = useState<number | null>(null)
  const W = large ? 520 : 360
  const H = large ? 400 : 280
  const c = { x: W / 2, y: H / 2 }
  const R = Math.min(W, H) / 2 - (large ? 46 : 38)
  const n = p.labels.length
  const vals = allValues(p)
  const ticks = niceScale(Math.min(...vals), Math.max(...vals), 4)
  const lo = ticks[0]
  const hi = ticks[ticks.length - 1]
  const ang = (i: number): number => -Math.PI / 2 + (i * Math.PI * 2) / n
  const at = (i: number, r: number): [number, number] => [c.x + r * Math.cos(ang(i)), c.y + r * Math.sin(ang(i))]
  const r = (v: number): number => (R * (v - lo)) / (hi - lo)
  const poly = (rr: (i: number) => number): string =>
    p.labels.map((_, i) => at(i, rr(i)).join(',')).join(' ')
  return (
    <div className="dc-chart" ref={wrapRef} style={{ maxWidth: W }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" onMouseLeave={() => (hide(), setHover(null))}>
        {ticks.slice(1).map((tk) => (
          <polygon key={tk} className="grid" fill="none" points={poly(() => r(tk))} />
        ))}
        {p.labels.map((_, i) => {
          const [x2, y2] = at(i, R)
          return <line key={i} className="grid" x1={c.x} y1={c.y} x2={x2} y2={y2} />
        })}
        {ticks.slice(1).map((tk) => (
          <text key={tk} x={c.x + 3} y={c.y - r(tk) + 10} style={{ fontSize: 10 }}>
            {fmt.compact(tk)}
          </text>
        ))}
        {p.series.map((s, j) => (
          <polygon
            key={j}
            points={poly((i) => r(s.values[i] ?? lo))}
            fill={SERIES[j]}
            fillOpacity={0.15}
            stroke={SERIES[j]}
            strokeWidth={2}
            strokeLinejoin="round"
            pointerEvents="none"
          />
        ))}
        {p.series.map((s, j) =>
          s.values.map((v, i) => {
            if (v === null) return null
            const [x, y] = at(i, r(v))
            return <circle key={`${j}-${i}`} cx={x} cy={y} r={hover === i ? 4.5 : 3} fill={SERIES[j]} className="dot" pointerEvents="none" />
          })
        )}
        {p.labels.map((lb, i) => {
          const [x, y] = at(i, R + 12)
          const cos = Math.cos(ang(i))
          return (
            <text key={i} x={x} y={y + 4} textAnchor={Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end'} className={cls(hover === i && 'val')}>
              {short(lb, large ? 18 : 12)}
            </text>
          )
        })}
        {/* Vùng rê chuột: mỗi trục 1 hình quạt */}
        {p.labels.map((lb, i) => {
          const a0 = ang(i) - Math.PI / n
          const a1 = ang(i) + Math.PI / n
          const RR = R + 14
          const d = `M${c.x},${c.y}L${c.x + RR * Math.cos(a0)},${c.y + RR * Math.sin(a0)}A${RR},${RR} 0 0 1 ${c.x + RR * Math.cos(a1)},${c.y + RR * Math.sin(a1)}Z`
          return (
            <path
              key={i}
              className="hit"
              d={d}
              onMouseMove={(e) => {
                setHover(i)
                show(e, { title: lb, items: tipItems(p, i, fmt) })
              }}
            />
          )
        })}
      </svg>
      <TipBox tip={tip} width={wrapRef.current?.clientWidth ?? 360} />
    </div>
  )
}

// ───────────── Phân tán / bong bóng ─────────────

interface XYPoint {
  label: string
  x: number
  y: number
  r?: number
}
interface XYData {
  points: XYPoint[]
  xName: string
  yName: string
  rName?: string
  cut: number
}

// Cột đầu chữ → tên điểm; cột đầu là số → chính nó là X. Các cột số tiếp theo: X, Y, (kích thước)
function prepareXY(c: DataChart, bubble: boolean): XYData {
  const nums = c.columns.map((_, j) => j).filter((j) => c.rows.some((r) => typeof r[j] === 'number'))
  const labelCol = nums[0] === 0 && nums.length <= (bubble ? 3 : 2) ? -1 : 0
  const cols = nums.filter((j) => j !== labelCol)
  const [xi, yi, ri] = cols
  const rows = c.rows.slice(0, MAX_POINTS)
  const points: XYPoint[] = []
  for (const row of rows) {
    const x = row[xi]
    const y = row[yi]
    if (typeof x !== 'number' || typeof y !== 'number') continue
    const rv = bubble && ri !== undefined ? row[ri] : undefined
    points.push({ label: labelCol < 0 ? '' : String(row[0] ?? ''), x, y, r: typeof rv === 'number' ? rv : undefined })
  }
  return { points, xName: c.columns[xi], yName: c.columns[yi], rName: bubble && ri !== undefined ? c.columns[ri] : undefined, cut: Math.max(0, c.total - rows.length) }
}

function ScatterChart({ d, large, bubble }: { d: XYData; large: boolean; bubble: boolean }): JSX.Element {
  const fmt = useFmt()
  const { tip, wrapRef, show, hide } = useTip()
  const [hover, setHover] = useState<number | null>(null)
  const W = large ? 860 : 460
  const H = large ? 340 : 250
  const maxR = bubble ? (large ? 28 : 18) : 4
  const pad = { l: 50, r: 12 + (bubble ? maxR / 2 : 0), t: 12 + (bubble ? maxR / 2 : 0), b: 40 }
  const xs = d.points.map((p) => p.x)
  const ys = d.points.map((p) => p.y)
  const xt = niceScale(Math.min(...xs), Math.max(...xs), 5, false)
  const yt = niceScale(Math.min(...ys), Math.max(...ys), 4, false)
  const x = (v: number): number => pad.l + (W - pad.l - pad.r) * ((v - xt[0]) / (xt[xt.length - 1] - xt[0]))
  const y = (v: number): number => pad.t + (H - pad.t - pad.b) * (1 - (v - yt[0]) / (yt[yt.length - 1] - yt[0]))
  // Bong bóng: diện tích tỉ lệ với giá trị (bán kính ∝ √|r|)
  const rMax = Math.max(0, ...d.points.map((p) => Math.abs(p.r ?? 0)))
  const radius = (p: XYPoint): number => (bubble && rMax > 0 ? Math.max(3, maxR * Math.sqrt(Math.abs(p.r ?? 0) / rMax)) : 4)
  // Vẽ bong bóng lớn trước để bong bóng nhỏ nằm trên
  const order = d.points.map((_, i) => i).sort((a, b) => radius(d.points[b]) - radius(d.points[a]))
  return (
    <div className="dc-chart" ref={wrapRef}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" onMouseLeave={() => (hide(), setHover(null))}>
        {yt.map((tk) => (
          <g key={'y' + tk}>
            <line className={tk === 0 ? 'base' : 'grid'} x1={pad.l} x2={W - pad.r} y1={y(tk)} y2={y(tk)} />
            <text x={pad.l - 6} y={y(tk) + 4} textAnchor="end">
              {fmt.compact(tk)}
            </text>
          </g>
        ))}
        {xt.map((tk) => (
          <g key={'x' + tk}>
            <line className={tk === 0 ? 'base' : 'grid'} x1={x(tk)} x2={x(tk)} y1={pad.t} y2={H - pad.b} />
            <text x={x(tk)} y={H - pad.b + 15} textAnchor="middle">
              {fmt.compact(tk)}
            </text>
          </g>
        ))}
        <text x={(pad.l + W - pad.r) / 2} y={H - 4} textAnchor="middle" className="axis-title">
          {short(d.xName, 40)}
        </text>
        <text x={12} y={(pad.t + H - pad.b) / 2} textAnchor="middle" className="axis-title" transform={`rotate(-90 12 ${(pad.t + H - pad.b) / 2})`}>
          {short(d.yName, 30)}
        </text>
        {order.map((i) => {
          const pt = d.points[i]
          return (
            <circle
              key={i}
              cx={x(pt.x)}
              cy={y(pt.y)}
              r={radius(pt) + (hover === i ? 1.5 : 0)}
              fill={SERIES[0]}
              fillOpacity={bubble ? 0.55 : 0.8}
              stroke={SERIES[0]}
              strokeWidth={hover === i ? 2 : 1}
              onMouseMove={(e) => {
                setHover(i)
                const items = [
                  { color: SERIES[0], name: d.xName, value: fmt.full(pt.x) },
                  { color: SERIES[0], name: d.yName, value: fmt.full(pt.y) }
                ]
                if (d.rName && pt.r !== undefined) items.push({ color: SERIES[0], name: d.rName, value: fmt.full(pt.r) })
                show(e, { title: pt.label || `#${i + 1}`, items })
              }}
            />
          )
        })}
      </svg>
      <TipBox tip={tip} width={wrapRef.current?.clientWidth ?? 400} />
    </div>
  )
}

// ───────────── Bảng ─────────────

export function ResultTable({ chart, maxHeight = 260 }: { chart: Pick<DataChart, 'columns' | 'rows'>; maxHeight?: number }): JSX.Element {
  const fmt = useFmt()
  return (
    <div className="table-wrap selectable" style={{ maxHeight }}>
      <table className="table">
        <thead>
          <tr>
            {chart.columns.map((c, i) => (
              <th key={i} className={cls(chart.rows.some((r) => typeof r[i] === 'number') && 'num')}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chart.rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j} className={cls(typeof v === 'number' && 'num')}>
                  {v === null ? '' : typeof v === 'number' ? fmt.full(v) : String(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ───────────── Khung biểu đồ ─────────────

function ChartBody({ chart, view, large }: { chart: DataChart; view: 'chart' | 'table'; large: boolean }): JSX.Element {
  const t = useT()
  const p = useMemo(() => prepare(chart, maxRowsOf(chart.type)), [chart])
  const xyKind = chart.type === 'scatter' || chart.type === 'bubble'
  const xy = useMemo(() => (xyKind ? prepareXY(chart, chart.type === 'bubble') : null), [chart, xyKind])
  if (view === 'table' || chart.type === 'table') return <ResultTable chart={chart} maxHeight={large ? 480 : 260} />
  if (xy) {
    if (xy.points.length < 2) return <ResultTable chart={chart} maxHeight={large ? 480 : 260} />
    return (
      <>
        <ScatterChart d={xy} large={large} bubble={chart.type === 'bubble' && !!xy.rName} />
        {xy.cut > 0 && <div className="meta" style={{ fontSize: 11 }}>{t('Chỉ vẽ {n} dòng đầu / {total}', { n: MAX_POINTS, total: chart.total })}</div>}
      </>
    )
  }
  if (!p.series.length || !p.labels.length) return <ResultTable chart={chart} maxHeight={large ? 480 : 260} />
  // Tròn / vùng cực mà có số âm → vẽ thanh ngang cho đúng nghĩa; radar < 3 trục → cột
  const round = chart.type === 'pie' || chart.type === 'doughnut' || chart.type === 'polar'
  let type: DataChartType = chart.type
  if (round && p.series[0].values.some((v) => v !== null && v < 0)) type = 'hbar'
  if (type === 'radar' && p.labels.length < 3) type = 'bar'
  let body: ReactNode
  let marks: ('bar' | 'line')[] | undefined
  if (type === 'bar') body = <ColumnChart p={p} large={large} mode="group" />
  else if (type === 'stacked') body = <ColumnChart p={p} large={large} mode="stack" />
  else if (type === 'combo') {
    body = <ColumnChart p={p} large={large} mode="combo" />
    marks = p.series.map((_, j) => (j === 0 ? 'bar' : 'line'))
  } else if (type === 'hbar') body = <BarChart p={p} large={large} stack={false} />
  else if (type === 'hstacked') body = <BarChart p={p} large={large} stack />
  else if (type === 'line') body = <LineChart p={p} large={large} mode="line" />
  else if (type === 'area') body = <LineChart p={p} large={large} mode="area" />
  else if (type === 'multiaxis') body = <LineChart p={p} large={large} mode="dual" />
  else if (type === 'radar') body = <RadarChart p={p} large={large} />
  else if (type === 'polar') body = <PolarChart p={p} large={large} />
  else body = <PieChart p={p} large={large} hole={type === 'doughnut'} />
  const own = type === 'pie' || type === 'doughnut' || type === 'polar'
  return (
    <>
      {!own && <Legend series={p.series} marks={marks} />}
      {type === 'multiaxis' && p.series.length >= 2 && (
        <div className="meta" style={{ fontSize: 11 }}>
          {t('Trục trái: {a} · Trục phải: {b}', { a: p.series[0].name, b: p.series[1].name })}
        </div>
      )}
      {body}
      {p.cut > 0 && !own && <div className="meta" style={{ fontSize: 11 }}>{t('Chỉ vẽ {n} dòng đầu / {total}', { n: p.labels.length, total: chart.total })}</div>}
    </>
  )
}

export function ChartCard({ chart }: { chart: DataChart }): JSX.Element {
  const t = useT()
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const [big, setBig] = useState(false)
  const canChart = chart.type !== 'table' && !chart.error
  const header = (
    <div className="row" style={{ gap: 4 }}>
      <span className="card-title grow truncate" style={{ fontSize: 13 }} title={chart.title}>
        {chart.title || t('Biểu đồ')}
      </span>
      {canChart && (
        <div className="dc-seg">
          <button className={cls(view === 'chart' && 'active')} title={t('Biểu đồ')} onClick={() => setView('chart')}>
            <BarChart3 size={13} />
          </button>
          <button className={cls(view === 'table' && 'active')} title={t('Bảng số liệu')} onClick={() => setView('table')}>
            <Table2 size={13} />
          </button>
        </div>
      )}
      {!chart.error && (
        <button className="btn btn-ghost btn-icon btn-sm" title={t('Phóng to')} onClick={() => setBig(true)}>
          <Maximize2 size={13} />
        </button>
      )}
    </div>
  )
  return (
    <div className="dc-chart-card">
      {header}
      {chart.error ? <div className="error meta">{t('Không vẽ được: {e}', { e: chart.error })}</div> : <ChartBody chart={chart} view={view} large={false} />}
      {big && (
        <Modal title={chart.title || t('Biểu đồ')} onClose={() => setBig(false)} wide>
          <ChartBody chart={chart} view={view} large />
        </Modal>
      )}
    </div>
  )
}
