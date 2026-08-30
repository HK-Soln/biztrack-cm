import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, CommandSelect, Input, Modal } from '@biztrack/ui/biztrack'
import type { CommandSelectOption } from '@biztrack/ui/biztrack'
import { MemberAuthCredentialType } from '@biztrack/types'
import { dataClient } from '@/lib/data-client'
import { useSessionStore } from '@/stores/session.store'
import { buildAuthCardHtml } from '@/lib/auth-card'
import { errorMessage } from '@/lib/error'
import { useT } from '@/i18n'

const Plus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)
const Back = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="m15 18-6-6 6-6" />
  </svg>
)

/**
 * BIZ-3.3 — the dedicated authorization-cards page (owner-only, reached from Settings › Security).
 * Lists every member holding a live card, revokes one (a full delete, synced as a tombstone), and
 * issues a new one via a searchable member picker. A member may hold at most one active card.
 */
export function AuthCards() {
  const t = useT()
  const nav = useNavigate()
  const qc = useQueryClient()
  const businessName = useSessionStore((s) => s.status.businessName) ?? ''

  const membersQ = useQuery({
    queryKey: ['team', 'members'],
    queryFn: () => dataClient.team.listMembers(),
  })
  const credsQ = useQuery({
    queryKey: ['credentials'],
    queryFn: () => dataClient.credentials.list(),
  })

  const [adding, setAdding] = useState(false)
  const [pickedMember, setPickedMember] = useState<{ memberId: string; name: string } | null>(null)
  const [label, setLabel] = useState('')
  const [revoking, setRevoking] = useState<{ id: string; name: string } | null>(null)
  const [replacing, setReplacing] = useState<{ id: string; name: string } | null>(null)
  const [replaceLabel, setReplaceLabel] = useState('')
  const [issued, setIssued] = useState<{
    token: string
    holderName: string
    label: string | null
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const members = useMemo(
    () => (membersQ.data?.members ?? []).filter((m) => m.status === 'ACTIVE'),
    [membersQ.data],
  )
  const memberName = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of members) map.set(m.memberId, m.name || m.email || '—')
    return map
  }, [members])

  // A live card = a CARD credential that is not revoked (the API already drops deleted rows).
  const cards = useMemo(
    () =>
      (credsQ.data ?? [])
        .filter((c) => c.type === MemberAuthCredentialType.CARD && !c.revokedAt)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [credsQ.data],
  )
  const heldMemberIds = useMemo(() => new Set(cards.map((c) => c.memberId)), [cards])
  // Only members without a live card can be issued one (one active card per member).
  const eligible = useMemo(
    () => members.filter((m) => !heldMemberIds.has(m.memberId)),
    [members, heldMemberIds],
  )

  const resetAdd = () => {
    setAdding(false)
    setPickedMember(null)
    setLabel('')
  }

  const issue = useMutation({
    mutationFn: (input: { memberId: string; label?: string | null }) =>
      dataClient.credentials.issueCard(input),
    onSuccess: (res) => {
      setIssued({
        token: res.token,
        holderName: pickedMember?.name ?? '',
        label: res.credential.label,
      })
      resetAdd()
      void qc.invalidateQueries({ queryKey: ['credentials'] })
    },
    onError: (e) => setError(errorMessage(e, t('cards.issueFailed'))),
  })

  const revoke = useMutation({
    mutationFn: (id: string) => dataClient.credentials.revoke(id),
    onSuccess: () => {
      setRevoking(null)
      void qc.invalidateQueries({ queryKey: ['credentials'] })
    },
    onError: (e) => {
      setRevoking(null)
      setError(errorMessage(e, t('cards.revokeFailed')))
    },
  })

  // Replace (rotate): kills the old card and prints a new one for the same member in one step — the
  // way to rotate a COMPROMISED card, including the shop's last card in a PIN-off setup.
  const replace = useMutation({
    mutationFn: ({ id, label }: { id: string; label?: string | null }) =>
      dataClient.credentials.replace(id, { label }),
    onSuccess: (res) => {
      setIssued({
        token: res.token,
        holderName: replacing?.name ?? '',
        label: res.credential.label,
      })
      setReplacing(null)
      setReplaceLabel('')
      void qc.invalidateQueries({ queryKey: ['credentials'] })
    },
    onError: (e) => {
      setReplacing(null)
      setError(errorMessage(e, t('cards.replaceFailed')))
    },
  })

  const loadOptions = async (search: string): Promise<CommandSelectOption[]> => {
    const q = search.trim().toLowerCase()
    return eligible
      .filter((m) => {
        if (!q) return true
        return (m.name || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q)
      })
      .slice(0, 50)
      .map((m) => ({
        value: m.memberId,
        label: m.name || m.email || '—',
        sublabel: m.name ? m.email || undefined : undefined,
      }))
  }

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

  const loading = membersQ.isLoading || credsQ.isLoading

  return (
    <div className="frame">
      <div className="page-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="back"
            onClick={() => nav('/settings?section=security')}
            aria-label={t('cards.back')}
          >
            <Back />
          </button>
          <div>
            <h1>{t('cards.pageTitle')}</h1>
            <p>{t('cards.pageSub')}</p>
          </div>
        </div>
        <Button variant="primary" type="button" onClick={() => setAdding(true)}>
          <Plus />
          {t('cards.add')}
        </Button>
      </div>

      {error ? (
        <div className="banner warn" style={{ marginBottom: 12 }}>
          <span>{error}</span>
        </div>
      ) : null}

      <div className="card">
        <div className="card-h">
          <div>
            <h3>{t('cards.heldTitle')}</h3>
            <p>{t('cards.heldSub')}</p>
          </div>
          <span className="chip-tag">{cards.length}</span>
        </div>

        {loading ? (
          <div style={{ padding: '28px 8px', color: 'var(--text-muted)', fontSize: 13 }}>
            {t('cards.loading')}
          </div>
        ) : cards.length === 0 ? (
          <div
            style={{
              padding: '36px 16px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 13,
            }}
          >
            {t('cards.emptyHeld')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {cards.map((c) => (
              <div
                key={c.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 0',
                  borderTop: '1px solid var(--border)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{memberName.get(c.memberId) ?? '—'}</div>
                  <div className="cash-muted" style={{ fontSize: 12 }}>
                    {(c.label || t('cards.card')) +
                      ' · ' +
                      t('cards.issuedOn').replace(
                        '{date}',
                        new Date(c.createdAt).toLocaleDateString(),
                      )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="soft"
                  onClick={() => {
                    setReplaceLabel(c.label ?? '')
                    setReplacing({ id: c.id, name: memberName.get(c.memberId) ?? '' })
                  }}
                >
                  {t('cards.replace')}
                </Button>
                <Button
                  type="button"
                  variant="soft"
                  style={{ color: 'var(--danger)' }}
                  onClick={() => setRevoking({ id: c.id, name: memberName.get(c.memberId) ?? '' })}
                >
                  {t('cards.revoke')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add card — searchable member picker + optional label. */}
      <Modal
        open={adding}
        onClose={resetAdd}
        title={t('cards.addTitle')}
        footer={
          <>
            <Button variant="soft" onClick={resetAdd} disabled={issue.isPending}>
              {t('cards.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={issue.isPending}
              disabled={!pickedMember}
              onClick={() =>
                pickedMember &&
                issue.mutate({ memberId: pickedMember.memberId, label: label.trim() || null })
              }
            >
              {t('cards.issue')}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', marginBottom: 12, lineHeight: 1.5 }}>
          {t('cards.addBody')}
        </p>
        <label className="lbl2">{t('cards.member')}</label>
        <div style={{ marginBottom: 12 }}>
          <CommandSelect
            value={pickedMember?.memberId ?? null}
            valueLabel={pickedMember?.name ?? null}
            onChange={(value, option) =>
              setPickedMember(value ? { memberId: value, name: option?.label ?? '' } : null)
            }
            loadOptions={loadOptions}
            placeholder={t('cards.memberPh')}
            searchPlaceholder={t('cards.memberSearch')}
            emptyText={t('cards.noEligible')}
          />
        </div>
        <label className="lbl2">{t('cards.label')}</label>
        <Input
          value={label}
          placeholder={t('cards.labelPh')}
          onChange={(e) => setLabel(e.target.value)}
        />
      </Modal>

      {/* Confirm revoke — a full, irreversible delete. */}
      <Modal
        open={!!revoking}
        onClose={() => setRevoking(null)}
        title={t('cards.revokeTitle')}
        footer={
          <>
            <Button variant="soft" onClick={() => setRevoking(null)} disabled={revoke.isPending}>
              {t('cards.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={revoke.isPending}
              style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
              onClick={() => revoking && revoke.mutate(revoking.id)}
            >
              {t('cards.revoke')}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
          {t('cards.revokeBody').replace('{name}', revoking?.name ?? '')}
        </p>
      </Modal>

      {/* Replace (rotate) — optional new label; the old card dies, a new token is printed. */}
      <Modal
        open={!!replacing}
        onClose={() => setReplacing(null)}
        title={t('cards.replaceTitle')}
        footer={
          <>
            <Button variant="soft" onClick={() => setReplacing(null)} disabled={replace.isPending}>
              {t('cards.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={replace.isPending}
              onClick={() =>
                replacing &&
                replace.mutate({ id: replacing.id, label: replaceLabel.trim() || null })
              }
            >
              {t('cards.replace')}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', marginBottom: 12, lineHeight: 1.6 }}>
          {t('cards.replaceBody').replace('{name}', replacing?.name ?? '')}
        </p>
        <label className="lbl2">{t('cards.label')}</label>
        <Input
          value={replaceLabel}
          placeholder={t('cards.labelPh')}
          onChange={(e) => setReplaceLabel(e.target.value)}
        />
      </Modal>

      {/* Issued card — show the token once, offer the printable PDF. */}
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
