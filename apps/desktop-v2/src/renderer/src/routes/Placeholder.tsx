import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'

// Generic placeholder for nav destinations not built yet — keeps every route in
// the shell live while real screens are built one module at a time.
export function Placeholder({ titleKey }: { titleKey: MessageKey }) {
  const t = useT()
  const title = t(titleKey)
  return (
    <div className="frame">
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          <p>
            {title} — {t('soon.title')}
          </p>
        </div>
      </div>
      <div className="card">
        <p style={{ color: 'var(--text-2)', fontSize: 13.5 }}>{t('soon.body')}</p>
      </div>
    </div>
  )
}
