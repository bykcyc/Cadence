import { translate, type Locale } from '@shared/i18n'

/** Current UI locale, read from <html lang> (set by the app context's applyLocale). */
function uiLocale(): Locale {
  return (document.documentElement.lang || 'en') as Locale
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(uiLocale(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function formatRelativeDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const startOfDay = (x: Date): number =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000)
  const loc = uiLocale()
  if (days === 0) return translate(loc, 'date.today')
  if (days === 1) return translate(loc, 'date.yesterday')
  if (days < 7) return translate(loc, 'date.daysAgo', { n: days })
  return d.toLocaleDateString(loc, { day: '2-digit', month: 'short', year: 'numeric' })
}
