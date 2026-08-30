import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, PhoneInput } from '@biztrack/ui/biztrack'
import { DebtDirection, DebtSource } from '@biztrack/types'
import type { LocalDebt } from '@shared/ipc'
import { dataClient } from '@/lib/data-client'
import { ActionMenu } from '@/components/ActionMenu'
import { useCurrency } from '@/lib/currency'
import { openExternal, whatsappUrl } from '@/lib/share'
import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'

// Per-customer debt tools in the contact-details receivable panel: an ellipsis menu with
// a one-tap WhatsApp reminder (3 tones + optional itemised breakdown) and a "view all
// debts" modal that lists the outstanding debts making up the balance, with per-debt
// editable due dates (D9). Self-hides when the customer owes nothing.
//
// BIZ-4.3: the reminder OPENS WhatsApp via a wa.me deep link with the message pre-filled and
// editable — the owner reviews and sends it themselves. It never auto-sends: in a small
// community the owner must keep control of the tone. (The full account statement has its own
// dedicated "send statement" action on the contact page.)

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
const ICO_WA = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.3A9 9 0 1 0 12 3Z" />
  </svg>
)
const ICO_LIST = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
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
  const [debtsOpen, setDebtsOpen] = useState(false)

  // Outstanding receivable debts making up the balance (incl. opening balance so the list
  // reconciles with the total). Only fetched when a panel that needs them opens.
  const debtsQ = useQuery({
    queryKey: ['debtorDebts', contact.id],
    queryFn: async () => {
      const res = await dataClient.debts.listByContact(contact.id, { limit: 100 })
      return res.data.filter(
        (d) => d.direction === DebtDirection.RECEIVABLE && d.outstandingAmount > 0,
      )
    },
    enabled: debtsOpen,
  })

  if (contact.totalReceivable <= 0) return null

  return (
    <>
      <ActionMenu
        label={t('debtors.menuLabel')}
        items={[
          { label: t('debtors.remind'), icon: ICO_WA, onClick: () => setRemind(true) },
          { label: t('debtors.viewDebts'), icon: ICO_LIST, onClick: () => setDebtsOpen(true) },
        ]}
      />
      {remind ? (
        <ReminderModal
          contact={contact}
          businessName={businessName}
          onClose={() => setRemind(false)}
        />
      ) : null}
      {debtsOpen ? (
        <AllDebtsModal
          contactId={contact.id}
          debts={debtsQ.data ?? []}
          loading={debtsQ.isLoading}
          onClose={() => setDebtsOpen(false)}
        />
      ) : null}
    </>
  )
}

function ReminderModal({
  contact,
  businessName,
  onClose,
}: {
  contact: CustomerRef
  businessName: string
  onClose: () => void
}) {
  const t = useT()
  const money = useCurrency()

  // Outstanding receivable debts, for the optional itemised breakdown ("3 sacs de riz le 13
  // avril, 2 cartons de lait le 20" ends an argument that "vous devez 5 900" starts).
  const debtsQ = useQuery({
    queryKey: ['debtorDebts', contact.id],
    queryFn: async () => {
      const res = await dataClient.debts.listByContact(contact.id, { limit: 100 })
      return res.data.filter(
        (d) => d.direction === DebtDirection.RECEIVABLE && d.outstandingAmount > 0,
      )
    },
  })

  const [tone, setTone] = useState<Tone>('neutral')
  const [itemised, setItemised] = useState(false)
  const [phone, setPhone] = useState(contact.phone ?? '')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const buildMessage = (tk: Tone, withItems: boolean) => {
    let msg = t(TONE_KEY[tk])
      .replace('{name}', contact.name)
      .replace('{amount}', money.format(contact.totalReceivable))
      .replace('{business}', businessName)
    const debts = debtsQ.data ?? []
    if (withItems && debts.length > 0) {
      const lines = debts
        .map((d) => {
          const ref =
            d.sourceType === DebtSource.OPENING_BALANCE ? t('debtors.opening') : d.sourceReference
          const date = new Date(d.createdAt).toLocaleDateString()
          return `• ${ref} (${date}) : ${money.format(d.outstandingAmount)}`
        })
        .join('\n')
      msg += `\n\n${t('debtors.waItems')}\n${lines}`
    }
    return msg
  }

  const [message, setMessage] = useState(() => buildMessage('neutral', false))

  // Picking a tone / toggling the breakdown regenerates the draft; the owner then refines it.
  const regen = (tk: Tone, withItems: boolean) => {
    setTone(tk)
    setItemised(withItems)
    setMessage(buildMessage(tk, withItems))
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setError(t('debtors.copyError'))
    }
  }

  const openInWhatsapp = () => {
    setError(null)
    openExternal(whatsappUrl(message.trim(), phone.trim()))
  }

  const canOpen = !!message.trim()

  return (
    <Overlay onClose={onClose} title={t('debtors.remind')} width={460}>
      <div className="dbtr-tones" style={{ marginBottom: 12 }}>
        {(['gentle', 'neutral', 'firm'] as Tone[]).map((tk) => (
          <button
            key={tk}
            type="button"
            className={`ofs-chip${tone === tk ? ' on' : ''}`}
            onClick={() => regen(tk, itemised)}
          >
            {t(TONE_LABEL[tk])}
          </button>
        ))}
      </div>
      <textarea
        className="dbtr-msg"
        rows={6}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <label className="dbtr-itemised" style={{ marginTop: 10 }}>
        <input
          type="checkbox"
          checked={itemised}
          disabled={debtsQ.isLoading || (debtsQ.data?.length ?? 0) === 0}
          onChange={(e) => regen(tone, e.target.checked)}
        />
        {t('debtors.itemised')}
      </label>
      <div className="ff" style={{ marginTop: 12 }}>
        <label className="lbl2">{t('share.recipientPhone')}</label>
        <PhoneInput value={phone} onChange={(v) => setPhone(v ?? '')} />
      </div>
      <p style={{ color: 'var(--text-2)', fontSize: 12, marginTop: 8 }}>{t('debtors.openHint')}</p>
      {error ? (
        <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }} role="alert">
          {error}
        </p>
      ) : null}
      <div
        style={{
          display: 'flex',
          gap: 8,
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 16,
        }}
      >
        <Button type="button" variant="soft" onClick={copy}>
          {copied ? t('debtors.copied') : t('debtors.copy')}
        </Button>
        <Button type="button" variant="primary" disabled={!canOpen} onClick={openInWhatsapp}>
          {t('debtors.openWhatsapp')}
        </Button>
      </div>
    </Overlay>
  )
}

