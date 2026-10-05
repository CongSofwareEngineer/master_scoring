export function fmtBytes(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

export function fmtDuration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '—'
  sec = Math.round(sec)
  if (sec < 60) return `${sec} giây`
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m} phút ${sec % 60 ? (sec % 60) + ' giây' : ''}`.trim()
  const h = Math.floor(m / 60)
  return `${h} giờ ${m % 60} phút`
}

export function fmtScore(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '')
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function cls(...xs: (string | false | null | undefined)[]): string {
  return xs.filter(Boolean).join(' ')
}

export function uid(prefix = 'c'): string {
  return prefix + '_' + Math.random().toString(36).slice(2, 8)
}
