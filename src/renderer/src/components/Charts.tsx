// Biểu đồ SVG nhẹ, hợp dark theme: grid mờ, không gây rối mắt. Click cột → callback.

export function Histogram({ bins, passThreshold, onBarClick }: { bins: number[]; passThreshold: number; onBarClick?: (i: number) => void }): JSX.Element {
  const W = 520
  const H = 200
  const pad = { l: 28, r: 8, t: 10, b: 24 }
  const max = Math.max(1, ...bins)
  const ticks = niceTicks(max)
  const bw = (W - pad.l - pad.r) / bins.length
  const y = (v: number): number => pad.t + (H - pad.t - pad.b) * (1 - v / ticks[ticks.length - 1])
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Phân bố điểm">
        {ticks.map((tk) => (
          <g key={tk}>
            <line className="grid" x1={pad.l} x2={W - pad.r} y1={y(tk)} y2={y(tk)} />
            <text x={pad.l - 6} y={y(tk) + 4} textAnchor="end">
              {tk}
            </text>
          </g>
        ))}
        {bins.map((v, i) => {
          const h = y(0) - y(v)
          return (
            <g key={i} onClick={() => v > 0 && onBarClick?.(i)}>
              <title>{`${i}–${i + 1} điểm: ${v} sinh viên`}</title>
              <rect
                className={'bar' + (i + 1 <= passThreshold ? ' fail' : '')}
                x={pad.l + i * bw + 4}
                y={y(v)}
                width={bw - 8}
                height={Math.max(0, h)}
                rx={3}
              />
              {v > 0 && (
                <text x={pad.l + i * bw + bw / 2} y={y(v) - 4} textAnchor="middle" style={{ fill: 'var(--text)' }}>
                  {v}
                </text>
              )}
              <text x={pad.l + i * bw + bw / 2} y={H - 6} textAnchor="middle">
                {i}–{i + 1}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function CriteriaBars({ items, onClick }: { items: { id: string; name: string; avg: number; max: number }[]; onClick?: (id: string) => void }): JSX.Element {
  return (
    <div className="chart col" style={{ gap: 10 }}>
      {items.map((it) => {
        const pct = it.max ? (it.avg / it.max) * 100 : 0
        const color = pct >= 70 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--error)'
        return (
          <div key={it.id} className="list-row clickable" style={{ padding: '4px 6px', display: 'block' }} onClick={() => onClick?.(it.id)} title="Xem sinh viên theo tiêu chí này">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
              <span className="truncate" style={{ fontSize: 12.5 }}>
                {it.name}
              </span>
              <span className="meta mono">
                {it.avg} / {it.max}
              </span>
            </div>
            <svg viewBox="0 0 100 6" preserveAspectRatio="none" style={{ height: 6 }}>
              <rect x="0" y="0" width="100" height="6" rx="3" fill="var(--surface-2)" />
              <rect className="hbar" x="0" y="0" width={pct} height="6" rx="3" fill={color} />
            </svg>
          </div>
        )
      })}
    </div>
  )
}

function niceTicks(max: number): number[] {
  const step = max <= 5 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : max <= 50 ? 10 : Math.ceil(max / 5 / 10) * 10
  const out: number[] = []
  for (let v = 0; v <= max + step - 1; v += step) out.push(v)
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step)
  return out
}
