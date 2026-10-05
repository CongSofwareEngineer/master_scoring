import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { round2, SOURCE_LABEL } from '@shared/constants'
import type { Criterion, CriterionSource } from '@shared/types'
import { uid } from '../lib/format'

export function rubricTotal(r: Criterion[]): number {
  return round2(r.reduce((s, c) => s + (Number(c.max) || 0), 0))
}

export function RubricEditor({ value, onChange }: { value: Criterion[]; onChange: (r: Criterion[]) => void }): JSX.Element {
  const total = rubricTotal(value)
  const update = (i: number, patch: Partial<Criterion>): void => onChange(value.map((c, k) => (k === i ? { ...c, ...patch } : c)))
  const move = (i: number, d: number): void => {
    const j = i + d
    if (j < 0 || j >= value.length) return
    const next = [...value]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  return (
    <div className="col gap-12">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 32 }}>#</th>
              <th style={{ minWidth: 200 }}>Tiêu chí</th>
              <th style={{ width: 90 }} className="num">
                Điểm tối đa
              </th>
              <th style={{ width: 190 }}>Nguồn chấm</th>
              <th style={{ minWidth: 260 }}>Mô tả (đưa vào prompt AI)</th>
              <th style={{ width: 100 }} />
            </tr>
          </thead>
          <tbody>
            {value.map((c, i) => (
              <tr key={c.id}>
                <td className="meta">{i + 1}</td>
                <td>
                  <input className="input input-sm" value={c.name} onChange={(e) => update(i, { name: e.target.value })} />
                </td>
                <td>
                  <input
                    className="input input-sm"
                    style={{ textAlign: 'right' }}
                    type="number"
                    min={0}
                    max={10}
                    step={0.25}
                    value={c.max}
                    onChange={(e) => update(i, { max: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <select className="select input-sm" value={c.source} onChange={(e) => update(i, { source: e.target.value as CriterionSource })}>
                    {(Object.keys(SOURCE_LABEL) as CriterionSource[]).map((s) => (
                      <option key={s} value={s}>
                        {SOURCE_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input className="input input-sm" value={c.description} onChange={(e) => update(i, { description: e.target.value })} />
                </td>
                <td>
                  <div className="row gap-4">
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => move(i, -1)} title="Lên">
                      <ArrowUp size={13} />
                    </button>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => move(i, 1)} title="Xuống">
                      <ArrowDown size={13} />
                    </button>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => onChange(value.filter((_, k) => k !== i))} title="Xoá">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button
          className="btn btn-sm"
          onClick={() => onChange([...value, { id: uid('c'), name: 'Tiêu chí mới', max: 1, source: 'ai', description: '' }])}
        >
          <Plus size={13} /> Thêm tiêu chí
        </button>
        <span className={Math.abs(total - 10) < 0.001 ? 'success' : 'error'} style={{ fontWeight: 600 }}>
          Tổng: {total} / 10 {Math.abs(total - 10) >= 0.001 && '— tổng phải bằng 10'}
        </span>
      </div>
    </div>
  )
}
