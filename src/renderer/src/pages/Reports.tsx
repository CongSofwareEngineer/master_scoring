import { useEffect, useRef, useState } from 'react'
import { FileSpreadsheet, FileText, FolderOpen, Table2 } from 'lucide-react'
import type { ReportColumn } from '@shared/types'
import { call } from '../lib/api'
import { useT } from '../lib/i18n'
import { useCurrentAssignment, useStore } from '../lib/store'
import { AssignmentFilter } from '../components/AssignmentFilter'
import { NoAssignment } from './Dashboard'

export function ReportsPage(): JSX.Element {
  const t = useT()
  const a = useCurrentAssignment()
  const toast = useStore((s) => s.toast)
  const lang = useStore((s) => s.settings?.lang ?? 'vi')
  const [columns, setColumns] = useState<ReportColumn[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [last, setLast] = useState<string | null>(null)
  const colsSig = useRef('')

  useEffect(() => setLast(null), [a?.id])
  useEffect(() => {
    if (!a) return
    void call<ReportColumn[]>('reports:columns', a.id).then((cols) => {
      setColumns(cols)
      // Đổi ngôn ngữ chỉ đổi nhãn cột — giữ nguyên các cột đã chọn; đổi assignment/rubric thì chọn lại mặc định
      const sig = `${a.id}|${cols.map((c) => c.key).join(',')}`
      if (colsSig.current === sig) return
      colsSig.current = sig
      setSelected(new Set(cols.filter((c) => c.key !== 'backend').map((c) => c.key)))
    })
  }, [a?.id, a?.rubric, lang])

  if (!a) return <NoAssignment />

  const exportAs = async (kind: 'xlsx' | 'csv' | 'pdf' | 'pdf-separate'): Promise<void> => {
    setBusy(kind)
    try {
      const keys = columns.filter((c) => selected.has(c.key)).map((c) => c.key)
      const r = await call<{ path: string; count: number; untranslated: number; translateError?: string } | null>('reports:export', a.id, kind, keys)
      if (r) {
        setLast(r.path)
        toast(kind === 'pdf-separate' ? t('Đã xuất {n} file PDF', { n: r.count }) : t('Đã xuất báo cáo'), 'success')
        if (r.untranslated) {
          toast(t('Có {n} đoạn nhận xét AI chưa dịch được sang ngôn ngữ đang chọn ({err}). Hãy kiểm tra AI rồi xuất lại.', { n: r.untranslated, err: r.translateError ?? '' }), 'warning')
        }
      }
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setBusy(null)
    }
  }
  const d = new Date()
  const defaultName = `${a.name}_${a.className}_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`.replace(/\s+/g, '_')

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">{t('Báo cáo')}</div>
          <div className="meta mt-8">
            {a.name} · {t('Tên file mặc định:')} <span className="mono">{defaultName}.xlsx</span>
          </div>
        </div>
      </div>
      <AssignmentFilter assignment={a} />
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">{t('Chọn cột (Excel / CSV)')}</span>
            <div className="row gap-4">
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set(columns.map((c) => c.key)))}>
                {t('Chọn hết')}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set(['stt', 'mssv', 'name', 'total']))}>
                {t('Tối thiểu')}
              </button>
            </div>
          </div>
          <div className="col gap-8">
            {columns.map((c) => (
              <label key={c.key} className="check">
                <input
                  type="checkbox"
                  checked={selected.has(c.key)}
                  onChange={(e) => {
                    const s = new Set(selected)
                    if (e.target.checked) s.add(c.key)
                    else s.delete(c.key)
                    setSelected(s)
                  }}
                />
                {c.label}
              </label>
            ))}
          </div>
        </div>
        <div className="col gap-12">
          <div className="card">
            <div className="row">
              <FileSpreadsheet size={22} className="success" />
              <div className="grow">
                <div className="card-title">Excel (.xlsx)</div>
                <div className="meta">{t('Bảng điểm cả lớp: điểm từng tiêu chí, tổng, trạng thái, ghi chú, cờ trùng lặp/tín hiệu AI')}</div>
              </div>
              <button className="btn btn-primary" disabled={!!busy || !selected.size} onClick={() => exportAs('xlsx')}>
                {busy === 'xlsx' && <span className="spinner" style={{ borderTopColor: 'white' }} />} {t('Xuất Excel')} <span className="kbd">Ctrl+E</span>
              </button>
            </div>
          </div>
          <div className="card">
            <div className="row">
              <Table2 size={22} style={{ color: 'var(--info)' }} />
              <div className="grow">
                <div className="card-title">CSV</div>
                <div className="meta">{t('Để nhập sang hệ thống khác (UTF-8 có BOM, mở đúng tiếng Việt trong Excel)')}</div>
              </div>
              <button className="btn" disabled={!!busy || !selected.size} onClick={() => exportAs('csv')}>
                {busy === 'csv' && <span className="spinner" />} {t('Xuất CSV')}
              </button>
            </div>
          </div>
          <div className="card">
            <div className="row">
              <FileText size={22} className="error" />
              <div className="grow">
                <div className="card-title">{t('PDF nhận xét từng sinh viên')}</div>
                <div className="meta">{t('Điểm, lý do từng tiêu chí, nhận xét, issue chính — mỗi sinh viên một trang')}</div>
              </div>
            </div>
            <div className="row mt-12" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" disabled={!!busy} onClick={() => exportAs('pdf')}>
                {busy === 'pdf' && <span className="spinner" />} {t('Một file PDF')}
              </button>
              <button className="btn" disabled={!!busy} onClick={() => exportAs('pdf-separate')}>
                {busy === 'pdf-separate' && <span className="spinner" />} {t('Tách từng file')}
              </button>
            </div>
          </div>
          {last && (
            <div className="callout info">
              <FolderOpen size={16} />
              <span className="grow truncate mono">{last}</span>
              <a onClick={() => void call('app:openPath', last)}>{t('Mở thư mục')}</a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
