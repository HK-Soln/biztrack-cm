import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BackButton, Button, Input, PhoneInput, Select } from '@biztrack/ui/biztrack'
import { ContactType, DebtDirection, IdDocumentType } from '@biztrack/types'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { errorMessage } from '@/lib/error'
import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'
import { contactSchema } from '@/lib/schemas'
import { FieldError } from '@/components/FieldError'
import { FileUpload } from '@/components/FileUpload'
import type { CreateContactRequest } from '@shared/ipc'

type FieldErrors = Partial<Record<'name' | 'phone' | 'phoneAlt' | 'email', MessageKey>>
const ID_TYPES: IdDocumentType[] = [IdDocumentType.ID_CARD, IdDocumentType.PASSPORT, IdDocumentType.DRIVERS_LICENSE, IdDocumentType.RESIDENCE_PERMIT, IdDocumentType.OTHER]
const fileName = (url: string) => decodeURIComponent(url.split('/').pop() ?? url)

export function ContactForm() {
  const { id } = useParams()
  const editing = Boolean(id)
  const t = useT()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: existing } = useQuery({
    queryKey: [...queryKeys.contacts, id],
    queryFn: () => dataClient.contacts.get(id!),
    enabled: isElectron && editing,
  })

  const [type, setType] = useState<ContactType>(ContactType.CUSTOMER)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [phoneAlt, setPhoneAlt] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [idType, setIdType] = useState<IdDocumentType | ''>('')
  const [idNumber, setIdNumber] = useState('')
  const [idIssueDate, setIdIssueDate] = useState('')
  const [idExpiryDate, setIdExpiryDate] = useState('')
  const [idDocuments, setIdDocuments] = useState<string[]>([])
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null)
  const [obAmount, setObAmount] = useState('')
  const [obDirection, setObDirection] = useState<DebtDirection>(DebtDirection.RECEIVABLE)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  // Seed the form from the existing contact (edit) once it loads.
  useEffect(() => {
    if (loaded || !existing) return
    setType(existing.type)
    setName(existing.name)
    setPhone(existing.phone ?? '')
    setPhoneAlt(existing.phoneAlt ?? '')
    setEmail(existing.email ?? '')
    setAddress(existing.address ?? '')
    setNotes(existing.notes ?? '')
    setIdType((existing.idType as IdDocumentType) ?? '')
    setIdNumber(existing.idNumber ?? '')
    setIdIssueDate(existing.idIssueDate ?? '')
    setIdExpiryDate(existing.idExpiryDate ?? '')
    setIdDocuments(existing.idDocuments ?? [])
    setSelfieUrl(existing.selfieUrl ?? null)
    setLoaded(true)
  }, [loaded, existing])

  const showKyc = type === ContactType.CUSTOMER || type === ContactType.BOTH

  const payload = (): CreateContactRequest => ({
    type,
    name: name.trim(),
    phone: phone.trim() || undefined,
    phoneAlt: phoneAlt.trim() || undefined,
    email: email.trim() || undefined,
    address: address.trim() || undefined,
    notes: notes.trim() || undefined,
    // KYC only applies to customers; clear it when the contact is a pure supplier.
    idType: showKyc ? (idType || null) : null,
    idNumber: showKyc ? idNumber.trim() || null : null,
    idIssueDate: showKyc ? idIssueDate || null : null,
    idExpiryDate: showKyc ? idExpiryDate || null : null,
    idDocuments: showKyc ? idDocuments : [],
    selfieUrl: showKyc ? selfieUrl : null,
  })

  const save = useMutation({
    mutationFn: async () => {
      const c = editing ? await dataClient.contacts.update(id!, payload()) : await dataClient.contacts.create(payload())
      // Optional opening balance — only on create.
      if (!editing) {
        const amt = Number(obAmount.replace(/\s/g, '').replace(',', '.'))
        if (Number.isFinite(amt) && amt > 0) {
          const direction =
            type === ContactType.SUPPLIER ? DebtDirection.PAYABLE : type === ContactType.CUSTOMER ? DebtDirection.RECEIVABLE : obDirection
          await dataClient.openingBalances.upsert({ contactId: c.id, direction, amount: amt })
        }
      }
      return c
    },
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: queryKeys.contacts })
      navigate(editing ? `/contacts/${id}` : `/contacts/${c.id}`)
    },
    onError: (e) => setError(errorMessage(e, t('ct.saveError'))),
  })

  const submit = () => {
    const parsed = contactSchema.safeParse({ name, phone, phoneAlt, email })
    if (!parsed.success) {
      const f = parsed.error.flatten().fieldErrors
      setErrors({
        name: f.name?.[0] as MessageKey | undefined,
        phone: f.phone?.[0] as MessageKey | undefined,
        phoneAlt: f.phoneAlt?.[0] as MessageKey | undefined,
        email: f.email?.[0] as MessageKey | undefined,
      })
      return
    }
    setErrors({})
    setError(null)
    save.mutate()
  }

  return (
    <div className="frame">
      <BackButton onClick={() => navigate(editing ? `/contacts/${id}` : '/contacts')}>{t('ct.title')}</BackButton>
      <div className="page-head">
        <div>
          <h1>{editing ? t('ct.editTitle') : t('ct.new')}</h1>
          <p>{t('ct.formSub')}</p>
        </div>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); submit() }}>
        <div className="card">
          <div className="card-h"><div><h3>{t('ct.detailsSection')}</h3></div></div>
          <div className="form-2col">
            <div className="ff" style={{ marginBottom: 12 }}>
              <label className="lbl2">{t('ct.type')}</label>
              <Select value={type} onChange={(e) => setType(e.target.value as ContactType)}>
                <option value={ContactType.CUSTOMER}>{t('ct.customer')}</option>
                <option value={ContactType.SUPPLIER}>{t('ct.supplier')}</option>
                <option value={ContactType.BOTH}>{t('ct.both')}</option>
              </Select>
            </div>
            <div className="ff" style={{ marginBottom: 12 }}>
              <label className="lbl2">{t('ct.name')} <span className="req">*</span></label>
              <Input value={name} error={!!errors.name} placeholder={t('ct.namePh')} onChange={(e) => { setName(e.target.value); setErrors((x) => ({ ...x, name: undefined })) }} />
              {errors.name ? <FieldError message={t(errors.name)} /> : null}
            </div>
          </div>
          <div className="form-2col">
            <div className="ff" style={{ marginBottom: 12 }}>
              <label className="lbl2">{t('ct.phone')}</label>
              <PhoneInput value={phone} error={!!errors.phone} placeholder={t('ct.phonePh')} onChange={(v) => { setPhone(v ?? ''); setErrors((x) => ({ ...x, phone: undefined })) }} />
              {errors.phone ? <FieldError message={t(errors.phone)} /> : null}
            </div>
            <div className="ff" style={{ marginBottom: 12 }}>
              <label className="lbl2">{t('ct.phoneAlt')}</label>
              <PhoneInput value={phoneAlt} error={!!errors.phoneAlt} placeholder={t('ct.phonePh')} onChange={(v) => { setPhoneAlt(v ?? ''); setErrors((x) => ({ ...x, phoneAlt: undefined })) }} />
              {errors.phoneAlt ? <FieldError message={t(errors.phoneAlt)} /> : null}
            </div>
          </div>
          <div className="ff" style={{ marginBottom: 12 }}>
            <label className="lbl2">{t('ct.email')}</label>
            <Input value={email} type="email" error={!!errors.email} placeholder={t('ct.emailPh')} onChange={(e) => { setEmail(e.target.value); setErrors((x) => ({ ...x, email: undefined })) }} />
            {errors.email ? <FieldError message={t(errors.email)} /> : null}
          </div>
          <div className="ff" style={{ marginBottom: 12 }}>
            <label className="lbl2">{t('ct.address')}</label>
            <Input value={address} placeholder={t('ct.addressPh')} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="ff">
            <label className="lbl2">{t('ct.notes')}</label>
            <textarea className="ta" rows={2} value={notes} placeholder={t('ct.notesPh')} onChange={(e) => setNotes(e.target.value)} style={{ width: '100%', resize: 'vertical' }} />
          </div>
        </div>

        {!editing ? (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-h"><div><h3>{t('ct.obSection')}</h3><p>{t('ct.obSub')}</p></div></div>
            <div className="form-2col">
              <div className="ff" style={{ marginBottom: 12 }}>
                <label className="lbl2">{t('ct.obAmount')}</label>
                <Input value={obAmount} inputMode="decimal" placeholder="0" onChange={(e) => setObAmount(e.target.value)} />
              </div>
              <div className="ff" style={{ marginBottom: 12 }}>
                <label className="lbl2">{t('ct.obDirection')}</label>
                {type === ContactType.BOTH ? (
                  <Select value={obDirection} onChange={(e) => setObDirection(e.target.value as DebtDirection)}>
                    <option value={DebtDirection.RECEIVABLE}>{t('ct.obTheyOwe')}</option>
                    <option value={DebtDirection.PAYABLE}>{t('ct.obYouOwe')}</option>
                  </Select>
                ) : (
                  <div className="fv" style={{ paddingTop: 9 }}>{type === ContactType.SUPPLIER ? t('ct.obYouOwe') : t('ct.obTheyOwe')}</div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {showKyc ? (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-h"><div><h3>{t('ct.idSection')}</h3><p>{t('ct.idSectionSub')}</p></div></div>
            <div className="form-2col">
              <div className="ff" style={{ marginBottom: 12 }}>
                <label className="lbl2">{t('ct.idType')}</label>
                <Select value={idType} onChange={(e) => setIdType(e.target.value as IdDocumentType | '')}>
                  <option value="">{t('ct.idTypePick')}</option>
                  {ID_TYPES.map((v) => (
                    <option key={v} value={v}>{t(`ct.idType_${v}` as MessageKey)}</option>
                  ))}
                </Select>
              </div>
              <div className="ff" style={{ marginBottom: 12 }}>
                <label className="lbl2">{t('ct.idNumber')}</label>
                <Input value={idNumber} placeholder={t('ct.idNumberPh')} onChange={(e) => setIdNumber(e.target.value)} />
              </div>
            </div>
            <div className="form-2col">
              <div className="ff" style={{ marginBottom: 12 }}>
                <label className="lbl2">{t('ct.idIssue')}</label>
                <Input type="date" value={idIssueDate} onChange={(e) => setIdIssueDate(e.target.value)} />
              </div>
              <div className="ff" style={{ marginBottom: 12 }}>
                <label className="lbl2">{t('ct.idExpiry')}</label>
                <Input type="date" value={idExpiryDate} onChange={(e) => setIdExpiryDate(e.target.value)} />
              </div>
            </div>
            <div className="ff" style={{ marginBottom: 12 }}>
              <label className="lbl2">{t('ct.idDocs')}</label>
              {idDocuments.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                  {idDocuments.map((u, i) => (
                    <div key={`${u}-${i}`} className="filechip">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                      <a href={u} target="_blank" rel="noreferrer" className="filechip-name" title={fileName(u)}>{fileName(u)}</a>
                      <button type="button" className="icon-btn" aria-label={t('ct.idDocRemove')} style={{ width: 26, height: 26, marginLeft: 'auto' }} onClick={() => setIdDocuments((d) => d.filter((_, j) => j !== i))}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: 14, height: 14 }}><path d="M6 6l12 12M18 6 6 18" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <FileUpload value={null} onChange={(u) => { if (u) setIdDocuments((d) => [...d, u]) }} folder="kyc" variant="file" hint={t('ct.idDocHint')} />
            </div>
            <div className="ff" style={{ maxWidth: 220 }}>
              <label className="lbl2">{t('ct.selfie')}</label>
              <FileUpload value={selfieUrl} onChange={setSelfieUrl} folder="kyc" variant="image" hint={t('ct.selfieHint')} />
            </div>
          </div>
        ) : null}

        {error ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 12 }} role="alert">{error}</p> : null}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <Button variant="soft" type="button" onClick={() => navigate(editing ? `/contacts/${id}` : '/contacts')} disabled={save.isPending}>{t('ct.cancel')}</Button>
          <Button variant="primary" type="submit" loading={save.isPending}>{editing ? t('ct.save') : t('ct.create')}</Button>
        </div>
      </form>
    </div>
  )
}
