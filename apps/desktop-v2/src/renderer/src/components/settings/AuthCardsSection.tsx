import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button } from '@biztrack/ui/biztrack'
import { MemberAuthCredentialType } from '@biztrack/types'
import { dataClient } from '@/lib/data-client'
import { useSessionStore } from '@/stores/session.store'
import { errorMessage } from '@/lib/error'
import { useT } from '@/i18n'

/**
 * BIZ-3.3 — owner-only summary of scannable authorization cards. The section keeps the allow-PIN
 * toggle and a one-line count; issuing, listing and revoking cards live on the dedicated
 * /settings/auth-cards page (so a shop with many members never floods this panel).
 */
export function AuthCardsSection() {
  const t = useT()
  const nav = useNavigate()
  const role = useSessionStore((s) => s.status.user?.role)
  const isOwner = (role ?? '').toUpperCase() === 'OWNER'
  const [error, setError] = useState<string | null>(null)

  const credsQ = useQuery({
    queryKey: ['credentials'],
    queryFn: () => dataClient.credentials.list(),
    enabled: isOwner,
  })

  // BIZ-3.3 slice 4 — a shop on cards can turn the PIN off (but never drop its last method).
  const allowedMethods = useSessionStore((s) => s.status.allowedAuthMethods)
  const pinEnabled = !allowedMethods || allowedMethods.includes(MemberAuthCredentialType.PIN)
  const setMethods = useMutation({
    mutationFn: (methods: MemberAuthCredentialType[]) =>
      dataClient.business.update({ allowedAuthMethods: methods }),
    onSuccess: () => void useSessionStore.getState().refresh(),
    onError: (e) => setError(errorMessage(e, t('cards.methodsFailed'))),
  })

  if (!isOwner) return null

  const activeCards = (credsQ.data ?? []).filter(
    (c) => c.type === MemberAuthCredentialType.CARD && !c.revokedAt,
  )
  const cardCount = activeCards.length
  const hasAnyCard = cardCount > 0

  return (
    <div className="settings-card" style={{ marginTop: 18 }}>
      <div className="lbl2">{t('cards.title')}</div>
      <p className="cash-muted" style={{ fontSize: 12.5, margin: '2px 0 12px' }}>
        {t('cards.sub')}
      </p>

      {error ? (
        <div className="msg err" style={{ marginBottom: 10 }}>
          <span>{error}</span>
        </div>
      ) : null}

      {/* Allow-PIN toggle — can only be turned off once at least one card exists. */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <input
          type="checkbox"
          checked={pinEnabled}
          disabled={setMethods.isPending || (pinEnabled && !hasAnyCard)}
          onChange={(e) =>
            setMethods.mutate(
              e.target.checked
                ? [MemberAuthCredentialType.PIN, MemberAuthCredentialType.CARD]
                : [MemberAuthCredentialType.CARD],
            )
          }
        />
        <span>
          {t('cards.allowPin')}
          {pinEnabled && !hasAnyCard ? (
            <span className="cash-muted"> — {t('cards.needCardFirst')}</span>
          ) : null}
        </span>
      </label>

      {/* Summary row: N cards issued + Manage → the dedicated cards page. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 0 2px',
          borderTop: '1px solid var(--border)',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>
            {cardCount === 1
              ? t('cards.countOne')
              : t('cards.countN').replace('{n}', String(cardCount))}
          </div>
          <div className="cash-muted" style={{ fontSize: 12 }}>
            {t('cards.manageHint')}
          </div>
        </div>
        <Button type="button" variant="soft" onClick={() => nav('/settings/auth-cards')}>
          {t('cards.manage')}
        </Button>
      </div>
    </div>
  )
}
