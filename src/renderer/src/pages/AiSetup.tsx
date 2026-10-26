import { useT } from '../lib/i18n'
import { useStore } from '../lib/store'
import { CloudApiToggle, LocalAiSetupCard } from '../components/AiWidgets'
import { DragBar } from './Login'

export function AiSetupPage({ onDone }: { onDone: (skipped: boolean) => void }): JSX.Element {
  const t = useT()
  const ai = useStore((s) => s.ai)
  const ready = ai?.local.kind === 'ready' || !!ai?.cloudConfigured
  return (
    <div className="center-screen">
      <DragBar />
      <div className="center-body">
        <div className="setup-wrap">
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div className="page-title">{t('Cấu hình AI')}</div>
            <div className="meta mt-8">{t('Chọn cách ứng dụng phân tích code sinh viên')}</div>
          </div>
          <LocalAiSetupCard />
          <div className="choice-card mt-16">
            <CloudApiToggle />
          </div>
          <div className="row mt-16" style={{ justifyContent: 'space-between' }}>
            <a className="meta" onClick={() => onDone(true)}>
              {t('Bỏ qua, cấu hình sau')}
            </a>
            <button className="btn btn-primary" disabled={!ready} onClick={() => onDone(false)}>
              {t('Vào ứng dụng')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
