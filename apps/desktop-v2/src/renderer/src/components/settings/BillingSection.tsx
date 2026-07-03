import { useMemo, useRef, useState } from 'react'
import { Button, Input, PhoneInput, Select } from '@biztrack/ui/biztrack'
import { getCameroonNetwork, nationalCMDigits, type CameroonNetwork } from '@biztrack/utils'
import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'

// Billing — INTERACTIVE PREVIEW. There is no payment / invoicing backend yet, so
// everything here is wired to local component state (nothing is saved server-side or
// billed). It lets us click through the flows and refine the UX before wiring real
// payments. The coming-soon banner makes the preview status clear.

type PmType = 'momo' | 'om'
type Method = { id: string; type: PmType; phone: string; holder: string; primary: boolean }
type Identity = { legalName: string; billingEmail: string; niu: string; rccm: string; address: string; region: string }

const INITIAL_METHODS: Method[] = [
  { id: 'm1', type: 'momo', phone: '+237678221402', holder: 'Henson Amah', primary: true },
  { id: 'm2', type: 'om', phone: '+237690557731', holder: 'Backup method', primary: false },
]

const EXPECTED_NETWORK: Record<PmType, CameroonNetwork> = { momo: 'MTN', om: 'ORANGE' }

/** Pretty-print a stored E.164 CM number as "+237 6 78 22 14 02". */
function displayPhone(e164: string): string {
  const n = nationalCMDigits(e164)
  if (n.length !== 9) return e164
  return `+237 ${n[0]} ${n.slice(1, 3)} ${n.slice(3, 5)} ${n.slice(5, 7)} ${n.slice(7, 9)}`
}
const INITIAL_IDENTITY: Identity = {
  legalName: 'Boutique Mballa SARL',
  billingEmail: 'comptable@boutiquemballa.cm',
  niu: 'P048512900233K',
  rccm: 'RC/DLA/2021/B/1542',
  address: 'Akwa, Rue Joss · Douala',
  region: 'Littoral',
}
const REGIONS = ['Littoral', 'Centre', 'Ouest', 'Nord-Ouest', 'Sud-Ouest', 'Adamaoua', 'Est', 'Extrême-Nord', 'Nord', 'Sud']

const INVOICES = [
  { id: 'FAC-2026-006', date: '25 May 2026', period: 'May 2026', method: 'MTN MoMo', amount: '15 000 FCFA', status: 'paid' as const },
  { id: 'FAC-2026-005', date: '25 Apr 2026', period: 'Apr 2026', method: 'MTN MoMo', amount: '15 000 FCFA', status: 'paid' as const },
  { id: 'FAC-2026-004', date: '25 Mar 2026', period: 'Mar 2026', method: 'Orange Money', amount: '15 000 FCFA', status: 'paid' as const },
  { id: 'FAC-2026-003', date: '25 Feb 2026', period: 'Feb 2026', method: 'MTN MoMo', amount: '5 000 FCFA', status: 'solo' as const },
  { id: 'FAC-2026-002', date: '25 Jan 2026', period: 'Jan 2026', method: 'MTN MoMo', amount: '5 000 FCFA', status: 'solo' as const },
]

const Download = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>)
const Info = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>)
const Warn = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></svg>)
const Check = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6}><path d="m5 12 4 4L19 6" /></svg>)
const Pencil = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>)
const Star = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.8 1-5.8L3.5 9.2l5.9-.9Z" /></svg>)
const Trash = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></svg>)
const Plus = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M5 12h14" /></svg>)

function pmLabel(type: PmType, t: (k: MessageKey) => string): string {
  return type === 'momo' ? t('bill.momoType') : t('bill.omType')
}

