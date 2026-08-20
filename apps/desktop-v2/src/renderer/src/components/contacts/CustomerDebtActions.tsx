import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, PhoneInput } from '@biztrack/ui/biztrack'
import { DebtDirection, DebtSource } from '@biztrack/types'
import type { LocalDebt } from '@shared/ipc'
import { dataClient } from '@/lib/data-client'
import { useCurrency } from '@/lib/currency'
import { openExternal } from '@/lib/share'
import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'

// Per-customer debt tools shown in the contact-details receivable panel: a one-tap
// WhatsApp reminder (3 tones + optional itemised breakdown) and inline editable due dates
// (D9). Only renders when the customer actually owes. Reuses the debtors.* i18n + .dbtr-*.

type Tone = 'gentle' | 'neutral' | 'firm'
const TONE_KEY: Record<Tone, MessageKey> = {
  gentle: 'debtors.waGentle',
  neutral: 'debtors.waNeutral',
  firm: 'debtors.waFirm',
}
const TONE_LABEL: Record<Tone, MessageKey> = {
  gentle: 'debtors.toneGentle',
  neutral: 'debtors.toneNeutral',
  firm: 'debtors.toneFirm',
}

const X = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

interface CustomerRef {
  id: string
  name: string
  phone: string | null
  totalReceivable: number
}

export function CustomerDebtActions({
  contact,
  businessName,
}: {
  contact: CustomerRef
  businessName: string
}) {
  const t = useT()
  const [remind, setRemind] = useState(false)
  const [dates, setDates] = useState(false)

  // The customer's outstanding receivable debts — for the itemised breakdown + due dates.
  const debtsQ = useQuery({
    queryKey: ['debtorDebts', contact.id],
    queryFn: async () => {
      const res = await dataClient.debts.listByContact(contact.id, { limit: 100 })
      return res.data.filter(
        (d) =>
          d.direction === DebtDirection.RECEIVABLE &&
          d.sourceType !== DebtSource.OPENING_BALANCE &&
          d.outstandingAmount > 0,
      )
    },
    enabled: remind || dates,
  })

  if (contact.totalReceivable <= 0) return null

  return (
    <>
      <button type="button" className="btn" onClick={() => setRemind(true)}>
        {t('debtors.remind')}
      </button>
      <button type="button" className="btn" onClick={() => setDates(true)}>
        {t('debtors.manageDates')}
      </button>
      {remind ? (
        <ReminderModal
          contact={contact}
          businessName={businessName}
          debts={debtsQ.data ?? []}
          onClose={() => setRemind(false)}
        />
      ) : null}
      {dates ? (
        <DueDatesModal
          contactId={contact.id}
          debts={debtsQ.data ?? []}
          loading={debtsQ.isLoading}
          onClose={() => setDates(false)}
        />
      ) : null}
    </>
  )
}

function ReminderModal({
  contact,
  businessName,
  debts,
  onClose,
}: {
  contact: CustomerRef
  businessName: string
  debts: LocalDebt[]
  onClose: () => void
}) {
  const t = useT()
  const money = useCurrency()
  const [tone, setTone] = useState<Tone>('neutral')
  const [itemised, setItemised] = useState(false)
  const [phone, setPhone] = useState(contact.phone ?? '')

  const send = () => {
    let msg = t(TONE_KEY[tone])
      .replace('{name}', contact.name)
      .replace('{amount}', money.format(contact.totalReceivable))
      .replace('{business}', businessName)
    if (itemised && debts.length > 0) {
      const items = debts
        .map(
          (d) =>
            `• ${d.sourceReference} — ${money.format(d.outstandingAmount)}${
              d.dueDate ? ` (${d.dueDate})` : ''
            }`,
        )
        .join('\n')
      msg += `\n\n${t('debtors.waItems')}\n${items}`
    }
    const digits = phone.replace(/\D/g, '')
    openExternal(
      digits
        ? `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
        : `https://wa.me/?text=${encodeURIComponent(msg)}`,
    )
    onClose()
  }

  return (
    <div
      className="pay-overlay open"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="pay-modal" style={{ width: 440 }}>
        <div className="pm-head">
          <h3>{t('debtors.remind')}</h3>
          <button type="button" className="x" onClick={onClose}>
            {X}
          </button>
        </div>
        <div className="pm-body">
          <div className="dbtr-tones" style={{ marginBottom: 14 }}>
            {(['gentle', 'neutral', 'firm'] as Tone[]).map((tk) => (
              <button
                key={tk}
                type="button"
                className={`ofs-chip${tone === tk ? ' on' : ''}`}
                onClick={() => setTone(tk)}
              >
                {t(TONE_LABEL[tk])}
              </button>
            ))}
            <label className="dbtr-itemised">
              <input
                type="checkbox"
                checked={itemised}
                onChange={(e) => setItemised(e.target.checked)}
              />
              {t('debtors.itemised')}
            </label>
          </div>
          <div className="ff">
            <label className="lbl2">{t('share.recipientPhone')}</label>
            <PhoneInput value={phone} onChange={(v) => setPhone(v ?? '')} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <Button variant="soft" onClick={onClose}>
              {t('share.back')}
            </Button>
            <Button variant="primary" disabled={!phone.trim()} onClick={send}>
              {t('debtors.remind')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DueDatesModal({
  contactId,
  debts,
  loading,
  onClose,
}: {
  contactId: string
  debts: LocalDebt[]
  loading: boolean
  onClose: () => void
}) {
  const t = useT()
  return (
    <div
      className="pay-overlay open"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="pay-modal" style={{ width: 460 }}>
        <div className="pm-head">
          <h3>{t('debtors.manageDates')}</h3>
          <button type="button" className="x" onClick={onClose}>
            {X}
          </button>
        </div>
        <div className="pm-body">
          {loading ? (
            <p style={{ color: 'var(--text-2)', fontSize: 13 }}>…</p>
          ) : debts.length === 0 ? (
            <p style={{ color: 'var(--text-2)', fontSize: 13 }}>{t('debtors.noOpenDebts')}</p>
          ) : (
            <div className="dbtr-dates" style={{ borderTop: 0, paddingTop: 0 }}>
              {debts.map((d) => (
                <DebtDateRow key={d.id} debt={d} contactId={contactId} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DebtDateRow({ debt, contactId }: { debt: LocalDebt; contactId: string }) {
  const t = useT()
  const money = useCurrency()
  const qc = useQueryClient()
  const [value, setValue] = useState(debt.dueDate ?? '')

  const save = useMutation({
    mutationFn: () => dataClient.debts.updateDueDate(debt.id, value || null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['debtorDebts', contactId] })
      qc.invalidateQueries({ queryKey: ['debts', 'ageing', DebtDirection.RECEIVABLE] })
    },
  })
  const dirty = (value || '') !== (debt.dueDate ?? '')

  return (
    <div className="dbtr-date-row">
      <div className="ref">
        <div className="r">{debt.sourceReference}</div>
        <div className="a">{money.format(debt.outstandingAmount)}</div>
      </div>
      <Input type="date" value={value} onChange={(e) => setValue(e.target.value)} />
      <Button
        type="button"
        variant={dirty ? 'primary' : 'ghost'}
        disabled={!dirty || save.isPending}
        onClick={() => save.mutate()}
      >
        {t('debtors.saveDate')}
      </Button>
    </div>
  )
}
