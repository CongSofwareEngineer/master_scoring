// Xuất báo cáo: Excel (.xlsx) bảng điểm, CSV, PDF nhận xét từng sinh viên.
// Mọi nội dung trong file xuất theo ngôn ngữ giáo viên đang chọn (Settings → Ngôn ngữ).
import ExcelJS from 'exceljs'
import { BrowserWindow } from 'electron'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { CONFIDENCE_LABEL, STATUS_META } from '@shared/constants'
import { localizeStored, translate } from '@shared/i18n'
import type { Assignment, Lang, ReportColumn, StudentResult, StudentRow } from '@shared/types'
import { backendFor } from '../grading/pipeline'
import { getAssignment, getResult, listStudents } from '../repo'
import { getSettings } from '../settings'
import { isWrongLanguage, translateTexts } from './translate'

export function defaultReportName(a: Assignment, ext: string): string {
  const d = new Date()
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const clean = (s: string): string => s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').trim() || 'NoName'
  return `${clean(a.name)}_${clean(a.className)}_${date}.${ext}`
}

export function reportColumns(a: Assignment, lang: Lang): ReportColumn[] {
  const t = (s: string): string => translate(lang, s)
  return [
    { key: 'stt', label: t('STT') },
    { key: 'mssv', label: t('MSSV') },
    { key: 'name', label: t('Họ tên') },
    ...a.rubric.map((c) => ({ key: 'c:' + c.id, label: `${t(c.name)} (${c.max})` })),
    { key: 'total', label: t('Tổng') },
    { key: 'status', label: t('Trạng thái') },
    { key: 'backend', label: 'Backend' },
    { key: 'note', label: t('Ghi chú giáo viên') },
    ...(getSettings(null).similarityEnabled ? [{ key: 'similarity', label: t('Trùng lặp cao nhất (%)') }] : []),
    { key: 'ai', label: t('Tín hiệu AI') },
    { key: 'ai_percent', label: t('% code AI (ước lượng)') },
    { key: 'student_percent', label: t('% SV tự viết (ước lượng)') },
    { key: 'ai_confidence', label: t('Độ tin cậy ước lượng') },
    { key: 'ai_penalty', label: t('Trừ điểm dùng AI') }
  ]
}

const AI_LEVEL: Record<string, string> = { low: 'Thấp', medium: 'Trung bình', high: 'Cao' }

const dateLocale = (lang: Lang): string => (lang === 'en' ? 'en-US' : 'vi-VN')

function statusText(s: StudentRow, lang: Lang): string {
  if (s.scanStatus === 'missing') return translate(lang, 'Chưa nộp')
  if (s.scanStatus !== 'valid') return translate(lang, 'Nộp lỗi: {note}', { note: localizeStored(lang, s.scanNote) })
  return translate(lang, STATUS_META[s.status]?.label ?? s.status)
}

function backendText(s: StudentRow, lang: Lang): string {
  if (!s.backend) return ''
  if (s.backend === 'Cloud') return `Cloud (${s.model})`
  return `${translate(lang, s.backend)}${s.model ? ` (${s.model})` : ''}`
}

function buildRows(assignmentId: number, columns: string[], lang: Lang): { keys: string[]; header: string[]; rows: (string | number | null)[][] } {
  const a = getAssignment(assignmentId)
  const all = reportColumns(a, lang)
  const cols = all.filter((c) => columns.includes(c.key))
  const students = listStudents(assignmentId).filter((s) => s.scanStatus === 'valid' || s.scanStatus === 'missing' || s.scanStatus === 'broken' || s.scanStatus === 'unsupported')
  const rows = students.map((s, idx) => {
    const r = s.scanStatus === 'valid' ? getResult(s.id) : null
    return cols.map((c) => {
      if (c.key === 'stt') return idx + 1
      if (c.key === 'mssv') return s.mssv
      if (c.key === 'name') return s.name
      if (c.key === 'total') return s.scanStatus === 'missing' ? 0 : s.total
      if (c.key === 'status') return statusText(s, lang)
      if (c.key === 'backend') return backendText(s, lang)
      if (c.key === 'note') return r?.teacherNote ?? ''
      if (c.key === 'similarity') return s.maxSimilarity ?? null
      if (c.key === 'ai') return s.aiLevel ? translate(lang, AI_LEVEL[s.aiLevel]) : ''
      if (c.key === 'ai_percent') return s.aiPercent
      if (c.key === 'student_percent') return r?.aiSignal?.estimate ? r.aiSignal.estimate.studentPercent : null
      if (c.key === 'ai_confidence') return r?.aiSignal?.estimate ? translate(lang, CONFIDENCE_LABEL[r.aiSignal.estimate.confidence]) : ''
      if (c.key === 'ai_penalty') return s.aiDeduct ? -s.aiDeduct : null
      if (c.key.startsWith('c:')) {
        const id = c.key.slice(2)
        if (!r) return null
        if (id in r.overrides) return r.overrides[id]
        return r.criteria.find((x) => x.id === id)?.score ?? null
      }
      return ''
    })
  })
  return { keys: cols.map((c) => c.key), header: cols.map((c) => c.label), rows }
}