export function BillingSection() {
  const t = useT()
  const idRef = useRef(100)
  const [methods, setMethods] = useState<Method[]>(INITIAL_METHODS)
  const [identity, setIdentity] = useState<Identity>(INITIAL_IDENTITY)
  const [savedIdentity, setSavedIdentity] = useState<Identity>(INITIAL_IDENTITY)
  const [autoRenew, setAutoRenew] = useState(true)
  const [usageAlerts, setUsageAlerts] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const [pmModal, setPmModal] = useState<{ mode: 'add' | 'edit'; method: Method } | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const flash = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2400)
  }

  const identityDirty = useMemo(() => JSON.stringify(identity) !== JSON.stringify(savedIdentity), [identity, savedIdentity])

  const makePrimary = (id: string) => {
    setMethods((ms) => ms.map((m) => ({ ...m, primary: m.id === id })))
    flash(t('bill.primarySet'))
  }
  const removeMethod = (id: string) => {
    setMethods((ms) => {
      const next = ms.filter((m) => m.id !== id)
      const first = next[0]
      if (first && !next.some((m) => m.primary)) next[0] = { ...first, primary: true }
      return next
    })
    flash(t('bill.removed'))
  }
  const saveMethod = (m: Method) => {
    setMethods((ms) => {
      let next = pmModal?.mode === 'edit' ? ms.map((x) => (x.id === m.id ? m : x)) : [...ms, m]
      if (m.primary) next = next.map((x) => ({ ...x, primary: x.id === m.id }))
      const first = next[0]
      if (first && !next.some((x) => x.primary)) next[0] = { ...first, primary: true }
      return next
    })
    setPmModal(null)
    flash(t('bill.savedLocally'))
  }

  const setId = <K extends keyof Identity>(k: K, v: Identity[K]) => setIdentity((p) => ({ ...p, [k]: v }))
  const saveIdentity = () => { setSavedIdentity(identity); flash(t('bill.identitySaved')) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="banner warn"><Warn /><span>{t('bill.comingSoon')}</span></div>

      <div className="two-col">
        <div>
          {/* Payment methods */}
          <div className="card">
            <div className="card-h"><div><h3>{t('bill.pmTitle')}</h3><p>{t('bill.pmSub')}</p></div></div>
            {cancelled ? <div className="form-note" style={{ marginBottom: 12 }}><Info /><span>{t('bill.cancelledNote')}</span></div> : null}
            {methods.map((m) => (
              <div className={`pm-row${m.primary ? ' primary' : ''}`} key={m.id}>
                <div className={`pm-logo ${m.type}`}>{m.type === 'momo' ? 'MoMo' : 'OM'}</div>
                <div className="pm-info">
                  <div className="nm">{pmLabel(m.type, t)}{m.primary ? <span className="st st-brand"><span className="d" />{t('bill.primary')}</span> : null}</div>
                  <div className="sub">{displayPhone(m.phone)} · {m.holder}</div>
                </div>
                <div className="acts">
                  <button type="button" title={t('bill.edit')} aria-label={t('bill.edit')} onClick={() => setPmModal({ mode: 'edit', method: m })}><Pencil /></button>
                  {!m.primary ? <button type="button" title={t('bill.makePrimary')} aria-label={t('bill.makePrimary')} onClick={() => makePrimary(m.id)}><Star /></button> : null}
                  {(() => {
                    const canDelete = cancelled || !m.primary
                    return (
                      <button type="button" className="danger" title={canDelete ? t('bill.remove') : t('bill.cantDeletePrimary')} aria-label={t('bill.remove')} disabled={!canDelete} onClick={() => removeMethod(m.id)}><Trash /></button>
                    )
                  })()}
                </div>
              </div>
            ))}
            <button className="add-pm" type="button" onClick={() => setPmModal({ mode: 'add', method: { id: `m${++idRef.current}`, type: 'momo', phone: '', holder: '', primary: methods.length === 0 } })}>
              <Plus />{t('bill.addPm')}
            </button>
          </div>

          {/* Billing identity (OHADA) */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-h"><div><h3>{t('bill.identityTitle')}</h3><p>{t('bill.identitySub')}</p></div></div>
            <div className="field-row">
              <div><label className="lbl">{t('bill.legalName')}</label><Input value={identity.legalName} onChange={(e) => setId('legalName', e.target.value)} /></div>
              <div><label className="lbl">{t('bill.billingEmail')}</label><Input type="email" value={identity.billingEmail} onChange={(e) => setId('billingEmail', e.target.value)} /></div>
            </div>
            <div className="field-row">
              <div><label className="lbl">{t('bill.niu')}</label><Input value={identity.niu} onChange={(e) => setId('niu', e.target.value)} /></div>
              <div><label className="lbl">{t('bill.rccm')}</label><Input value={identity.rccm} onChange={(e) => setId('rccm', e.target.value)} /></div>
            </div>
            <div className="field-row">
              <div><label className="lbl">{t('bill.address')}</label><Input value={identity.address} onChange={(e) => setId('address', e.target.value)} /></div>
              <div><label className="lbl">{t('bill.region')}</label><Select value={identity.region} onChange={(e) => setId('region', e.target.value)} options={REGIONS.map((r) => ({ value: r, label: r }))} /></div>
            </div>
            <div className="form-note"><Info /><span>{t('bill.identityNote')}</span></div>
            <div className="fp-actions" style={{ marginTop: 16 }}>
              <Button variant="soft" type="button" disabled={!identityDirty} onClick={() => setIdentity(savedIdentity)}>{t('bill.cancel')}</Button>
              <Button variant="primary" type="button" disabled={!identityDirty} onClick={saveIdentity}>{t('bill.save')}</Button>
            </div>
          </div>

          {/* Invoice history */}
          <div className="panel" style={{ marginTop: 16 }}>
            <div className="panel-head">
              <h3>{t('bill.invTitle')}</h3>
              <div className="spacer" />
              <button className="btn" type="button" onClick={() => flash(t('bill.noFile'))}><Download />{t('bill.downloadAll')}</button>
            </div>
            <table className="ltbl">
              <thead>
                <tr>
                  <th>{t('bill.colInvoice')}</th><th>{t('bill.colDate')}</th><th>{t('bill.colPeriod')}</th>
                  <th>{t('bill.colMethod')}</th><th className="right">{t('bill.colAmount')}</th><th>{t('bill.colStatus')}</th><th className="right">{t('bill.colReceipt')}</th>
                </tr>
              </thead>
              <tbody>
                {INVOICES.map((inv) => (
                  <tr key={inv.id}>
                    <td className="mono">{inv.id}</td>
                    <td>{inv.date}</td>
                    <td style={{ color: 'var(--text-2)' }}>{inv.period}</td>
                    <td><span className="chip-tag">{inv.method}</span></td>
                    <td className="right inv-amt">{inv.amount}</td>
                    <td>
                      {inv.status === 'paid'
                        ? <span className="st st-ok"><span className="d" />{t('bill.paid')}</span>
                        : <span className="st st-neutral"><span className="d" />{t('bill.soloPlan')}</span>}
                    </td>
                    <td className="right"><button className="dl" type="button" onClick={() => flash(t('bill.noFile'))}><Download />PDF</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="panel-foot"><span>{t('bill.totalBilled')} · 55 000 FCFA</span><div className="spacer" /><span>{t('bill.page')}</span></div>
          </div>
        </div>

        {/* Next charge */}
        <div className="card side-card">
          <div className="card-h"><div><h3>{t('bill.nextTitle')}</h3><p>{t('bill.nextSub')}</p></div></div>
          <div className="next-sum">
            <div className="r"><span className="k">{t('bill.businessPlan')}</span><span className="v">15 000 FCFA</span></div>
            <div className="r"><span className="k">{t('bill.onlineStore')}</span><span className="v">{t('bill.included')}</span></div>
            <div className="r"><span className="k">{t('bill.tva')}</span><span className="v">2 888 FCFA</span></div>
            <div className="r tot"><span className="k">{t('bill.due').replace('{date}', '25 Jun 2026')}</span><span className="v">17 888 FCFA</span></div>
          </div>
          <div className="form-note" style={{ marginTop: 14 }}><Info /><span>{t('bill.chargeNote')}</span></div>
          <div className="set-line"><div><div className="nm">{t('bill.autoRenew')}</div><div className="ds">{t('bill.autoRenewDesc')}</div></div><button type="button" className={`switch${autoRenew ? ' on' : ''}`} aria-pressed={autoRenew} onClick={() => setAutoRenew((v) => !v)} /></div>
          <div className="set-line"><div><div className="nm">{t('bill.usageAlerts')}</div><div className="ds">{t('bill.usageAlertsDesc')}</div></div><button type="button" className={`switch${usageAlerts ? ' on' : ''}`} aria-pressed={usageAlerts} onClick={() => setUsageAlerts((v) => !v)} /></div>
          <button className="btn" type="button" disabled={cancelled} onClick={() => setConfirmCancel(true)} style={{ width: '100%', justifyContent: 'center', marginTop: 14, color: cancelled ? undefined : 'var(--danger)', borderColor: cancelled ? undefined : 'var(--danger-soft)' }}>{cancelled ? t('bill.cancelPending') : t('bill.cancelSub')}</button>
        </div>
      </div>

      {pmModal ? (
        <PaymentMethodModal
          mode={pmModal.mode}
          method={pmModal.method}
          onCancel={() => setPmModal(null)}
          onSave={saveMethod}
        />
      ) : null}

      {confirmCancel ? (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmCancel(false) }}>
          <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: 420 }}>
            <div className="modal-head"><h2>{t('bill.confirmCancelTitle')}</h2></div>
            <div className="modal-body" style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{t('bill.confirmCancelBody')}</div>
            <div className="modal-foot">
              <Button variant="soft" type="button" onClick={() => setConfirmCancel(false)}>{t('bill.keepSub')}</Button>
              <Button variant="primary" type="button" onClick={() => { setConfirmCancel(false); setCancelled(true); flash(t('bill.cancelRequested')) }}>{t('bill.cancelSub')}</Button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div style={{ position: 'fixed', right: 22, bottom: 22, zIndex: 60, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 16px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', fontSize: 13, fontWeight: 600 }}>
          <span style={{ color: 'var(--success)', display: 'inline-flex' }}><Check /></span>{toast}
        </div>
      ) : null}
    </div>
  )
}

function PaymentMethodModal({
  mode,
  method,
  onCancel,
  onSave,
}: {
  mode: 'add' | 'edit'
  method: Method
  onCancel: () => void
  onSave: (m: Method) => void
}) {
  const t = useT()
  const [draft, setDraft] = useState<Method>(method)
  const expected = EXPECTED_NETWORK[draft.type]
  const network = getCameroonNetwork(draft.phone || '')
  const hasPhone = nationalCMDigits(draft.phone || '').length >= 9
  const networkOk = network === expected
  const phoneError = hasPhone && !networkOk
  const valid = networkOk && draft.holder.trim().length > 0
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: 440 }}>
        <div className="modal-head"><h2>{mode === 'add' ? t('bill.addTitle') : t('bill.editTitle')}</h2></div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div className="ff">
            <label className="lbl2">{t('bill.pmType')}</label>
            <Select
              value={draft.type}
              onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value as PmType }))}
              options={[{ value: 'momo', label: t('bill.momoType') }, { value: 'om', label: t('bill.omType') }]}
            />
          </div>
          <div className={`ff${phoneError ? ' invalid' : ''}`}>
            <label className="lbl2">{t('bill.pmPhone')}</label>
            <PhoneInput
              value={draft.phone || undefined}
              error={phoneError}
              defaultCountry="CM"
              placeholder="6 78 22 14 02"
              onChange={(v) => setDraft((d) => ({ ...d, phone: v ?? '' }))}
            />
            {phoneError ? (
              <div className="msg err">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
                <span>{t(draft.type === 'momo' ? 'bill.pmInvalidMomo' : 'bill.pmInvalidOm')}</span>
              </div>
            ) : null}
          </div>
          <div className="ff">
            <label className="lbl2">{t('bill.pmHolder')}</label>
            <Input value={draft.holder} placeholder="Henson Amah" onChange={(e) => setDraft((d) => ({ ...d, holder: e.target.value }))} />
          </div>
          <label className="chk">
            <input type="checkbox" checked={draft.primary} onChange={(e) => setDraft((d) => ({ ...d, primary: e.target.checked }))} />
            <span className="bx"><Check /></span>
            <span>{t('bill.pmSetPrimary')}</span>
          </label>
        </div>
        <div className="modal-foot">
          <Button variant="soft" type="button" onClick={onCancel}>{t('bill.cancel')}</Button>
          <Button variant="primary" type="button" disabled={!valid} onClick={() => onSave(draft)}>{t('bill.save')}</Button>
        </div>
      </div>
    </div>
  )
}
