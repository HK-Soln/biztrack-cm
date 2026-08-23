import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Select } from '@biztrack/ui/biztrack'
import { FiscalRegime, type BusinessProfile } from '@biztrack/types'
import { dataClient } from '@/lib/data-client'
import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'

// Tax & OHADA. The fiscal IDENTITY (NIU, RCCM), the tax REGIME and the standard TVA rate are
// real, business-owned fields captured at onboarding and edited here (load via getProfile,
// save via /businesses/setup). The rest — CNPS/CDI, the tax-rate table, rounding, TVA display
// toggles and OHADA accounting — has no backend yet and stays a local coming-soon preview.

type RegimeKey = 'lib' | 'simpl' | 'reel'

const REGIME_TO_ENUM: Record<RegimeKey, FiscalRegime> = {
  lib: FiscalRegime.IMPOT_LIBERATOIRE,
  simpl: FiscalRegime.SIMPLIFIE,
  reel: FiscalRegime.REEL,
}
const ENUM_TO_REGIME: Record<FiscalRegime, RegimeKey> = {
  [FiscalRegime.IMPOT_LIBERATOIRE]: 'lib',
  [FiscalRegime.SIMPLIFIE]: 'simpl',
  [FiscalRegime.REEL]: 'reel',
}

const REGIMES: Array<{ key: RegimeKey; name: MessageKey; desc: MessageKey; tag: MessageKey }> = [
  { key: 'lib', name: 'tax.regLibName', desc: 'tax.regLibDesc', tag: 'tax.regLibTag' },
  { key: 'simpl', name: 'tax.regSimplName', desc: 'tax.regSimplDesc', tag: 'tax.regSimplTag' },
  { key: 'reel', name: 'tax.regReelName', desc: 'tax.regReelDesc', tag: 'tax.regReelTag' },
]

const RATES: Array<{
  name: MessageKey
  code: string
  rate: string
  applies: MessageKey
  status: 'default' | 'active' | 'off'
}> = [
  {
    name: 'tax.rate1Name',
    code: 'TVA-19.25',
    rate: '19,25%',
    applies: 'tax.rate1Applies',
    status: 'default',
  },
  {
    name: 'tax.rate2Name',
    code: 'EXO-0',
    rate: '0%',
    applies: 'tax.rate2Applies',
    status: 'active',
  },
  {
    name: 'tax.rate3Name',
    code: 'ACC-25',
    rate: '25%',
    applies: 'tax.rate3Applies',
    status: 'active',
  },
  {
    name: 'tax.rate4Name',
    code: 'PREC-5.5',
    rate: '5,5%',
    applies: 'tax.rate4Applies',
    status: 'off',
  },
]

const Info = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
)
const Warn = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
)
const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6}>
    <path d="m5 12 4 4L19 6" />
  </svg>
)
const Pencil = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M4 20h4L18 10l-4-4L4 16v4Z" />
  </svg>
)
const Plus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

function ToggleLine({
  nm,
  ds,
  on,
  onToggle,
  disabled,
}: {
  nm: string
  ds: string
  on: boolean
  onToggle: () => void
  disabled?: boolean
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
        disabled={disabled}
        onClick={onToggle}
      />
    </div>
  )
}