export interface ExportResult {
  count: number
  untranslated: number // số đoạn nội dung AI chưa dịch được sang ngôn ngữ đang chọn
  translateError?: string
}

export async function exportExcel(assignmentId: number, columns: string[], file: string, lang: Lang): Promise<ExportResult> {
  const a = getAssignment(assignmentId)
  const t = (s: string, vars?: Record<string, string | number>): string => translate(lang, s, vars)
  const { keys, header, rows } = buildRows(assignmentId, columns, lang)
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Master Scoring'
  wb.created = new Date()
  const ws = wb.addWorksheet(t('Bảng điểm'), { views: [{ state: 'frozen', ySplit: 4 }] })
  ws.addRow([t('Bảng điểm: {name}', { name: a.name })]).font = { bold: true, size: 14 }
  ws.addRow([t('Lớp: {cls}    Ngày xuất: {date}    Ngưỡng đạt: {pass}', { cls: a.className, date: new Date().toLocaleString(dateLocale(lang)), pass: a.passThreshold })])
  ws.addRow([])
  const hr = ws.addRow(header)
  hr.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  hr.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = { bottom: { style: 'thin' } }
  })
  hr.height = 32
  for (const r of rows) ws.addRow(r)
  header.forEach((h, i) => {
    const col = ws.getColumn(i + 1)
    const max = Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length))
    col.width = Math.min(50, Math.max(6, max + 2))
  })
  const totalIdx = keys.indexOf('total')
  if (totalIdx >= 0) {
    ws.getColumn(totalIdx + 1).eachCell((cell, rowNo) => {
      if (rowNo <= 4 || typeof cell.value !== 'number') return
      cell.font = { bold: true, color: { argb: cell.value >= a.passThreshold ? 'FF15803D' : 'FFB91C1C' } }
    })
  }
  await wb.xlsx.writeFile(file)
  return { count: 1, untranslated: 0 }
}

