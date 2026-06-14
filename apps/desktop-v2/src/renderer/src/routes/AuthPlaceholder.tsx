import { useNavigate } from 'react-router-dom'
import { Button } from '@biztrack/ui/biztrack'
import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'
import { useSessionStore } from '@/stores/session.store'

// Temporary auth-group screen for nextStep destinations not built yet
// (setup-business, select-plan, add-first-product). Keeps the nextStep-driven
// flow landing correctly until each gets its real feature.
export function AuthPlaceholder({ titleKey }: { titleKey: MessageKey }) {
  const t = useT()
  const navigate = useNavigate()
  const logout = useSessionStore((s) => s.logout)
  const signOut = async () => {
    await logout()
    navigate('/signin', { replace: true })
  }
  return (
    <div className="auth-card">
      <div className="auth-logo">
        <div className="mk">B</div>
        <div className="wm">BizTrack CM</div>
      </div>
      <div className="auth-h">
        <h1>{t(titleKey)}</h1>
        <p>{t('onboarding.comingSoon')}</p>
      </div>
      <Button variant="soft" block onClick={() => void signOut()}>
        {t('onboarding.signOut')}
      </Button>
    </div>
  )
}
