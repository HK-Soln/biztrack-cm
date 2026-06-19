import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@biztrack/ui/biztrack'
import { ContactType } from '@biztrack/types'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { useCurrency } from '@/lib/currency'
import { useT } from '@/i18n'
import { ContactModal } from './Contacts'

export function ContactDetail() {
  const { id = '' } = useParams()
  const t = useT()
  const money = useCurrency()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)

  const { data: contact, isPending, refetch } = useQuery({
    queryKey: [...queryKeys.contacts, id],
    queryFn: () => dataClient.contacts.get(id),
    enabled: isElectron && !!id,
  })

  if (isPending) return <div className="frame"><div className="cat-empty">{t('ct.loading')}</div></div>
  if (!contact) return <div className="frame"><div className="cat-empty">{t('ct.notFound')}</div></div>

  const typeLabel = contact.type === ContactType.SUPPLIER ? t('ct.supplier') : contact.type === ContactType.CUSTOMER ? t('ct.customer') : t('ct.both')

  return (
    <div className="frame">
      <button type="button" className="back-btn" onClick={() => navigate('/contacts')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 18l-6-6 6-6" /></svg>
        {t('ct.title')}
      </button>

      <div className="page-head">
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <span className="u-abbr" style={{ height: 44, minWidth: 44, fontSize: 16 }}>{contact.name.slice(0, 2).toUpperCase()}</span>
          <div>
            <h1>{contact.name}</h1>
            <p>{typeLabel}{contact.phone ? ` · ${contact.phone}` : ''}</p>
          </div>
        </div>
        <Button variant="soft" onClick={() => setEditing(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="M14 6l4 4" /></svg>
          {t('ct.edit')}
        </Button>
      </div>

      <div className="minihead">
        <div className="m"><div className="k">{t('ct.weOweLabel')}</div><div className="v" style={{ color: contact.totalPayable > 0 ? 'var(--danger)' : undefined }}>{money.format(contact.totalPayable)}</div><div className="h">{t('ct.payableHint')}</div></div>
        <div className="m"><div className="k">{t('ct.owesUsLabel')}</div><div className="v" style={{ color: contact.totalReceivable > 0 ? 'var(--warning)' : undefined }}>{money.format(contact.totalReceivable)}</div><div className="h">{t('ct.receivableHint')}</div></div>
        <div className="m"><div className="k">{t('ct.openDebts')}</div><div className="v">{contact.openDebts}</div><div className="h">{t('ct.openDebtsHint')}</div></div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-h"><div><h3>{t('ct.info')}</h3></div></div>
        <div className="kv">
          <div className="row"><span>{t('ct.phone')}</span><span>{contact.phone || '—'}</span></div>
          <div className="row"><span>{t('ct.phoneAlt')}</span><span>{contact.phoneAlt || '—'}</span></div>
          <div className="row"><span>{t('ct.address')}</span><span>{contact.address || '—'}</span></div>
          <div className="row"><span>{t('ct.notes')}</span><span>{contact.notes || '—'}</span></div>
        </div>
      </div>

      {/* Transactions / debts ledger lands with supplier payables (next slice). */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-h"><div><h3>{t('ct.transactions')}</h3></div></div>
        <div className="hint" style={{ padding: 16 }}>{t('ct.transactionsSoon')}</div>
      </div>

      {editing ? (
        <ContactModal contact={contact} onClose={() => setEditing(false)} onSaved={() => { void refetch(); setEditing(false) }} />
      ) : null}
    </div>
  )
}
