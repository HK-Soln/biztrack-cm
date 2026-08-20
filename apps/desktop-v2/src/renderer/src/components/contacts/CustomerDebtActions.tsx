import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, PhoneInput } from '@biztrack/ui/biztrack'
import { DebtDirection, DebtSource } from '@biztrack/types'
import type { LocalDebt } from '@shared/ipc'
import { dataClient } from '@/lib/data-client'
import { ActionMenu } from '@/components/ActionMenu'
import { useCurrency } from '@/lib/currency'
import { errorMessage } from '@/lib/error'
import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'

// Per-customer debt tools in the contact-details receivable panel: an ellipsis menu with
// a one-tap WhatsApp reminder (3 tones + optional itemised breakdown) and a "view all
// debts" modal that lists the outstanding debts making up the balance, with per-debt
// editable due dates (D9). Self-hides when the customer owes nothing.

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
  statementHtml,
  statementFilename,
}: {
  contact: CustomerRef
  businessName: string
  /** Pre-built receivable statement HTML (for the optional 'send with statement' attach). */
  statementHtml: string | null
  statementFilename: string
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
          statementHtml={statementHtml}
          statementFilename={statementFilename}
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
  statementHtml,
  statementFilename,
  onClose,
}: {
  contact: CustomerRef
  businessName: string
  statementHtml: string | null
  statementFilename: string
  onClose: () => void
}) {
  const t = useT()
  const money = useCurrency()
  const genMessage = (tone: Tone) =>
    t(TONE_KEY[tone])
      .replace('{name}', contact.name)
      .replace('{amount}', money.format(contact.totalReceivable))
      .replace('{business}', businessName)

  const [tone, setTone] = useState<Tone>('neutral')
  const [message, setMessage] = useState(() => genMessage('neutral'))
  const [phone, setPhone] = useState(contact.phone ?? '')
  const [withStatement, setWithStatement] = useState(false)
  const [copied, setCopied] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pickTone = (tk: Tone) => {
    setTone(tk)
    setMessage(genMessage(tk)) // regenerate; the user can then refine the text
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

  const send = useMutation({
    mutationFn: () =>
      dataClient.documents.shareHtmlPdf({
        channel: 'whatsapp',
        message: message.trim(),
        phone: phone.trim(),
        subject: t('debtors.reminderSubject').replace('{business}', businessName),
        html: withStatement ? (statementHtml ?? undefined) : undefined,
        filename: withStatement ? statementFilename : undefined,
      }),
    onSuccess: () => setDone(t('debtors.reminderSent')),
    onError: (e) =>
      setError(
        typeof navigator !== 'undefined' && !navigator.onLine
          ? t('debtors.reminderOffline')
          : errorMessage(e, t('share.error')),
      ),
  })

  const canSend = !!message.trim() && !!phone.trim() && !send.isPending

  return (
    <Overlay onClose={onClose} title={t('debtors.remind')} width={460}>
      <div className="dbtr-tones" style={{ marginBottom: 12 }}>
        {(['gentle', 'neutral', 'firm'] as Tone[]).map((tk) => (
          <button
            key={tk}
            type="button"
            className={`ofs-chip${tone === tk ? ' on' : ''}`}
            onClick={() => pickTone(tk)}
          >
            {t(TONE_LABEL[tk])}
          </button>
        ))}
      </div>
      <textarea
        className="dbtr-msg"
        rows={6}
        value={message}
        onChange={(e) => {
          setMessage(e.target.value)
          setDone(null)
        }}
      />
      <label className="dbtr-itemised" style={{ marginTop: 10 }}>
        <input
          type="checkbox"
          checked={withStatement}
          disabled={!statementHtml}
          onChange={(e) => setWithStatement(e.target.checked)}
        />
        {t('debtors.withStatement')}
      </label>
      <div className="ff" style={{ marginTop: 12 }}>
        <label className="lbl2">{t('share.recipientPhone')}</label>
        <PhoneInput value={phone} onChange={(v) => setPhone(v ?? '')} />
      </div>
      {done ? (
        <p style={{ color: 'var(--success)', fontSize: 12.5, marginTop: 10 }}>{done}</p>
      ) : error ? (
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
        <Button
          type="button"
          variant="primary"
          loading={send.isPending}
          disabled={!canSend}
          onClick={() => {
            setError(null)
            send.mutate()
          }}
        >
          {t('debtors.sendWhatsapp')}
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
