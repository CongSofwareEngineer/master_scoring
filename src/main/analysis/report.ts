// Kiểm tra hình thức báo cáo (Word / Excel / PowerPoint đã chuyển thành văn bản) theo ReportCheck của assignment: số từ, mục bắt buộc, tài liệu tham khảo.
// Kết quả là issue nguồn "Static" → chấm tiêu chí nguồn "static" (Tự động · Kiểm tra hình thức).
import type { DocStats, Issue, ReportCheck, ReportStats } from '@shared/types'
import { decodeText } from '../importer/extract'

const REFERENCES_RE = /(tai lieu tham khao|danh muc tai lieu|nguon tham khao|references|bibliography|works cited)/

// Bỏ dấu, chữ thường, bỏ số thứ tự đầu dòng ("1.2.", "I.", "Chương 1:", "Phần 2 -")
export function normalizeHeading(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/^#+\s*/, '')
    .replace(/^(chuong|phan|muc|chapter|part|section)\s+[0-9ivxlc]+\s*[:.\-–]?\s*/, '')
    .replace(/^([0-9]+(\.[0-9]+)*|[ivxlc]+)\s*[.):\-–]\s*/, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

// Dòng có thể là tiêu đề mục: heading của Word, hoặc (báo cáo không dùng Heading) dòng ngắn không phải bảng.
function headingCandidates(files: Map<string, Buffer>, docs: DocStats[]): { file: string; line: number; norm: string }[] {
  const out: { file: string; line: number; norm: string }[] = []
  for (const d of docs) {
    if (d.headings.length >= 2) {
      for (const h of d.headings) out.push({ file: d.file, line: h.line, norm: normalizeHeading(h.text) })
      continue
    }
    const buf = files.get(d.file)
    if (!buf) continue
    decodeText(buf)
      .split('\n')
      .forEach((l, i) => {
        const t = l.trim()
        if (t && t.length <= 120 && !t.startsWith('|')) out.push({ file: d.file, line: i + 1, norm: normalizeHeading(t) })
      })
  }
  return out
}

export function checkReport(files: Map<string, Buffer>, docs: DocStats[], check: ReportCheck): { issues: Issue[]; report: ReportStats } {
  const issues: Issue[] = []
  const words = docs.reduce((s, d) => s + d.words, 0)
  const report: ReportStats = { docs, words, missingSections: [], hasReferences: false }
  if (!docs.length) {
    issues.push({ source: 'Static', severity: 'error', message: 'Không tìm thấy file báo cáo Word / Excel / PowerPoint đọc được' })
    return { issues, report }
  }
  if (docs.length > 1) issues.push({ source: 'Static', severity: 'info', message: `Bài nộp có ${docs.length} file báo cáo — chấm gộp tất cả` })

  if (check.minWords > 0 && words < check.minWords) {
    issues.push({
      source: 'Static',
      severity: words < check.minWords * 0.7 ? 'error' : 'warning',
      message: `Báo cáo có ${words} từ, ít hơn yêu cầu tối thiểu ${check.minWords} từ`
    })
  }
  if (check.maxWords > 0 && words > check.maxWords) {
    issues.push({ source: 'Static', severity: 'warning', message: `Báo cáo có ${words} từ, vượt giới hạn ${check.maxWords} từ` })
  }

  const cands = headingCandidates(files, docs)
  for (const raw of check.requiredSections) {
    const want = normalizeHeading(raw)
    if (!want) continue
    if (!cands.some((c) => c.norm === want || c.norm.startsWith(want + ' ') || (want.length >= 6 && c.norm.includes(want)))) {
      report.missingSections.push(raw.trim())
      issues.push({ source: 'Static', severity: 'warning', message: `Thiếu mục bắt buộc: "${raw.trim()}"` })
    }
  }

  const refs = cands.find((c) => REFERENCES_RE.test(c.norm))
  report.hasReferences = !!refs
  if (check.requireReferences && !refs) {
    issues.push({ source: 'Static', severity: 'warning', message: 'Không tìm thấy mục Tài liệu tham khảo' })
  }
  if (docs.every((d) => d.headings.length < 2)) {
    issues.push({
      source: 'Static',
      severity: 'info',
      file: docs[0].file,
      message: 'Báo cáo không dùng style Heading của Word cho tiêu đề chương / mục (không tạo được mục lục tự động)'
    })
  }
  return { issues, report }
}

// Điểm tiêu chí "Kiểm tra hình thức": trừ dần theo mức độ issue (cùng công thức với phân tích tĩnh).
export function reportFormatScore(max: number, issues: Issue[]): { score: number; reason: string } {
  const st = issues.filter((i) => i.source === 'Static')
  const errors = st.filter((i) => i.severity === 'error').length
  const warnings = st.filter((i) => i.severity === 'warning').length
  const ratio = Math.max(0, 1 - errors * 0.3 - warnings * 0.1)
  const score = Math.round(max * ratio * 4) / 4
  const reason = errors || warnings ? `Kiểm tra hình thức: ${errors} lỗi, ${warnings} cảnh báo.` : 'Đạt các yêu cầu hình thức.'
  return { score, reason }
}
