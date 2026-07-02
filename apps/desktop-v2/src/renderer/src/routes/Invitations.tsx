import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@biztrack/ui/biztrack'
import type { PendingInvitationItem } from '@biztrack/types'
import { dataClient } from '@/lib/data-client'
import { useT } from '@/i18n'

function initials(s: string): string {
  const p = (s || 'B').trim().split(/\s+/)
  return ((p[0]?.[0] ?? 'B') + (p[1]?.[0] ?? '')).toUpperCase()
}

export function Invitations() {
  const t = useT()
  const qc = useQueryClient()
  const [toast, setToast] = useState<string | null>(null)

  const q = useQuery({
    queryKey: ['invitations'],
    queryFn: () => dataClient.invitations.list(),
  })

  const accept = useMutation({
    mutationFn: (businessId: string) => dataClient.invitations.accept(businessId),
    onSuccess: (_r, businessId) => {
      const name = q.data?.items.find((i) => i.businessId === businessId)?.businessName ?? ''
      setToast(t('invitations.accepted').replace('{name}', name))
      void qc.invalidateQueries({ queryKey: ['invitations'] })
    },
  })

  const reject = useMutation({
    mutationFn: (businessId: string) => dataClient.invitations.reject(businessId),
    onSuccess: () => {
      setToast(t('invitations.declined'))
      void qc.invalidateQueries({ queryKey: ['invitations'] })
    },
  })

  const items = q.data?.items ?? []
  const busyId = accept.isPending ? accept.variables : reject.isPending ? reject.variables : null

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('invitations.title')}</h1>
          <p>{t('invitations.subtitle')}</p>
        </div>
      </div>

      {toast ? (
        <div className="banner ok" style={{ marginBottom: 14 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="9" />
            <path d="m8 12 3 3 5-6" />
          </svg>
          <span>{toast}</span>
        </div>
      ) : null}

      <div className="panel">
        {q.isLoading ? (
          <div className="inv-empty">{t('invitations.loading')}</div>
        ) : items.length === 0 ? (
          <div className="inv-empty">
            <h3>{t('invitations.emptyTitle')}</h3>
            <p>{t('invitations.emptyBody')}</p>
          </div>
        ) : (
          <div className="invlist">
            {items.map((inv) => (
              <InvitationRow
                key={inv.businessId}
                inv={inv}
                busy={busyId === inv.businessId}
                onAccept={() => accept.mutate(inv.businessId)}
                onReject={() => reject.mutate(inv.businessId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function InvitationRow({
  inv,
  busy,
  onAccept,
  onReject,
}: {
  inv: PendingInvitationItem
  busy: boolean
  onAccept: () => void
  onReject: () => void
}) {
  const t = useT()
  return (
    <div className="invrow">
      <div className="invrow-tile">{initials(inv.businessName)}</div>
      <div className="invrow-tx">
        <div className="nm">{inv.businessName}</div>
        <div className="mt">
          {inv.role ? (
            <span className="st" style={{ color: 'var(--success)', background: 'var(--success-soft)' }}>
              {inv.role}
            </span>
          ) : (
            <span className="st st-neutral">{t('invite.teamMember')}</span>
          )}
        </div>
      </div>
      <div className="invrow-act">
        <Button variant="ghost" onClick={onReject} disabled={busy}>
          {t('invitations.decline')}
        </Button>
        <Button variant="primary" onClick={onAccept} loading={busy}>
          {t('invitations.accept')}
        </Button>
      </div>
    </div>
  )
}
