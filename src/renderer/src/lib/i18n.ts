// Hook dịch cho UI — từ điển nằm ở @shared/i18n (dùng chung với phần xuất báo cáo).
import { translate } from '@shared/i18n'
import { useStore } from './store'

export { translate }

export function useT(): (s: string, vars?: Record<string, string | number>) => string {
  const lang = useStore((st) => st.settings?.lang ?? 'vi')
  return (s, vars) => translate(lang, s, vars)
}
