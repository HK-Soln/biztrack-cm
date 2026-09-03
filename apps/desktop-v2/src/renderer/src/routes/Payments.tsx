import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Modal } from '@biztrack/ui/biztrack'
import {
  PaymentMethod,
  PaymentProviderConnectionStatus,
  ROUTABLE_PAYMENT_METHODS,
  type PaymentProvider,
} from '@biztrack/types'
import { dataClient } from '@/lib/data-client'
import { useSessionStore } from '@/stores/session.store'
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

const STATUS_MUTED = { bg: 'var(--inset)', fg: 'var(--text-muted)' }
const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  ACTIVE: { bg: 'var(--success-soft)', fg: 'var(--success)' },
  FAILED: { bg: 'var(--danger-soft, #fde8e8)', fg: 'var(--danger)' },
  PENDING_VERIFICATION: { bg: 'var(--warn-soft, #fff4e5)', fg: 'var(--warn, #b26a00)' },
  PROVIDER_UNAVAILABLE: STATUS_MUTED,
  REVOKED: STATUS_MUTED,
}

/**
 * Spec 07 — owner-only payments settings: connect a provider (credentials are write-only, never
 * returned), see verification status, and route each method to a verified provider. Online-only.
 */
export function Payments() {
  const t = useT()
  const nav = useNavigate()
  const qc = useQueryClient()
  const role = useSessionStore((s) => s.status.user?.role)
  const isOwner = (role ?? '').toUpperCase() === 'OWNER'

  const providersQ = useQuery({
    queryKey: ['payments', 'providers'],
    queryFn: () => dataClient.payments.listProviders(),
    enabled: isOwner,
  })
  const connsQ = useQuery({
    queryKey: ['payments', 'connections'],
    queryFn: () => dataClient.payments.listConnections(),
    enabled: isOwner,
  })
  const routesQ = useQuery({
    queryKey: ['payments', 'routes'],
    queryFn: () => dataClient.payments.listRoutes(),
    enabled: isOwner,
  })

  const [error, setError] = useState<string | null>(null)
  const [connectFor, setConnectFor] = useState<PaymentProvider | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})

  const providers = providersQ.data ?? []
  const connections = connsQ.data ?? []
  const routes = useMemo(() => routesQ.data ?? [], [routesQ.data])
  const routeByMethod = useMemo(() => new Map(routes.map((r) => [r.paymentMethod, r])), [routes])

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['payments'] })
  }

  const connect = useMutation({
    mutationFn: (input: { providerCode: string; credentials: Record<string, string> }) =>
      dataClient.payments.connect(input),
    onSuccess: () => {
      setConnectFor(null)
      setForm({})
      invalidate()
    },
    onError: (e) => setError(errorMessage(e, t('pay.connectFailed'))),
  })
  const verify = useMutation({
    mutationFn: (id: string) => dataClient.payments.verify(id),
    onSuccess: invalidate,
    onError: (e) => setError(errorMessage(e, t('pay.verifyFailed'))),
  })
  const revoke = useMutation({
    mutationFn: (id: string) => dataClient.payments.revoke(id),
    onSuccess: invalidate,
    onError: (e) => setError(errorMessage(e, t('pay.revokeFailed'))),
  })
  const setRoute = useMutation({
    mutationFn: (input: { paymentMethod: PaymentMethod; providerId: string }) =>
      dataClient.payments.setRoute(input),
    onSuccess: invalidate,
    onError: (e) => setError(errorMessage(e, t('pay.routeFailed'))),
  })
  const removeRoute = useMutation({
    mutationFn: (id: string) => dataClient.payments.removeRoute(id),
    onSuccess: invalidate,
    onError: (e) => setError(errorMessage(e, t('pay.routeFailed'))),
  })

  if (!isOwner) return null

  const openConnect = (p: PaymentProvider) => {
    setError(null)
    setForm(Object.fromEntries(p.credentialSchema.map((f) => [f.key, f.options?.[0] ?? ''])))
    setConnectFor(p)
  }

  const providerName = (code: string) => providers.find((p) => p.code === code)?.name ?? code

  // Connections whose account is ACTIVE + verified for a given method (routing candidates).
  const candidatesFor = (method: PaymentMethod) =>
    connections.filter(
      (c) =>
        c.status === PaymentProviderConnectionStatus.ACTIVE && c.verifiedMethods.includes(method),
    )

  return (
    <div className="frame">
      <div className="page-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="back"
            onClick={() => nav('/settings')}
            aria-label={t('pay.back')}
          >
            <Back />
          </button>
          <div>
            <h1>{t('pay.title')}</h1>
            <p>{t('pay.sub')}</p>
          </div>
        </div>
      </div>

      {error ? (
        <div className="banner warn" style={{ marginBottom: 12 }}>
          <span>{error}</span>
        </div>
      ) : null}

      {/* Connected providers */}
      <div className="card">
        <div className="card-h">
          <div>
            <h3>{t('pay.providersTitle')}</h3>
            <p>{t('pay.providersSub')}</p>
          </div>
        </div>

        {connsQ.isLoading ? (
          <div style={{ padding: '24px 8px', color: 'var(--text-muted)', fontSize: 13 }}>
            {t('pay.loading')}
          </div>
        ) : connections.length === 0 ? (
          <div
            style={{
              padding: '28px 16px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 13,
            }}
          >
            {t('pay.noConnections')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {connections.map((c) => {
              const s = STATUS_STYLE[c.status] ?? STATUS_MUTED
              return (
                <div
                  key={c.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 0',
                    borderTop: '1px solid var(--border)',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {providerName(c.providerCode)}
                      <span className="chip-tag" style={{ background: s.bg, color: s.fg }}>
                        {c.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="cash-muted" style={{ fontSize: 12, marginTop: 2 }}>
                      {c.lastFour ? `••••${c.lastFour}` : t('pay.noKey')}
                      {c.verifiedMethods.length
                        ? ` · ${t('pay.approvedFor')}: ${c.verifiedMethods.join(', ')}`
                        : ''}
                    </div>
                    {c.verificationError ? (
                      <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 2 }}>
                        {c.verificationError}
                      </div>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="soft"
                    onClick={() => verify.mutate(c.id)}
                    disabled={verify.isPending}
                  >
                    {t('pay.verify')}
                  </Button>
                  <Button
                    type="button"
                    variant="soft"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => revoke.mutate(c.id)}
                    disabled={revoke.isPending}
                  >
                    {t('pay.revoke')}
                  </Button>
                </div>
              )
            })}
          </div>
        )}

        {/* Add provider */}
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {providers.map((p) => (
            <Button key={p.code} type="button" variant="soft" onClick={() => openConnect(p)}>
              <Plus />
              {connections.some((c) => c.providerCode === p.code)
                ? t('pay.reconnect').replace('{name}', p.name)
                : t('pay.connect').replace('{name}', p.name)}
            </Button>
          ))}
        </div>
      </div>

      {/* Routing */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-h">
          <div>
            <h3>{t('pay.routingTitle')}</h3>
            <p>{t('pay.routingSub')}</p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {ROUTABLE_PAYMENT_METHODS.map((method) => {
            const route = routeByMethod.get(method)
            const candidates = candidatesFor(method)
            return (
              <div
                key={method}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 0',
                  borderTop: '1px solid var(--border)',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1, minWidth: 120, fontWeight: 600 }}>{method}</div>
                {candidates.length === 0 && !route ? (
                  <span className="cash-muted" style={{ fontSize: 12 }}>
                    {t('pay.noProviderForMethod')}
                  </span>
                ) : (
                  <select
                    className="input"
                    style={{ maxWidth: 260 }}
                    value={route?.providerId ?? ''}
                    onChange={(e) => {
                      const providerId = e.target.value
                      if (!providerId) {
                        if (route) removeRoute.mutate(route.id)
                      } else {
                        setRoute.mutate({ paymentMethod: method, providerId })
                      }
                    }}
                    disabled={setRoute.isPending || removeRoute.isPending}
                  >
                    <option value="">{t('pay.notRouted')}</option>
                    {candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {providerName(c.providerCode)} (
                        {c.lastFour ? `••${c.lastFour}` : c.id.slice(0, 6)})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Connect dialog — fields driven by the provider's credential schema. */}
      <Modal
        open={!!connectFor}
        onClose={() => setConnectFor(null)}
        title={connectFor ? t('pay.connectTitle').replace('{name}', connectFor.name) : ''}
        footer={
          <>
            <Button variant="soft" onClick={() => setConnectFor(null)} disabled={connect.isPending}>
              {t('pay.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={connect.isPending}
              onClick={() =>
                connectFor && connect.mutate({ providerCode: connectFor.code, credentials: form })
              }
            >
              {t('pay.connectSave')}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12, lineHeight: 1.5 }}>
          {t('pay.connectBody')}
        </p>
        {error ? (
          <div className="msg err" style={{ marginBottom: 12 }}>
            <span>{error}</span>
          </div>
        ) : null}
        {connectFor?.credentialSchema.map((f) => (
          <div key={f.key} style={{ marginBottom: 12 }}>
            <label className="lbl2">{f.labelEn}</label>
            {f.type === 'select' ? (
              <select
                className="input"
                value={form[f.key] ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
              >
                {(f.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                type={f.secret || f.type === 'password' ? 'password' : 'text'}
                value={form[f.key] ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
              />
            )}
          </div>
        ))}
      </Modal>
    </div>
  )
}
