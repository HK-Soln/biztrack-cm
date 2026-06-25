import { useState } from 'react'
import { Input, PhoneInput, Select } from '@biztrack/ui/biztrack'
import { useT } from '@/i18n'

// Receipts — INTERACTIVE PREVIEW (design-receipts.html). No backend yet for receipt
// settings, so everything is local state behind a coming-soon banner. The thermal
// receipt on the right updates live from the fields and toggles.

type Paper = '280' | '210' | '320'
const PAPERS: Array<{ w: Paper; label: string; sub: string }> = [
  { w: '280', label: '80 mm', sub: 'rcp.thermal' },
  { w: '210', label: '58 mm', sub: 'rcp.compact' },
  { w: '320', label: 'A4', sub: 'rcp.invoice' },
]

const Info = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>)
const Warn = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></svg>)

function Toggle({ nm, ds, on, onToggle }: { nm: string; ds: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="set-line">
      <div><div className="nm">{nm}</div><div className="ds">{ds}</div></div>
      <button type="button" className={`switch${on ? ' on' : ''}`} aria-pressed={on} onClick={onToggle} />
    </div>
  )
}

export function ReceiptsSection() {
  const t = useT()
  const [name, setName] = useState('Boutique Mballa')
  const [phone, setPhone] = useState('+237678214402')
  const [address, setAddress] = useState('Akwa, Rue Joss · Douala, Littoral')
  const [thanks, setThanks] = useState('Merci de votre visite ! À bientôt.')
  const [prefix, setPrefix] = useState('BM-')
  const [nextNum, setNextNum] = useState('0001847')
  const [paper, setPaper] = useState<Paper>('280')
  // content toggles
  const [showNiu, setShowNiu] = useState(true)
  const [showTax, setShowTax] = useState(true)
  const [showCashier, setShowCashier] = useState(true)
  const [showPayment, setShowPayment] = useState(true)
  const [showQr, setShowQr] = useState(true)
  const [showThanks, setShowThanks] = useState(true)
  // print toggles
  const [autoPrint, setAutoPrint] = useState(true)
  const [digital, setDigital] = useState(true)
  const [copies, setCopies] = useState('1')
  const [printer, setPrinter] = useState('xp80')

  const paperLabel = PAPERS.find((p) => p.w === paper)?.label ?? '80 mm'

  return (
    <div className="rc-grid">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="banner warn"><Warn /><span>{t('rcp.comingSoon')}</span></div>

        {/* Header & footer */}
        <div className="card">
          <div className="card-h"><div><h3>{t('rcp.headerTitle')}</h3><p>{t('rcp.headerSub')}</p></div></div>
          <div className="field-row">
            <div><label className="lbl">{t('rcp.bizName')}</label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><label className="lbl">{t('rcp.phone')}</label><PhoneInput value={phone || undefined} defaultCountry="CM" onChange={(v) => setPhone(v ?? '')} /></div>
          </div>
          <div><label className="lbl">{t('rcp.address')}</label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
          <div style={{ marginTop: 14 }}><label className="lbl">{t('rcp.footer')}</label><Input value={thanks} onChange={(e) => setThanks(e.target.value)} /></div>
        </div>

        {/* Content toggles */}
        <div className="card">
          <div className="card-h"><div><h3>{t('rcp.contentTitle')}</h3><p>{t('rcp.contentSub')}</p></div></div>
          <Toggle nm={t('rcp.niu')} ds={t('rcp.niuDesc')} on={showNiu} onToggle={() => setShowNiu((v) => !v)} />
          <Toggle nm={t('rcp.tax')} ds={t('rcp.taxDesc')} on={showTax} onToggle={() => setShowTax((v) => !v)} />
          <Toggle nm={t('rcp.cashier')} ds={t('rcp.cashierDesc')} on={showCashier} onToggle={() => setShowCashier((v) => !v)} />
          <Toggle nm={t('rcp.payment')} ds={t('rcp.paymentDesc')} on={showPayment} onToggle={() => setShowPayment((v) => !v)} />
          <Toggle nm={t('rcp.qr')} ds={t('rcp.qrDesc')} on={showQr} onToggle={() => setShowQr((v) => !v)} />
          <Toggle nm={t('rcp.thanks')} ds={t('rcp.thanksDesc')} on={showThanks} onToggle={() => setShowThanks((v) => !v)} />
        </div>

        {/* Numbering & printing */}
        <div className="card">
          <div className="card-h"><div><h3>{t('rcp.numTitle')}</h3><p>{t('rcp.numSub')}</p></div></div>
          <div className="field-row">
            <div><label className="lbl">{t('rcp.prefix')}</label><Input value={prefix} onChange={(e) => setPrefix(e.target.value)} /></div>
            <div><label className="lbl">{t('rcp.nextNum')}</label><Input value={nextNum} onChange={(e) => setNextNum(e.target.value)} /></div>
          </div>
          <label className="lbl">{t('rcp.paper')}</label>
          <div className="psz-grid">
            {PAPERS.map((p) => (
              <button key={p.w} type="button" className={`psz${paper === p.w ? ' sel' : ''}`} onClick={() => setPaper(p.w)}>
                <div className="pw">{p.label}</div><div className="pd">{t(p.sub as Parameters<typeof t>[0])}</div>
              </button>
            ))}
          </div>
          <div className="divider" />
          <Toggle nm={t('rcp.autoPrint')} ds={t('rcp.autoPrintDesc')} on={autoPrint} onToggle={() => setAutoPrint((v) => !v)} />
          <Toggle nm={t('rcp.digital')} ds={t('rcp.digitalDesc')} on={digital} onToggle={() => setDigital((v) => !v)} />
          <div className="field-row" style={{ marginTop: 14, marginBottom: 0 }}>
            <div><label className="lbl">{t('rcp.copies')}</label><Select value={copies} onChange={(e) => setCopies(e.target.value)} options={[{ value: '1', label: t('rcp.copy1') }, { value: '2', label: t('rcp.copy2') }]} /></div>
            <div><label className="lbl">{t('rcp.printer')}</label><Select value={printer} onChange={(e) => setPrinter(e.target.value)} options={[{ value: 'xp80', label: 'XPrinter XP-80 (USB)' }, { value: 'epson', label: 'Epson TM-T20' }, { value: 'dialog', label: t('rcp.sysDialog') }]} /></div>
          </div>
        </div>
      </div>

      {/* Live preview */}
      <div className="rc-side">
        <div className="rc-pv-head"><span className="lbl">{t('rcp.livePreview')}</span><span className="chip-tag">{paperLabel}</span></div>
        <div className="paper-stage">
          <div className="rcpt" style={{ width: Number(paper) }}>
            <div className="ctr">
              <div className="logo">B</div>
              <div className="biz">{name || t('rcp.bizName')}</div>
              <div className="muted">{address}</div>
              <div className="muted">Tél : {phone}</div>
              {showNiu ? <div className="muted">NIU : P048512900233K</div> : null}
            </div>
            <div className="hr" />
            <div className="line"><span>Reçu</span><span>{prefix}{nextNum}</span></div>
            <div className="line"><span>25/06/2026</span><span>14:32</span></div>
            {showCashier ? <div className="line"><span>Caissier</span><span>Junior T.</span></div> : null}
            <div className="hr" />
            <div className="it">
              <div className="line"><span className="nm">Riz parfumé 5kg ×2</span><span>13 000</span></div>
              <div className="line"><span className="nm">Huile végétale 5L</span><span>5 500</span></div>
              <div className="line"><span className="nm">Lait concentré ×6</span><span>3 900</span></div>
            </div>
            <div className="hr" />
            {showTax ? (
              <div>
                <div className="line muted"><span>Total HT</span><span>18 793</span></div>
                <div className="line muted"><span>TVA 19,25%</span><span>3 607</span></div>
              </div>
            ) : null}
            <div className="line tot"><span>TOTAL TTC</span><span>22 400 FCFA</span></div>
            {showPayment ? <div className="line"><span>MTN MoMo</span><span>22 400</span></div> : null}
            <div className="hr" />
            {showQr ? <div className="qr" /> : null}
            {showThanks ? <div className="ctr thanks">{thanks}</div> : null}
          </div>
        </div>
        <div className="form-note"><Info /><span>{t('rcp.previewNote')}</span></div>
      </div>
    </div>
  )
}
