import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BackButton, Button, Input } from '@biztrack/ui/biztrack'
import { DebtDirection, DebtSource, type AgeingEntry, type LocalDebt } from '@biztrack/types'
import { dataClient } from '@/lib/data-client'
import { useCurrency } from '@/lib/currency'
import { openExternal } from '@/lib/share'
import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'

// Debtors to follow up (BIZ-4.3 / P3.3). Lists customers whose receivables are past their
// effective due date (D9), with a one-tap WhatsApp reminder (3 tones + optional itemised
// breakdown) and inline editable due dates. Reads the same ageing report as the reminder.

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

export function Debtors() {
  const t = useT()
  const money = useCurrency()
  const navigate = useNavigate()

  const { data: report, isLoading } = useQuery({
    queryKey: ['debts', 'ageing', DebtDirection.RECEIVABLE],
    queryFn: () => dataClient.debts.ageing(DebtDirection.RECEIVABLE),
  })
  const { data: profile } = useQuery({
    queryKey: ['business', 'profile'],
    queryFn: () => dataClient.business.getProfile(),
  })
  const businessName = profile?.name ?? ''

  const overdue = useMemo(
    () =>
      (report?.entries ?? []).filter((e) => e.pastDue > 0).sort((a, b) => b.pastDue - a.pastDue),
    [report],
  )
  const totalPastDue = report?.totals.pastDue ?? 0

  return (
    <>
      <BackButton onClick={() => navigate('/contacts')}>{t('nav.contacts')}</BackButton>
      <div className="page-head">
        <div>
          <h1>{t('debtors.title')}</h1>
          <p>{t('debtors.sub')}</p>
        </div>
      </div>

      <div className="dbtr-kpis">
        <div className="dbtr-kpi">
          <div className="k">{t('debtors.kpiTotal')}</div>
          <div className="v">{money.format(totalPastDue)}</div>
        </div>
        <div className="dbtr-kpi">
          <div className="k">{t('debtors.kpiCount')}</div>
          <div className="v">{overdue.length}</div>
        </div>
      </div>

      {isLoading ? (
        <div className="card" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          …
        </div>
      ) : overdue.length === 0 ? (
        <div className="cat-empty">{t('debtors.empty')}</div>
      ) : (
        <div className="dbtr-list">
          {overdue.map((e) => (
            <DebtorCard key={e.contactId} entry={e} businessName={businessName} />
          ))}
        </div>
      )}
    </>
  )
}

function DebtorCard({ entry, businessName }: { entry: AgeingEntry; businessName: string }) {
  const t = useT()
  const money = useCurrency()
  const [tone, setTone] = useState<Tone>('neutral')
  const [itemised, setItemised] = useState(false)
  const [open, setOpen] = useState(false)

  // The customer's individual overdue debts — for the itemised breakdown + editable dates.
  const { data: debts = [] } = useQuery({
    queryKey: ['debtorDebts', entry.contactId],
    queryFn: async () => {
      const res = await dataClient.debts.listByContact(entry.contactId, { limit: 100 })
      return res.data.filter(
        (d) =>
          d.direction === DebtDirection.RECEIVABLE &&
          d.sourceType !== DebtSource.OPENING_BALANCE &&
          d.outstandingAmount > 0,
      )
    },
    enabled: open || itemised,
  })

  const digits = (entry.contactPhone ?? '').replace(/\D/g, '')

  const sendWhatsApp = () => {
    let msg = t(TONE_KEY[tone])
      .replace('{name}', entry.contactName)
      .replace('{amount}', money.format(entry.pastDue))
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
    openExternal(
      digits
        ? `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
        : `https://wa.me/?text=${encodeURIComponent(msg)}`,
    )
  }

  return (
    <div className="dbtr-card">
      <div className="dbtr-top">
        <div className="dbtr-who">
          <div className="nm">{entry.contactName}</div>
          <div className="ph">{entry.contactPhone || t('debtors.noPhone')}</div>
        </div>
        <div className="dbtr-amt">{money.format(entry.pastDue)}</div>
      </div>

      <div className="dbtr-tones">
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

      <div className="dbtr-actions">
        <Button type="button" variant="primary" onClick={sendWhatsApp}>
          {t('debtors.remind')}
        </Button>
        <button type="button" className="btn" onClick={() => setOpen((v) => !v)}>
          {t('debtors.manageDates')}
        </button>
      </div>

      {open ? (
        <div className="dbtr-dates">
          {debts.length === 0 ? (
            <div style={{ color: 'var(--text-2)', fontSize: 12 }}>…</div>
          ) : (
            debts.map((d) => <DebtDateRow key={d.id} debt={d} contactId={entry.contactId} />)
          )}
        </div>
      ) : null}
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
      qc.invalidateQueries({ queryKey: ['debts', 'ageing', DebtDirection.RECEIVABLE] })
      qc.invalidateQueries({ queryKey: ['debtorDebts', contactId] })
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
