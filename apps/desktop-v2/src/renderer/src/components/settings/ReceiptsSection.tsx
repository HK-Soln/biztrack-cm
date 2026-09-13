import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, PhoneInput, Select } from '@biztrack/ui/biztrack'
import {
  DEFAULT_RECEIPT_SETTINGS,
  DEFAULT_RECEIPT_NUMBER_PREFIX,
  PaymentMethod,
  type ReceiptSettings,
  type SaleReceipt,
} from '@biztrack/types'
import { renderSaleReceiptHtml, saleReceiptLabels } from '@biztrack/templates'
import { dataClient } from '@/lib/data-client'
import { useLangStore, useT } from '@/i18n'
import { errorMessage } from '@/lib/error'
import {
  loadReceiptPrintSettings,
  saveReceiptPrintSettings,
  type ReceiptPrintSettings,
} from '@/lib/receipt-print-settings'

const PAPERS: Array<{ mm: number; label: string; sub: 'rcp.thermal' | 'rcp.compact' }> = [
  { mm: 80, label: '80 mm', sub: 'rcp.thermal' },
  { mm: 58, label: '58 mm', sub: 'rcp.compact' },
]

function Toggle({
  nm,
  ds,
  on,
  onToggle,
}: {
  nm: string
  ds: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <div className="set-line">
      <div>
        <div className="nm">{nm}</div>
        <div className="ds">{ds}</div>
      </div>
      <button
        type="button"
        className={`switch${on ? ' on' : ''}`}
        aria-pressed={on}
        onClick={onToggle}
      />
    </div>
  )
}

// A representative sample sale so the preview shows the real template exactly as it prints.
function sampleReceipt(
  s: ReceiptSettings,
  identity: { name: string; phone: string; address: string; niu: string },
  prefix: string,
): SaleReceipt {
  return {
    businessName: identity.name || 'Ma Boutique',
    businessPhone: identity.phone || '+237 6 78 21 44 02',
    businessAddress: identity.address || 'Akwa, Douala',
    businessNiu: identity.niu || 'P048512900233K',
    businessLogoUrl: null,
    saleNumber: `${prefix}${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-0147`,
    soldAt: new Date().toISOString(),
    cashierName: 'Junior T.',
    customerName: null,
    items: [
      { name: 'Riz parfumé 5kg', qty: 2, unitPrice: 6500, total: 13000 },
      { name: 'Huile végétale 5L', qty: 1, unitPrice: 5500, total: 5500 },
      { name: 'Lait concentré', qty: 6, unitPrice: 650, total: 3900 },
    ],
    subtotal: 22400,
    discountAmount: 0,
    chargesAmount: 0,
    totalAmount: 22400,
    amountPaid: 22400,
    creditAmount: 0,
    changeGiven: 0,
    currency: 'XAF',
    payments: [{ method: PaymentMethod.MTN_MOMO, amount: 22400 }],
    footer: s.thanksMessage || null,
  }
}

