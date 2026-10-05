import { useState } from 'react'
import { ChevronDown, ChevronRight, Cloud } from 'lucide-react'
import { useT } from '../lib/i18n'
import { useStore } from '../lib/store'
import { CloudConfigForm, LocalAiSetupCard } from '../components/AiWidgets'
import { DragBar } from './Login'

export function AiSetupPage({ onDone }: { onDone: (skipped: boolean) => void }): JSX.Element {
  const t = useT()
  const ai = useStore((s) => s.ai)
  const [advanced, setAdvanced] = useState(false)
  const ready = ai?.local.kind === 'ready' || (ai?.cloudConfigured.length ?? 0) > 0
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
          <button className="btn btn-ghost mt-16" onClick={() => setAdvanced(!advanced)}>
            {advanced ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            {t('Tuỳ chọn nâng cao: Cloud AI')}
          </button>
          {advanced && (
            <div className="choice-card mt-8">
              <div className="row mb-12">
                <Cloud size={16} className="text-2" />
                <span className="card-title">Cloud AI (gọi API)</span>
                <span className="meta">· chỉ khi cần model mạnh hơn cho project lớn</span>
              </div>
              <CloudConfigForm />
            </div>
          )}
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