function AllDebtsModal({
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
    <Overlay onClose={onClose} title={t('debtors.viewDebts')} width={520}>
      {loading ? (
        <p style={{ color: 'var(--text-2)', fontSize: 13 }}>…</p>
      ) : debts.length === 0 ? (
        <p style={{ color: 'var(--text-2)', fontSize: 13 }}>{t('debtors.noOpenDebts')}</p>
      ) : (
        <div className="debt-list">
          {debts.map((d) => (
            <DebtItem key={d.id} debt={d} contactId={contactId} />
          ))}
        </div>
      )}
    </Overlay>
  )
}

function DebtItem({ debt, contactId }: { debt: LocalDebt; contactId: string }) {
  const t = useT()
  const money = useCurrency()
  const qc = useQueryClient()
  const [value, setValue] = useState(debt.dueDate ?? '')
  const isOpening = debt.sourceType === DebtSource.OPENING_BALANCE

  const save = useMutation({
    mutationFn: () => dataClient.debts.updateDueDate(debt.id, value || null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['debtorDebts', contactId] })
      qc.invalidateQueries({ queryKey: ['debts', 'ageing', DebtDirection.RECEIVABLE] })
    },
  })
  const dirty = (value || '') !== (debt.dueDate ?? '')
  const created = new Date(debt.createdAt).toLocaleDateString()

  return (
    <div className="debt-item">
      <div className="debt-item-top">
        <span className="debt-item-ref">
          {isOpening ? t('debtors.opening') : debt.sourceReference}
        </span>
        <span className="debt-item-out">{money.format(debt.outstandingAmount)}</span>
      </div>
      <div className="debt-item-meta">
        <span>{created}</span>
        <span>
          {t('debtors.colOriginal')}: {money.format(debt.originalAmount)}
        </span>
        {debt.paidAmount > 0 ? (
          <span>
            {t('debtors.colPaid')}: {money.format(debt.paidAmount)}
          </span>
        ) : null}
      </div>
      <div className="debt-item-due">
        <label>{t('debtors.dueDate')}</label>
        {isOpening ? (
          <span className="debt-item-due-na">{debt.dueDate ?? '—'}</span>
        ) : (
          <>
            <Input type="date" value={value} onChange={(e) => setValue(e.target.value)} />
            <Button
              type="button"
              variant={dirty ? 'primary' : 'ghost'}
              disabled={!dirty || save.isPending}
              onClick={() => save.mutate()}
            >
              {t('debtors.saveDate')}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function Overlay({
  title,
  width,
  onClose,
  children,
}: {
  title: string
  width: number
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div
      className="pay-overlay open"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="pay-modal" style={{ width }}>
        <div className="pm-head">
          <h3>{title}</h3>
          <button type="button" className="x" onClick={onClose}>
            {X}
          </button>
        </div>
        <div className="pm-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
