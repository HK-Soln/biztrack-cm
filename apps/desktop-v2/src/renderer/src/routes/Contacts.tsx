import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Modal, Pagination, PhoneInput, Select } from '@biztrack/ui/biztrack'
import { ContactType } from '@biztrack/types'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { usePaged } from '@/lib/usePaged'
import { useCurrency } from '@/lib/currency'
import { errorMessage } from '@/lib/error'
import { useT } from '@/i18n'
import { useBreakpoint } from '@/lib/useBreakpoint'
import type { CreateContactRequest, LocalContact, LocalContactListItem } from '@shared/ipc'

type Tab = 'all' | 'customers' | 'suppliers'
const TAB_TYPE: Record<Tab, ContactType | undefined> = {
  all: undefined,
  customers: ContactType.CUSTOMER,
  suppliers: ContactType.SUPPLIER,
}

export function Contacts() {
  const t = useT()
  const bp = useBreakpoint()
  const qc = useQueryClient()
  const money = useCurrency()
  const navigate = useNavigate()

  const [tab, setTab] = useState<Tab>('all')
  const [edit, setEdit] = useState<{ contact?: LocalContact } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LocalContact | null>(null)
  const [deleteErr, setDeleteErr] = useState<string | null>(null)

  const { items, total, page, limit, totalPages, isPending, search, setSearch, setPage } = usePaged<LocalContactListItem>(
    queryKeys.contacts,
    (q) => dataClient.contacts.list(q),
    { enabled: isElectron, extra: TAB_TYPE[tab] ? { type: TAB_TYPE[tab] } : {} },
  )

  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.contacts })

  const removeM = useMutation({
    mutationFn: (id: string) => dataClient.contacts.remove(id),
    onSuccess: () => { invalidate(); setDeleteTarget(null); setDeleteErr(null) },
    onError: (e) => setDeleteErr(errorMessage(e, t('ct.deleteError'))),
  })

  const typeBadge = (c: LocalContact) =>
    c.type === ContactType.SUPPLIER ? (
      <span className="st st-brand">{t('ct.supplier')}</span>
    ) : c.type === ContactType.CUSTOMER ? (
      <span className="st st-soft">{t('ct.customer')}</span>
    ) : (
      <span className="st st-neutral">{t('ct.both')}</span>
    )

  const balanceCell = (c: LocalContactListItem) => {
    if (c.totalPayable > 0) return <span style={{ color: 'var(--danger)' }}>{t('ct.weOwe').replace('{v}', money.format(c.totalPayable))}</span>
    if (c.totalReceivable > 0) return <span style={{ color: 'var(--warning)' }}>{t('ct.owesUs').replace('{v}', money.format(c.totalReceivable))}</span>
    return <span style={{ color: 'var(--text-3)' }}>—</span>
  }

  const tabBtn = (key: Tab, label: string) => (
    <button type="button" className={tab === key ? 'active' : ''} onClick={() => { setTab(key); setPage(1) }}>
      {label}
    </button>
  )

  return (
    <div className="frame">
      <div className="page-head">
        <div>
          <h1>{t('ct.title')}</h1>
          <p>{t('ct.subtitle')}</p>
        </div>
        <Button variant="primary" onClick={() => setEdit({})}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M5 12h14" /></svg>
          {t('ct.new')}
        </Button>
      </div>

      <div className="tabs">
        {tabBtn('all', t('ct.tabAll'))}
        {tabBtn('customers', t('ct.tabCustomers'))}
        {tabBtn('suppliers', t('ct.tabSuppliers'))}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>{t('ct.all')}</h3>
          <div className="spacer" style={{ flex: 1 }} />
          <Input value={search} placeholder={t('ct.search')} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 230, height: 36 }} />
        </div>

        {isPending ? (
          <div className="cat-empty">{t('ct.loading')}</div>
        ) : items.length === 0 ? (
          <div className="cat-empty">{t('ct.empty')}</div>
        ) : bp === 'mobile' ? (
          <div className="u-cards">
            {items.map((c) => (
              <div key={c.id} className="u-card clickable" onClick={() => navigate(`/contacts/${c.id}`)}>
                <span className="u-abbr">{c.name.slice(0, 2).toUpperCase()}</span>
                <div className="u-main">
                  <div className="u-nm">{c.name}</div>
                  <div className="u-sub" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {typeBadge(c)} {c.phone ? <span className="chip-tag">{c.phone}</span> : null}
                  </div>
                </div>
                {balanceCell(c)}
              </div>
            ))}
          </div>
        ) : (
          <table className="utbl">
            <thead>
              <tr>
                <th>{t('ct.colName')}</th>
                <th>{t('ct.colType')}</th>
                <th>{t('ct.colPhone')}</th>
                <th className="right">{t('ct.colBalance')}</th>
                <th className="right">{t('ct.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => navigate(`/contacts/${c.id}`)}>
                  <td><div className="cell"><span className="th">{c.name.slice(0, 2).toUpperCase()}</span><div><div className="nm">{c.name}</div></div></div></td>
                  <td>{typeBadge(c)}</td>
                  <td className="mono">{c.phone || '—'}</td>
                  <td className="right">{balanceCell(c)}</td>
                  <td className="right">
                    <span className="acts" onClick={(e) => e.stopPropagation()}>
                      <button title={t('ct.edit')} onClick={() => setEdit({ contact: c })}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="M14 6l4 4" /></svg>
                      </button>
                      <button title={t('ct.delete')} onClick={() => { setDeleteTarget(c); setDeleteErr(null) }} style={{ color: 'var(--danger)' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalPages={totalPages} total={total} limit={limit} onPage={setPage} prevLabel={t('common.prev')} nextLabel={t('common.next')} />
      </div>

      {edit ? (
        <ContactModal contact={edit.contact} onClose={() => setEdit(null)} onSaved={() => { invalidate(); setEdit(null) }} />
      ) : null}

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t('ct.deleteTitle')}
        footer={
          <>
            <Button variant="soft" onClick={() => setDeleteTarget(null)} disabled={removeM.isPending}>{t('ct.cancel')}</Button>
            <Button variant="primary" loading={removeM.isPending} style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => deleteTarget && removeM.mutate(deleteTarget.id)}>
              {t('ct.delete')}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>{t('ct.deleteBody').replace('{name}', deleteTarget?.name ?? '')}</p>
        {deleteErr ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }} role="alert">{deleteErr}</p> : null}
      </Modal>
    </div>
  )
}

export function ContactModal({
  contact,
  defaultType,
  onClose,
  onSaved,
}: {
  contact?: LocalContact
  defaultType?: ContactType
  onClose: () => void
  onSaved: (created?: LocalContact) => void
}) {
  const t = useT()
  const editing = Boolean(contact)
  const [type, setType] = useState<ContactType>(contact?.type ?? defaultType ?? ContactType.CUSTOMER)
  const [name, setName] = useState(contact?.name ?? '')
  const [phone, setPhone] = useState(contact?.phone ?? '')
  const [phoneAlt, setPhoneAlt] = useState(contact?.phoneAlt ?? '')
  const [address, setAddress] = useState(contact?.address ?? '')
  const [notes, setNotes] = useState(contact?.notes ?? '')
  const [error, setError] = useState<string | null>(null)

  const payload = (): CreateContactRequest => ({
    type,
    name: name.trim(),
    phone: phone.trim() || undefined,
    phoneAlt: phoneAlt.trim() || undefined,
    address: address.trim() || undefined,
    notes: notes.trim() || undefined,
  })

  const save = useMutation({
    mutationFn: () => (editing && contact ? dataClient.contacts.update(contact.id, payload()) : dataClient.contacts.create(payload())),
    onSuccess: (c) => onSaved(c),
    onError: (e) => setError(errorMessage(e, t('ct.saveError'))),
  })

  const submit = () => {
    if (!name.trim()) return setError(t('ct.nameRequired'))
    setError(null)
    save.mutate()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? t('ct.editTitle') : t('ct.new')}
      footer={
        <>
          <Button variant="soft" onClick={onClose} disabled={save.isPending}>{t('ct.cancel')}</Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>{editing ? t('ct.save') : t('ct.create')}</Button>
        </>
      }
    >
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
        <Input value={name} error={!!error && !name.trim()} placeholder={t('ct.namePh')} onChange={(e) => { setName(e.target.value); setError(null) }} />
      </div>
      <div className="form-2col">
        <div className="ff" style={{ marginBottom: 12 }}>
          <label className="lbl2">{t('ct.phone')}</label>
          <PhoneInput value={phone} placeholder={t('ct.phonePh')} onChange={(v) => setPhone(v ?? '')} />
        </div>
        <div className="ff" style={{ marginBottom: 12 }}>
          <label className="lbl2">{t('ct.phoneAlt')}</label>
          <PhoneInput value={phoneAlt} placeholder={t('ct.phonePh')} onChange={(v) => setPhoneAlt(v ?? '')} />
        </div>
      </div>
      <div className="ff" style={{ marginBottom: 12 }}>
        <label className="lbl2">{t('ct.address')}</label>
        <Input value={address} placeholder={t('ct.addressPh')} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <div className="ff">
        <label className="lbl2">{t('ct.notes')}</label>
        <textarea className="ta" rows={2} value={notes} placeholder={t('ct.notesPh')} onChange={(e) => setNotes(e.target.value)} style={{ width: '100%', resize: 'vertical' }} />
      </div>
      {error ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }} role="alert">{error}</p> : null}
    </Modal>
  )
}
