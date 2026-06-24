import { useT } from '@/i18n'

// Billing is a faithful preview of design-billing.html. There is NO payment /
// invoicing backend yet, so everything here is non-functional sample data behind a
// coming-soon banner (all controls disabled). Wire to real payment/invoices later.

const Download = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
)
const Info = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
)
const Warn = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></svg>
)
const Pencil = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
)
const Star = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.8 1-5.8L3.5 9.2l5.9-.9Z" /></svg>
)
const Trash = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></svg>
)

const INVOICES = [
  { id: 'FAC-2026-006', date: '25 May 2026', period: 'May 2026', method: 'MTN MoMo', amount: '15 000 FCFA', status: 'paid' as const },
  { id: 'FAC-2026-005', date: '25 Apr 2026', period: 'Apr 2026', method: 'MTN MoMo', amount: '15 000 FCFA', status: 'paid' as const },
  { id: 'FAC-2026-004', date: '25 Mar 2026', period: 'Mar 2026', method: 'Orange Money', amount: '15 000 FCFA', status: 'paid' as const },
  { id: 'FAC-2026-003', date: '25 Feb 2026', period: 'Feb 2026', method: 'MTN MoMo', amount: '5 000 FCFA', status: 'solo' as const },
  { id: 'FAC-2026-002', date: '25 Jan 2026', period: 'Jan 2026', method: 'MTN MoMo', amount: '5 000 FCFA', status: 'solo' as const },
]

export function BillingSection() {
  const t = useT()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="banner warn"><Warn /><span>{t('bill.comingSoon')}</span></div>

      <div className="two-col">
        <div>
          {/* Payment methods */}
          <div className="card">
            <div className="card-h"><div><h3>{t('bill.pmTitle')}</h3><p>{t('bill.pmSub')}</p></div></div>
            <div className="pm-row primary">
              <div className="pm-logo momo">MoMo</div>
              <div className="pm-info">
                <div className="nm">MTN Mobile Money <span className="st st-brand"><span className="d" />{t('bill.primary')}</span></div>
                <div className="sub">+237 6 78 •• •• 02 · Henson Amah</div>
              </div>
              <div className="acts"><button type="button" disabled title={t('bill.edit')} aria-label={t('bill.edit')}><Pencil /></button></div>
            </div>
            <div className="pm-row">
              <div className="pm-logo om">OM</div>
              <div className="pm-info">
                <div className="nm">Orange Money</div>
                <div className="sub">+237 6 90 •• •• 77 · {t('bill.backup')}</div>
              </div>
              <div className="acts">
                <button type="button" disabled title={t('bill.makePrimary')} aria-label={t('bill.makePrimary')}><Star /></button>
                <button type="button" className="danger" disabled title={t('bill.remove')} aria-label={t('bill.remove')}><Trash /></button>
              </div>
            </div>
            <button className="add-pm" type="button" disabled>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M5 12h14" /></svg>
              {t('bill.addPm')}
            </button>
          </div>

          {/* Billing identity (OHADA) */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-h"><div><h3>{t('bill.identityTitle')}</h3><p>{t('bill.identitySub')}</p></div></div>
            <div className="field-row">
              <div><label className="lbl">{t('bill.legalName')}</label><input className="input" defaultValue="Boutique Mballa SARL" disabled /></div>
              <div><label className="lbl">{t('bill.billingEmail')}</label><input className="input" defaultValue="comptable@boutiquemballa.cm" disabled /></div>
            </div>
            <div className="field-row">
              <div><label className="lbl">{t('bill.niu')}</label><input className="input" defaultValue="P048512900233K" disabled /></div>
              <div><label className="lbl">{t('bill.rccm')}</label><input className="input" defaultValue="RC/DLA/2021/B/1542" disabled /></div>
            </div>
            <div className="field-row">
              <div><label className="lbl">{t('bill.address')}</label><input className="input" defaultValue="Akwa, Rue Joss · Douala" disabled /></div>
              <div><label className="lbl">{t('bill.region')}</label><input className="input" defaultValue="Littoral" disabled /></div>
            </div>
            <div className="form-note"><Info /><span>{t('bill.identityNote')}</span></div>
            <div className="fp-actions" style={{ marginTop: 16 }}>
              <button className="btn" type="button" disabled>{t('bill.cancel')}</button>
              <button className="btn btn-primary" type="button" disabled>{t('bill.save')}</button>
            </div>
          </div>

          {/* Invoice history */}
          <div className="panel" style={{ marginTop: 16 }}>
            <div className="panel-head">
              <h3>{t('bill.invTitle')}</h3>
              <div className="spacer" />
              <button className="btn" type="button" disabled><Download />{t('bill.downloadAll')}</button>
            </div>
            <table>
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
                    <td className="sub" style={{ color: 'var(--text-2)' }}>{inv.period}</td>
                    <td><span className="chip-tag">{inv.method}</span></td>
                    <td className="right inv-amt">{inv.amount}</td>
                    <td>
                      {inv.status === 'paid'
                        ? <span className="st st-ok"><span className="d" />{t('bill.paid')}</span>
                        : <span className="st st-neutral"><span className="d" />{t('bill.soloPlan')}</span>}
                    </td>
                    <td className="right"><button className="dl" type="button" disabled><Download />PDF</button></td>
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
          <div className="set-line"><div><div className="nm">{t('bill.autoRenew')}</div><div className="ds">{t('bill.autoRenewDesc')}</div></div><button type="button" className="switch on" disabled aria-pressed="true" /></div>
          <div className="set-line"><div><div className="nm">{t('bill.usageAlerts')}</div><div className="ds">{t('bill.usageAlertsDesc')}</div></div><button type="button" className="switch" disabled aria-pressed="false" /></div>
          <button className="btn" type="button" disabled style={{ width: '100%', justifyContent: 'center', marginTop: 14, color: 'var(--danger)', borderColor: 'var(--danger-soft)' }}>{t('bill.cancelSub')}</button>
        </div>
      </div>
    </div>
  )
}
