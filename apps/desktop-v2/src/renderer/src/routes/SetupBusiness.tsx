import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, PhoneInput, Select } from '@biztrack/ui/biztrack'
import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'
import type { BusinessSetupPayload } from '@shared/ipc'
import { useSessionStore } from '@/stores/session.store'
import { isValidEmail } from '@/lib/schemas'
import { routeForNextStep } from '@/lib/auth-routing'
import { dataClient } from '@/lib/data-client'

const STEPS: MessageKey[] = ['setup.stepIdentity', 'setup.stepContact', 'setup.stepFiscal']

const BUSINESS_TYPES = ['EPICERIE', 'BOUTIQUE', 'RESTAURANT', 'PHARMACIE', 'SALON', 'ELECTRONIQUE', 'AUTRE'] as const
const REGIMES = ['IMPOT_LIBERATOIRE', 'SIMPLIFIE', 'REEL'] as const

// Phase 1 onboarding: a multi-step business-setup form (identity → contact → fiscal).
// Saves via the BFF (POST /businesses/setup), which transitions the business
// ONBOARDING → PLAN_PENDING and re-resolves the backend's nextStep (→ select_plan).
// Fiscal/OHADA fields are captured + stored but not yet used by any tax logic.
export function SetupBusiness() {
  const navigate = useNavigate()
  const t = useT()
  const setStatus = useSessionStore((s) => s.setStatus)
  const sessionBusinessName = useSessionStore((s) => s.status.businessName)

  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Identity
  const [name, setName] = useState(sessionBusinessName ?? '')
  const [type, setType] = useState<string>('BOUTIQUE')
  const [slogan, setSlogan] = useState('')
  const [nameError, setNameError] = useState<MessageKey | null>(null)
  // Contact
  const [phone, setPhone] = useState<string | undefined>(undefined)
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<MessageKey | null>(null)
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  // Fiscal
  const [niu, setNiu] = useState('')
  const [rccm, setRccm] = useState('')
  const [vatRegistered, setVatRegistered] = useState(false)
  const [vatRate, setVatRate] = useState('19.25')
  const [fiscalRegime, setFiscalRegime] = useState<string>('IMPOT_LIBERATOIRE')

  const validateStep = (s: number): boolean => {
    if (s === 0 && !name.trim()) {
      setNameError('setup.nameRequired')
      return false
    }
    if (s === 1 && email.trim() && !isValidEmail(email.trim())) {
      setEmailError('setup.invalidEmail')
      return false
    }
    return true
  }

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    const trimmedEmail = email.trim()
    const rate = Number(vatRate)
    const payload: BusinessSetupPayload = {
      name: name.trim(),
      type,
      description: slogan.trim() || undefined,
      phone: phone || undefined,
      email: trimmedEmail || undefined,
      address: address.trim() || undefined,
      city: city.trim() || undefined,
      niu: niu.trim() || undefined,
      rccm: rccm.trim() || undefined,
      vatRegistered,
      defaultVatRate: vatRegistered && Number.isFinite(rate) ? rate : undefined,
      fiscalRegime: fiscalRegime || undefined,
    }
    const res = await dataClient.auth.setupBusiness(payload)
    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? t('setup.error'))
      return
    }
    setStatus(res.session)
    navigate(routeForNextStep(res.nextStep))
  }

  const onNext = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateStep(step)) return
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1)
      return
    }
    void submit()
  }

  const titleKey: MessageKey = step === 0 ? 'setup.identityTitle' : step === 1 ? 'setup.contactTitle' : 'setup.fiscalTitle'
  const subKey: MessageKey = step === 0 ? 'setup.identitySub' : step === 1 ? 'setup.contactSub' : 'setup.fiscalSub'

  return (
    <div className="auth-card" style={{ maxWidth: 480 }}>
      <div className="auth-logo">
        <div className="mk">B</div>
        <div className="wm">BizTrack CM</div>
      </div>

      <div className="stepper">
        {STEPS.map((s, i) => (
          <div key={s} className={`st${i < step ? ' done' : i === step ? ' active' : ''}`}>
            <div className="dot">
              {i < step ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} style={{ width: 14, height: 14 }}>
                  <path d="m5 12 4 4L19 6" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <div className="lab">{t(s)}</div>
            {i < STEPS.length - 1 ? <div className={`bar${i < step ? ' done' : ''}`} /> : null}
          </div>
        ))}
      </div>

      <div className="auth-h">
        <h1>{t(titleKey)}</h1>
        <p>{t(subKey)}</p>
      </div>

      <form className="fform" onSubmit={onNext}>
        {step === 0 ? (
          <>
            <div className={`ff${nameError ? ' invalid' : ''}`}>
              <label className="lbl2">
                {t('setup.businessName')} <span className="req">*</span>
              </label>
              <Input
                value={name}
                error={!!nameError}
                placeholder={t('setup.businessNamePh')}
                onChange={(e) => {
                  setName(e.target.value)
                  setNameError(null)
                }}
              />
              {nameError ? (
                <div className="msg err">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v5M12 16h.01" />
                  </svg>
                  <span>{t(nameError)}</span>
                </div>
              ) : null}
            </div>
            <div className="ff">
              <label className="lbl2">{t('setup.businessType')}</label>
              <Select value={type} onChange={(e) => setType(e.target.value)}
                options={BUSINESS_TYPES.map((v) => ({ value: v, label: t(`bizType.${v}` as MessageKey) }))} />
            </div>
            <div className="ff">
              <label className="lbl2">
                {t('setup.slogan')} <span className="opt">{t('setup.optional')}</span>
              </label>
              <Input value={slogan} placeholder={t('setup.sloganPh')} onChange={(e) => setSlogan(e.target.value)} />
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <div className="ff">
              <label className="lbl2">
                {t('setup.phone')} <span className="opt">{t('setup.optional')}</span>
              </label>
              <PhoneInput value={phone} onChange={setPhone} placeholder="6 91 22 14 08" />
            </div>
            <div className={`ff${emailError ? ' invalid' : ''}`}>
              <label className="lbl2">
                {t('setup.email')} <span className="opt">{t('setup.optional')}</span>
              </label>
              <Input
                type="email"
                value={email}
                error={!!emailError}
                placeholder={t('setup.emailPh')}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setEmailError(null)
                }}
              />
              {emailError ? (
                <div className="msg err">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v5M12 16h.01" />
                  </svg>
                  <span>{t(emailError)}</span>
                </div>
              ) : null}
            </div>
            <div className="ff">
              <label className="lbl2">
                {t('setup.address')} <span className="opt">{t('setup.optional')}</span>
              </label>
              <Input value={address} placeholder={t('setup.addressPh')} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="ff">
              <label className="lbl2">
                {t('setup.city')} <span className="opt">{t('setup.optional')}</span>
              </label>
              <Input value={city} placeholder={t('setup.cityPh')} onChange={(e) => setCity(e.target.value)} />
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div className="ff-row">
              <div className="ff">
                <label className="lbl2">
                  {t('setup.niu')} <span className="opt">{t('setup.optional')}</span>
                </label>
                <Input value={niu} placeholder={t('setup.niuPh')} onChange={(e) => setNiu(e.target.value)} />
              </div>
              <div className="ff">
                <label className="lbl2">
                  {t('setup.rccm')} <span className="opt">{t('setup.optional')}</span>
                </label>
                <Input value={rccm} placeholder={t('setup.rccmPh')} onChange={(e) => setRccm(e.target.value)} />
              </div>
            </div>
            <label className="chk">
              <input type="checkbox" checked={vatRegistered} onChange={(e) => setVatRegistered(e.target.checked)} />
              <span className="bx">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                  <path d="m5 12 4 4L19 6" />
                </svg>
              </span>
              <span>{t('setup.vatRegistered')}</span>
            </label>
            <div className="ff-row">
              {vatRegistered ? (
                <div className="ff">
                  <label className="lbl2">{t('setup.vatRate')}</label>
                  <div className="ff-prefix">
                    <Input value={vatRate} inputMode="decimal" onChange={(e) => setVatRate(e.target.value)} />
                    <span className="pfx" style={{ borderLeft: 0, borderRight: '1px solid var(--border)', borderRadius: '0 10px 10px 0' }}>
                      %
                    </span>
                  </div>
                </div>
              ) : null}
              <div className="ff">
                <label className="lbl2">{t('setup.fiscalRegime')}</label>
                <Select value={fiscalRegime} onChange={(e) => setFiscalRegime(e.target.value)}
                  options={REGIMES.map((v) => ({ value: v, label: t(`regime.${v}` as MessageKey) }))} />
              </div>
            </div>
          </>
        ) : null}

        {error ? (
          <p style={{ color: 'var(--danger)', fontSize: 12.5 }} role="alert">
            {error}
          </p>
        ) : null}

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          {step > 0 ? (
            <Button type="button" variant="soft" onClick={() => setStep((s) => s - 1)} disabled={busy}>
              {t('setup.back')}
            </Button>
          ) : null}
          <Button type="submit" variant="primary" loading={busy} style={{ flex: 1, justifyContent: 'center' }}>
            {step < STEPS.length - 1 ? t('setup.continue') : t('setup.finish')}
          </Button>
        </div>
      </form>
    </div>
  )
}