export function ReceiptsSection() {
  const t = useT()
  const qc = useQueryClient()
  const lang = useLangStore((x) => x.lang)

  const profileQ = useQuery({
    queryKey: ['business', 'profile'],
    queryFn: () => dataClient.business.getProfile(),
    retry: false,
  })

  // --- business-level form state (saved to the profile) ---
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [niu, setNiu] = useState('')
  const [prefix, setPrefix] = useState(DEFAULT_RECEIPT_NUMBER_PREFIX)
  const [s, setS] = useState<ReceiptSettings>(DEFAULT_RECEIPT_SETTINGS)
  // --- device-local print settings ---
  const [print, setPrint] = useState<ReceiptPrintSettings>(() => loadReceiptPrintSettings())
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load once the profile arrives.
  useEffect(() => {
    const p = profileQ.data
    if (!p) return
    setName(p.name ?? '')
    setPhone(p.phone ?? '')
    setAddress([p.address, p.city].filter(Boolean).join(', '))
    setNiu(p.niu ?? '')
    setPrefix(p.receiptNumberPrefix || DEFAULT_RECEIPT_NUMBER_PREFIX)
    setS({ ...DEFAULT_RECEIPT_SETTINGS, ...(p.receiptSettings ?? {}) })
  }, [profileQ.data])

  const set = <K extends keyof ReceiptSettings>(k: K, v: ReceiptSettings[K]) =>
    setS((prev) => ({ ...prev, [k]: v }))

  const save = useMutation({
    mutationFn: async () => {
      await dataClient.business.update({
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        niu: niu.trim() || undefined,
        receiptNumberPrefix: prefix.trim() || DEFAULT_RECEIPT_NUMBER_PREFIX,
        receiptSettings: s,
      })
      saveReceiptPrintSettings(print)
    },
    onSuccess: () => {
      setError(null)
      setToast(t('rcp.saved'))
      void qc.invalidateQueries({ queryKey: ['business', 'profile'] })
    },
    onError: (e) => setError(errorMessage(e, t('rcp.saveError'))),
  })
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(id)
  }, [toast])

  // Live preview via the REAL template → exactly what prints.
  const previewHtml = useMemo(
    () =>
      renderSaleReceiptHtml(sampleReceipt(s, { name, phone, address, niu }, prefix), {
        labels: saleReceiptLabels(lang),
        locale: lang,
        widthMm: s.paperWidthMm,
        showNiu: s.showNiu,
        showCashier: s.showCashier,
        showPayment: s.showPayment,
        showThanks: s.showThanks,
        showLogo: s.showLogo,
        showQr: s.showQr,
      }),
    [s, name, phone, address, niu, prefix, lang],
  )

  const paperLabel = PAPERS.find((p) => p.mm === s.paperWidthMm)?.label ?? '80 mm'

  return (
    <div className="rc-grid">
      <div className="rc-main">
        <div className="page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1>{t('rcp.title')}</h1>
            <p>{t('rcp.subtitle')}</p>
          </div>
          <Button variant="primary" type="button" loading={save.isPending} onClick={() => save.mutate()}>
            {t('rcp.save')}
          </Button>
        </div>
        {error ? (
          <p style={{ color: 'var(--danger)', fontSize: 12.5 }} role="alert">
            {error}
          </p>
        ) : null}

        {/* Header & footer */}
        <div className="card">
          <div className="card-h">
            <div>
              <h3>{t('rcp.headerTitle')}</h3>
              <p>{t('rcp.headerSub')}</p>
            </div>
          </div>
          <div className="field-row">
            <div>
              <label className="lbl">{t('rcp.bizName')}</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="lbl">{t('rcp.phone')}</label>
              <PhoneInput
                value={phone || undefined}
                defaultCountry="CM"
                onChange={(v) => setPhone(v ?? '')}
              />
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <label className="lbl">{t('rcp.address')}</label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="field-row" style={{ marginTop: 14 }}>
            <div>
              <label className="lbl">{t('rcp.niu')}</label>
              <Input value={niu} placeholder="P0000000000A" onChange={(e) => setNiu(e.target.value)} />
            </div>
            <div>
              <label className="lbl">{t('rcp.footer')}</label>
              <Input
                value={s.thanksMessage ?? ''}
                placeholder={t('rcp.footerPh')}
                onChange={(e) => set('thanksMessage', e.target.value || null)}
              />
            </div>
          </div>
        </div>

        {/* Content toggles */}
        <div className="card">
          <div className="card-h">
            <div>
              <h3>{t('rcp.contentTitle')}</h3>
              <p>{t('rcp.contentSub')}</p>
            </div>
          </div>
          <Toggle nm={t('rcp.logo')} ds={t('rcp.logoDesc')} on={s.showLogo} onToggle={() => set('showLogo', !s.showLogo)} />
          <Toggle nm={t('rcp.niu')} ds={t('rcp.niuDesc')} on={s.showNiu} onToggle={() => set('showNiu', !s.showNiu)} />
          <Toggle nm={t('rcp.cashier')} ds={t('rcp.cashierDesc')} on={s.showCashier} onToggle={() => set('showCashier', !s.showCashier)} />
          <Toggle nm={t('rcp.payment')} ds={t('rcp.paymentDesc')} on={s.showPayment} onToggle={() => set('showPayment', !s.showPayment)} />
          <Toggle nm={t('rcp.qr')} ds={t('rcp.qrDesc')} on={s.showQr} onToggle={() => set('showQr', !s.showQr)} />
          <Toggle nm={t('rcp.thanks')} ds={t('rcp.thanksDesc')} on={s.showThanks} onToggle={() => set('showThanks', !s.showThanks)} />
        </div>

        {/* Numbering & paper (business-level) */}
        <div className="card">
          <div className="card-h">
            <div>
              <h3>{t('rcp.numTitle')}</h3>
              <p>{t('rcp.numSub')}</p>
            </div>
          </div>
          <label className="lbl">{t('rcp.prefix')}</label>
          <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} />
          <div className="reserved-note">{t('rcp.prefixHint')}</div>
          <label className="lbl" style={{ marginTop: 14 }}>
            {t('rcp.paper')}
          </label>
          <div className="psz-grid">
            {PAPERS.map((p) => (
              <button
                key={p.mm}
                type="button"
                className={`psz${s.paperWidthMm === p.mm ? ' sel' : ''}`}
                onClick={() => set('paperWidthMm', p.mm)}
              >
                <div className="pw">{p.label}</div>
                <div className="pd">{t(p.sub)}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Printing (device-local) */}
        <div className="card">
          <div className="card-h">
            <div>
              <h3>{t('rcp.printTitle')}</h3>
              <p>{t('rcp.printSub')}</p>
            </div>
          </div>
          <Toggle
            nm={t('rcp.autoPrint')}
            ds={t('rcp.autoPrintDesc')}
            on={print.autoPrint}
            onToggle={() => setPrint((p) => ({ ...p, autoPrint: !p.autoPrint }))}
          />
          <div className="field-row" style={{ marginTop: 14, marginBottom: 0 }}>
            <div>
              <label className="lbl">{t('rcp.copies')}</label>
              <Select
                value={String(print.copies)}
                onChange={(e) => setPrint((p) => ({ ...p, copies: Number(e.target.value) }))}
                options={[
                  { value: '1', label: t('rcp.copy1') },
                  { value: '2', label: t('rcp.copy2') },
                ]}
              />
            </div>
            <div>
              <label className="lbl">{t('rcp.printer')}</label>
              <Select
                value={print.printerName ?? ''}
                onChange={(e) => setPrint((p) => ({ ...p, printerName: e.target.value || null }))}
                options={[{ value: '', label: t('rcp.sysDialog') }]}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Live preview — the real template */}
      <div className="rc-side">
        <div className="rc-pv-head">
          <span className="lbl">{t('rcp.livePreview')}</span>
          <span className="chip-tag">{paperLabel}</span>
        </div>
        <div className="paper-stage">
          <iframe
            title={t('rcp.livePreview')}
            srcDoc={previewHtml}
            style={{
              width: s.paperWidthMm === 58 ? 240 : 300,
              height: 520,
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: '#fff',
            }}
          />
        </div>
      </div>

      {toast ? (
        <div className="sc-toast show">
          <span>{toast}</span>
        </div>
      ) : null}
    </div>
  )
}
