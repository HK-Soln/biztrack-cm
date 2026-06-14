import { Outlet } from 'react-router-dom'
import { useLangStore, useT } from '@/i18n'

// Non-authenticated shell (sign in / sign up / OTP …). Split layout: a brand
// panel on the left (software info) + the form area on the right. On narrow
// widths the brand panel hides and the card centres (see @biztrack/ui/styles.css).
export function AuthShell() {
  const t = useT()
  const lang = useLangStore((s) => s.lang)
  return (
    <div id="auth" data-layout="split" data-lang={lang}>
      <main className="auth-main">
        <Outlet />
      </main>
      <aside className="auth-brand app-drag">
        <span className="bcorner" />
        <span className="bcorner2" />
        <div className="blogo">
          <div className="mk">B</div>
          <div className="wm">
            BizTrack CM<small>Point of Sale</small>
          </div>
        </div>
        <div className="bhero">
          <h2>{t('auth.brandHeadline')}</h2>
          <p>{t('auth.brandSub')}</p>
          <div className="bfeat">
            {(['auth.featOffline', 'auth.featPayments', 'auth.featReports'] as const).map((k) => (
              <div className="f" key={k}>
                <span className="ic">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="m5 12 5 5L20 6" />
                  </svg>
                </span>
                {t(k)}
              </div>
            ))}
          </div>
        </div>
        <div className="bfoot">
          <div className="av">
            <i>AM</i>
            <i>BM</i>
            <i>KE</i>
          </div>
          <div className="ft">{t('auth.trusted')}</div>
        </div>
      </aside>
    </div>
  )
}
