import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Modal } from '@biztrack/ui/biztrack'
import { MemberAuthCredentialType } from '@biztrack/types'
import { dataClient } from '@/lib/data-client'
import { useSessionStore } from '@/stores/session.store'
import { buildAuthCardHtml } from '@/lib/auth-card'
import { errorMessage } from '@/lib/error'
import { useT } from '@/i18n'

/**
 * BIZ-3.3 — owner-only management of scannable authorization cards. Issue a card for a member
 * (the token is shown once, as a QR, to print), and revoke a lost/stale card. A card is a
 * higher-security, no-memorization alternative to the PIN.
 */
export function AuthCardsSection() {
  const t = useT()
  const qc = useQueryClient()
  const role = useSessionStore((s) => s.status.user?.role)
  const businessName = useSessionStore((s) => s.status.businessName) ?? ''
  const isOwner = (role ?? '').toUpperCase() === 'OWNER'

  const membersQ = useQuery({
    queryKey: ['team', 'members'],
    queryFn: () => dataClient.team.listMembers(),
    enabled: isOwner,
  })
  const credsQ = useQuery({
    queryKey: ['credentials'],
    queryFn: () => dataClient.credentials.list(),
    enabled: isOwner,
  })

  const [issueFor, setIssueFor] = useState<{ memberId: string; name: string } | null>(null)
  const [label, setLabel] = useState('')
  const [issued, setIssued] = useState<{
    token: string
    holderName: string
    label: string | null
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const issue = useMutation({
    mutationFn: (input: { memberId: string; label?: string | null }) =>
      dataClient.credentials.issueCard(input),
    onSuccess: (res) => {
      setIssued({
        token: res.token,
        holderName: issueFor?.name ?? '',
        label: res.credential.label,
      })
      setIssueFor(null)
      setLabel('')
      void qc.invalidateQueries({ queryKey: ['credentials'] })
    },
    onError: (e) => setError(errorMessage(e, t('cards.issueFailed'))),
  })

  const revoke = useMutation({
    mutationFn: (id: string) => dataClient.credentials.revoke(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['credentials'] }),
    onError: (e) => setError(errorMessage(e, t('cards.revokeFailed'))),
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

  const download = async () => {
    if (!issued) return
    const html = await buildAuthCardHtml({
      token: issued.token,
      holderName: issued.holderName,
      businessName,
      label: issued.label,
    })
    await dataClient.documents.downloadHtmlPdf(html, `card-${issued.holderName || 'member'}.pdf`)
  }

  if (!isOwner) return null

  const members = (membersQ.data?.members ?? []).filter((m) => m.status === 'ACTIVE')
  const cardsFor = (memberId: string) =>
    (credsQ.data ?? []).filter(
      (c) => c.memberId === memberId && c.type === MemberAuthCredentialType.CARD && !c.revokedAt,
    )
  const hasAnyCard = (credsQ.data ?? []).some(
    (c) => c.type === MemberAuthCredentialType.CARD && !c.revokedAt,
  )

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
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {members.map((m) => {
          const cards = cardsFor(m.memberId)
          return (
            <div
              key={m.memberId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 0',
                borderTop: '1px solid var(--border)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{m.name || m.email || '—'}</div>
                <div className="cash-muted" style={{ fontSize: 12 }}>
                  {cards.length === 0
                    ? t('cards.none')
                    : cards.map((c) => c.label || t('cards.card')).join(' · ')}
                </div>
              </div>
              {cards.map((c) => (
                <Button
                  key={c.id}
                  type="button"
                  variant="ghost"
                  onClick={() => revoke.mutate(c.id)}
                  disabled={revoke.isPending}
                >
                  {t('cards.revoke')}
                </Button>
              ))}
              <Button
                type="button"
                variant="soft"
                onClick={() => setIssueFor({ memberId: m.memberId, name: m.name || '' })}
              >
                {t('cards.issue')}
              </Button>
            </div>
          )
        })}
      </div>

      {/* Issue dialog — optional label. */}
      <Modal
        open={!!issueFor}
        onClose={() => setIssueFor(null)}
        title={t('cards.issueTitle')}
        footer={
          <>
            <Button variant="soft" onClick={() => setIssueFor(null)} disabled={issue.isPending}>
              {t('cards.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={issue.isPending}
              onClick={() =>
                issueFor &&
                issue.mutate({ memberId: issueFor.memberId, label: label.trim() || null })
              }
            >
              {t('cards.issue')}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', marginBottom: 10 }}>
          {t('cards.issueBody').replace('{name}', issueFor?.name ?? '')}
        </p>
        <label className="lbl2">{t('cards.label')}</label>
        <Input
          value={label}
          placeholder={t('cards.labelPh')}
          onChange={(e) => setLabel(e.target.value)}
        />
      </Modal>

      {/* Issued card — show the QR once, offer the printable PDF. */}
      <Modal
        open={!!issued}
        onClose={() => setIssued(null)}
        title={t('cards.readyTitle')}
        footer={
          <>
            <Button variant="soft" onClick={() => setIssued(null)}>
              {t('cards.done')}
            </Button>
            <Button variant="primary" onClick={() => void download()}>
              {t('cards.download')}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
          {t('cards.readyBody')}
        </p>
      </Modal>
    </div>
  )
}