export async function exportCsv(assignmentId: number, columns: string[], file: string, lang: Lang): Promise<ExportResult> {
  const { header, rows } = buildRows(assignmentId, columns, lang)
  const esc = (v: unknown): string => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const text = [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n')
  // BOM để Excel trên Windows đọc đúng tiếng Việt
  await writeFile(file, '\ufeff' + text, 'utf8')
  return { count: 1, untranslated: 0 }
}

function escHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

// Issue hiển thị trong PDF (bỏ mức info, tối đa 12)
const shownIssues = (r: StudentResult): StudentResult['issues'] => r.issues.filter((i) => i.severity !== 'info').slice(0, 12)

/** Các đoạn do AI viết sẽ xuất hiện trong PDF (lý do tiêu chí AI, nhận xét chung, issue của AI). */
function aiTexts(r: StudentResult): string[] {
  return [
    ...r.criteria.filter((c) => c.source === 'ai').map((c) => c.reason),
    r.summary,
    ...shownIssues(r)
      .filter((i) => i.source === 'AI')
      .map((i) => i.message)
  ].filter(Boolean)
}

interface PdfText {
  lang: Lang
  t: (s: string, vars?: Record<string, string | number>) => string
  /** Chuỗi cố định do app sinh (phân tích tĩnh, compile, test...) */
  stored: (s: string) => string
  /** Chuỗi do AI viết — lấy bản dịch nếu đang sai ngôn ngữ */
  ai: (s: string) => string
}

function studentHtml(a: Assignment, s: StudentRow, r: StudentResult, x: PdfText): string {
  const crit = r.criteria
    .map((c) => {
      const v = c.id in r.overrides ? r.overrides[c.id] : c.score
      const reason = c.source === 'ai' ? x.ai(c.reason) : x.stored(c.reason)
      return `<tr><td>${escHtml(x.t(c.name))}</td><td class="num">${v ?? '—'} / ${c.max}</td><td>${escHtml(reason)}${c.id in r.overrides ? ` <i>${x.t('(giáo viên đã sửa)')}</i>` : ''}</td></tr>`
    })
    .join('')
  const issues = shownIssues(r)
    .map((i) => {
      const msg = i.source === 'AI' ? x.ai(i.message) : x.stored(i.message)
      return `<li><b>[${i.source}]</b> ${i.file ? `<code>${escHtml(i.file)}${i.line ? ':' + i.line : ''}</code> ` : ''}${escHtml(msg)}</li>`
    })
    .join('')
  const total = r.total ?? 0
  const backend = r.backend ? escHtml(x.t(r.backend)) + (r.model ? ' · ' + escHtml(r.model) : '') : ''
  return `<section class="page">
    <header><div><h1>${escHtml(s.name)}</h1><div class="meta">${escHtml(x.t('MSSV: {mssv} · {name} · Lớp {cls}', { mssv: s.mssv, name: a.name, cls: a.className }))}</div></div>
    <div class="score ${total >= a.passThreshold ? 'pass' : 'fail'}">${total}<span>/10</span></div></header>
    <h2>${x.t('Điểm theo tiêu chí')}</h2>
    <table><thead><tr><th>${x.t('Tiêu chí')}</th><th>${x.t('Điểm')}</th><th>${x.t('Nhận xét')}</th></tr></thead><tbody>${crit}</tbody></table>
    ${r.summary ? `<h2>${x.t('Nhận xét chung')}</h2><p>${escHtml(x.ai(r.summary))}</p>` : ''}
    ${r.teacherNote ? `<h2>${x.t('Ghi chú của giáo viên')}</h2><p>${escHtml(r.teacherNote)}</p>` : ''}
    ${issues ? `<h2>${x.t('Vấn đề chính')}</h2><ul>${issues}</ul>` : ''}
    ${aiBlock(r, x)}
    <footer>${x.t('Chấm bởi Master Scoring')} · ${backend} · ${r.finishedAt ? new Date(r.finishedAt).toLocaleString(dateLocale(x.lang)) : ''}</footer>
  </section>`
}

function aiBlock(r: StudentResult, x: PdfText): string {
  const e = r.aiSignal?.estimate
  if (!e) return ''
  const pen = r.aiPenalty?.applied ? `<p><b>${x.t('Trừ {n} điểm', { n: r.aiPenalty.deduct })}</b> ${x.t('do tỉ lệ code dùng AI vượt mức cho phép.')}</p>` : ''
  return `<h2>${x.t('Nguồn gốc code (ước lượng)')}</h2>
    <p>${x.t('Sinh viên tự viết ~{s}% · AI ~{a}%', { s: e.studentPercent, a: e.aiPercent })}${e.starterPercent ? x.t(' · code khung {p}%', { p: e.starterPercent }) : ''}${x.t(' · độ tin cậy {c}.', { c: x.t(CONFIDENCE_LABEL[e.confidence]) })}
    <i>${x.t('Đây là ước lượng thống kê, không phải kết luận.')}</i></p>${pen}`
}

const PDF_CSS = `
  @page { size: A4; margin: 16mm 14mm; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #111827; font-size: 12px; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #4F46E5; padding-bottom: 8px; margin-bottom: 12px; }
  h1 { font-size: 20px; margin: 0; } h2 { font-size: 14px; margin: 16px 0 6px; color: #4F46E5; }
  .meta { color: #475569; margin-top: 4px; }
  .score { font-size: 32px; font-weight: 700; } .score span { font-size: 14px; color: #64748B; }
  .pass { color: #15803D; } .fail { color: #B91C1C; }
  table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #CBD5E1; padding: 6px 8px; vertical-align: top; text-align: left; }
  th { background: #EEF2FF; } .num { white-space: nowrap; text-align: center; width: 70px; }
  code { font-family: Consolas, monospace; background: #F1F5F9; padding: 0 3px; }
  footer { margin-top: 18px; color: #64748B; font-size: 10px; border-top: 1px solid #E2E8F0; padding-top: 6px; }
  li { margin-bottom: 4px; }
`

async function htmlToPdf(html: string, file: string): Promise<void> {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true })
    await writeFile(file, pdf)
  } finally {
    win.destroy()
  }
}

export async function exportPdf(assignmentId: number, target: string, separate: boolean, lang: Lang, studentIds?: number[]): Promise<ExportResult> {
  const a = getAssignment(assignmentId)
  let students = listStudents(assignmentId).filter((s) => s.scanStatus === 'valid' && ['completed', 'reviewed'].includes(s.status))
  if (studentIds?.length) students = students.filter((s) => studentIds.includes(s.id))
  if (!students.length) throw new Error(translate(lang, 'Chưa có bài nào chấm xong để xuất PDF'))
  const results = new Map(students.map((s) => [s.id, getResult(s.id)]))

  // Nội dung AI viết bằng ngôn ngữ khác (chấm trước khi đổi ngôn ngữ...) → dịch trước khi xuất
  const wrong = [...results.values()].flatMap(aiTexts).filter((s) => isWrongLanguage(s, lang))
  const tr = wrong.length ? await translateTexts(wrong, lang, () => backendFor(a)) : { map: new Map<string, string>(), failed: 0, error: undefined }
  const x: PdfText = {
    lang,
    t: (s, vars) => translate(lang, s, vars),
    stored: (s) => localizeStored(lang, s),
    ai: (s) => tr.map.get(s) ?? s
  }

  const wrap = (body: string): string => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>${PDF_CSS}</style></head><body>${body}</body></html>`
  const html = (s: StudentRow): string => studentHtml(a, s, results.get(s.id)!, x)
  const done = (count: number): ExportResult => ({ count, untranslated: tr.failed, translateError: tr.error })
  if (!separate) {
    await htmlToPdf(wrap(students.map(html).join('')), target)
    return done(1)
  }
  await mkdir(target, { recursive: true })
  for (const s of students) {
    const name = `${s.mssv}_${s.name}`.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_')
    await htmlToPdf(wrap(html(s)), join(target, name + '.pdf'))
  }
  return done(students.length)
}