export function TaxSection() {
  const t = useT()
  const qc = useQueryClient()
  const online = useOnline()

  const q = useQuery({
    queryKey: ['business', 'profile'],
    queryFn: () => dataClient.business.getProfile(),
  })
  const isOwner = q.data?.role === 'OWNER'
  const canEdit = isOwner && online

  // Backed fields (loaded from the profile, saved to the business).
  const [niu, setNiu] = useState('')
  const [rccm, setRccm] = useState('')
  const [regime, setRegime] = useState<RegimeKey>('lib')
  const [vatRegistered, setVatRegistered] = useState(false)
  const [vatRate, setVatRate] = useState('19,25')

  // Preview-only local state (no backend yet).
  const [cnps, setCnps] = useState('')
  const [cdi, setCdi] = useState('')
  const [rounding, setRounding] = useState('5')
  const [inclTva, setInclTva] = useState(true)
  const [showBreakdown, setShowBreakdown] = useState(true)
  const [withholding, setWithholding] = useState(false)
  const [standard, setStandard] = useState('syscohada2017')
  const [reportCurrency, setReportCurrency] = useState('XAF')
  const [fyStart, setFyStart] = useState('jan')
  const [chart, setChart] = useState('standard')
  const [ohadaClasses, setOhadaClasses] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!q.data) return
    setNiu(q.data.niu ?? '')
    setRccm(q.data.rccm ?? '')
    setRegime(q.data.fiscalRegime ? ENUM_TO_REGIME[q.data.fiscalRegime] : 'lib')
    setVatRegistered(q.data.vatRegistered ?? false)
    if (q.data.defaultVatRate != null) setVatRate(String(q.data.defaultVatRate).replace('.', ','))
  }, [q.data])

  const flash = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast((c) => (c === msg ? null : c)), 2400)
  }

  const save = useMutation({
    mutationFn: () => {
      const rate = Number(vatRate.replace(',', '.'))
      return dataClient.business.update({
        niu: niu.trim() || undefined,
        rccm: rccm.trim() || undefined,
        fiscalRegime: REGIME_TO_ENUM[regime],
        vatRegistered,
        defaultVatRate: vatRegistered && Number.isFinite(rate) ? rate : undefined,
      })
    },
    onSuccess: (updated) => {
      flash(t('tax.saved'))
      qc.setQueryData<BusinessProfile | null>(['business', 'profile'], (prev) => ({
        ...updated,
        role: prev?.role ?? updated.role,
      }))
    },
  })

  const statusPill = (s: 'default' | 'active' | 'off') => {
    const cls = s === 'default' ? 'st-ok' : s === 'active' ? 'st-neutral' : 'st-low'
    const label =
      s === 'default' ? t('tax.stDefault') : s === 'active' ? t('tax.stActive') : t('tax.stOff')
    return (
      <span className={`st ${cls}`}>
        <span className="d" />
        {label}
      </span>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!online ? (
        <div className="banner">
          <span>{t('hours.onlineOnly')}</span>
        </div>
      ) : !isOwner ? (
        <div className="banner">
          <span>{t('hours.ownerOnly')}</span>
        </div>
      ) : null}

      {/* Tax identity — REAL (business-owned) */}
      <div className="card">
        <div className="card-h">
          <div>
            <h3>{t('tax.identityTitle')}</h3>
            <p>{t('tax.identitySub')}</p>
          </div>
        </div>
        <div className="field-row">
          <div>
            <label className="lbl">{t('tax.niu')}</label>
            <Input value={niu} disabled={!canEdit} onChange={(e) => setNiu(e.target.value)} />
            <div className="help">{t('tax.niuHelp')}</div>
          </div>
          <div>
            <label className="lbl">{t('tax.rccm')}</label>
            <Input value={rccm} disabled={!canEdit} onChange={(e) => setRccm(e.target.value)} />
            <div className="help">{t('tax.rccmHelp')}</div>
          </div>
        </div>
        <div className="field-row">
          <div>
            <label className="lbl">{t('tax.cnps')}</label>
            <Input value={cnps} disabled={!canEdit} onChange={(e) => setCnps(e.target.value)} />
            <div className="help">{t('tax.comingSoon')}</div>
          </div>
          <div>
            <label className="lbl">{t('tax.cdi')}</label>
            <Input value={cdi} disabled={!canEdit} onChange={(e) => setCdi(e.target.value)} />
            <div className="help">{t('tax.comingSoon')}</div>
          </div>
        </div>
      </div>

      {/* Tax regime — REAL */}
      <div className="card">
        <div className="card-h">
          <div>
            <h3>{t('tax.regimeTitle')}</h3>
            <p>{t('tax.regimeSub')}</p>
          </div>
        </div>
        <div className="regime-grid">
          {REGIMES.map((r) => (
            <button
              type="button"
              key={r.key}
              className={`regime${regime === r.key ? ' sel' : ''}`}
              disabled={!canEdit}
              onClick={() => setRegime(r.key)}
            >
              <span className="rdo" />
              <div className="rn">{t(r.name)}</div>
              <div className="rd">{t(r.desc)}</div>
              <div className="rt">{t(r.tag)}</div>
            </button>
          ))}
        </div>
      </div>

      {/* TVA handling — rate + registration are REAL; display toggles are preview */}
      <div className="card">
        <div className="card-h">
          <div>
            <h3>{t('tax.tvaTitle')}</h3>
            <p>{t('tax.tvaSub')}</p>
          </div>
        </div>
        <ToggleLine
          nm={t('tax.vatRegistered')}
          ds={t('tax.vatRegisteredDesc')}
          on={vatRegistered}
          disabled={!canEdit}
          onToggle={() => setVatRegistered((v) => !v)}
        />
        <div className="field-row">
          <div>
            <label className="lbl">{t('tax.stdRate')}</label>
            <div className="field">
              <Input
                value={vatRate}
                inputMode="decimal"
                disabled={!canEdit || !vatRegistered}
                style={{ paddingRight: 34 }}
                onChange={(e) => setVatRate(e.target.value)}
              />
              <span
                style={{
                  position: 'absolute',
                  right: 14,
                  color: 'var(--text-muted)',
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                %
              </span>
            </div>
            <div className="help">{t('tax.stdRateHelp')}</div>
          </div>
          <div>
            <label className="lbl">{t('tax.rounding')}</label>
            <Select
              value={rounding}
              disabled={!canEdit}
              onChange={(e) => setRounding(e.target.value)}
              options={[
                { value: '5', label: t('tax.round5') },
                { value: '1', label: t('tax.round1') },
                { value: '0', label: t('tax.roundNone') },
              ]}
            />
            <div className="help">{t('tax.comingSoon')}</div>
          </div>
        </div>
        <div className="divider" />
        <ToggleLine
          nm={t('tax.inclTva')}
          ds={t('tax.inclTvaDesc')}
          on={inclTva}
          disabled={!canEdit}
          onToggle={() => setInclTva((v) => !v)}
        />
        <ToggleLine
          nm={t('tax.showBreakdown')}
          ds={t('tax.showBreakdownDesc')}
          on={showBreakdown}
          disabled={!canEdit}
          onToggle={() => setShowBreakdown((v) => !v)}
        />
        <ToggleLine
          nm={t('tax.withholding')}
          ds={t('tax.withholdingDesc')}
          on={withholding}
          disabled={!canEdit}
          onToggle={() => setWithholding((v) => !v)}
        />
      </div>

      <div className="fp-actions">
        <Button
          variant="primary"
          type="button"
          disabled={!canEdit || save.isPending}
          onClick={() => save.mutate()}
        >
          {t('tax.save')}
        </Button>
        {toast ? (
          <span style={{ color: 'var(--success)', fontSize: 13, marginLeft: 12 }}>{toast}</span>
        ) : null}
      </div>

      {/* --- Coming-soon preview (no backend yet) --------------------------- */}
      <div className="banner warn">
        <Warn />
        <span>{t('tax.comingSoon')}</span>
      </div>

      {/* Tax rates */}
      <div className="panel">
        <div className="panel-head">
          <h3>{t('tax.ratesTitle')}</h3>
          <div className="spacer" />
          <button className="btn" type="button" onClick={() => flash(t('tax.editComingSoon'))}>
            <Plus />
            {t('tax.addRate')}
          </button>
        </div>
        <table className="ltbl">
          <thead>
            <tr>
              <th>{t('tax.colName')}</th>
              <th>{t('tax.colCode')}</th>
              <th className="right">{t('tax.colRate')}</th>
              <th>{t('tax.colApplies')}</th>
              <th>{t('tax.colStatus')}</th>
              <th className="right">{t('tax.colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {RATES.map((r) => (
              <tr key={r.code}>
                <td>{t(r.name)}</td>
                <td>
                  <span className="tcode">{r.code}</span>
                </td>
                <td className="right rate-badge">{r.rate}</td>
                <td style={{ color: 'var(--text-2)' }}>{t(r.applies)}</td>
                <td>{statusPill(r.status)}</td>
                <td className="right">
                  <span className="acts">
                    <button
                      type="button"
                      title={t('tax.edit')}
                      aria-label={t('tax.edit')}
                      onClick={() => flash(t('tax.editComingSoon'))}
                    >
                      <Pencil />
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* OHADA accounting */}
      <div className="card">
        <div className="card-h">
          <div>
            <h3>{t('tax.ohadaTitle')}</h3>
            <p>{t('tax.ohadaSub')}</p>
          </div>
        </div>
        <div className="field-row">
          <div>
            <label className="lbl">{t('tax.standard')}</label>
            <Select
              value={standard}
              onChange={(e) => setStandard(e.target.value)}
              options={[
                { value: 'syscohada2017', label: 'SYSCOHADA révisé (2017)' },
                { value: 'syscohada', label: 'SYSCOHADA (legacy)' },
                { value: 'ifrs', label: 'IFRS' },
              ]}
            />
          </div>
          <div>
            <label className="lbl">{t('tax.currency')}</label>
            <Select
              value={reportCurrency}
              onChange={(e) => setReportCurrency(e.target.value)}
              options={[
                { value: 'XAF', label: 'XAF — Franc CFA (FCFA)' },
                { value: 'EUR', label: 'EUR — Euro' },
                { value: 'USD', label: 'USD — US Dollar' },
              ]}
            />
          </div>
        </div>
        <div className="field-row">
          <div>
            <label className="lbl">{t('tax.fyStart')}</label>
            <Select
              value={fyStart}
              onChange={(e) => setFyStart(e.target.value)}
              options={[
                { value: 'jan', label: t('tax.fyJan') },
                { value: 'jul', label: t('tax.fyJul') },
                { value: 'oct', label: t('tax.fyOct') },
              ]}
            />
          </div>
          <div>
            <label className="lbl">{t('tax.chart')}</label>
            <Select
              value={chart}
              onChange={(e) => setChart(e.target.value)}
              options={[
                { value: 'standard', label: t('tax.chartStd') },
                { value: 'custom', label: t('tax.chartCustom') },
              ]}
            />
          </div>
        </div>
        <ToggleLine
          nm={t('tax.useClasses')}
          ds={t('tax.useClassesDesc')}
          on={ohadaClasses}
          onToggle={() => setOhadaClasses((v) => !v)}
        />
        <div className="form-note">
          <Info />
          <span>{t('tax.ohadaNote')}</span>
        </div>
      </div>

      {toast ? (
        <div
          style={{
            position: 'fixed',
            right: 22,
            bottom: 22,
            zIndex: 60,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '11px 16px',
            borderRadius: 12,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow)',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <span style={{ color: 'var(--success)', display: 'inline-flex' }}>
            <Check />
          </span>
          {toast}
        </div>
      ) : null}
    </div>
  )
}
