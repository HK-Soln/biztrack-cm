import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { Button, CommandSelect, Input, Modal } from '@biztrack/ui/biztrack'
import { majorToMinor, minorToMajor } from '@biztrack/utils'
import type { PaymentLinkView } from '@shared/ipc'
import { dataClient } from '@/lib/data-client'
import { useCurrency } from '@/lib/currency'
import { errorMessage } from '@/lib/error'
import { CopyLinkRow } from './CopyLinkRow'
import { useT } from '@/i18n'

/**
 * Spec 10 ① — create + share a GENERAL payment link (booked as other income on payment). Online-only.
 * Collects an amount (0 = payer chooses), a label, an income category, and an optional note; then shows
 * the QR + copyable link + live settlement status. Used on Settings → Payments and the Other Income page.
 */
export function GeneralLinkDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const money = useCurrency()
  const qc = useQueryClient()

  const [amount, setAmount] = useState('')
  const [label, setLabel] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [categoryLabel, setCategoryLabel] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<PaymentLinkView | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [settle, setSettle] = useState<{ paidMinor: number; totalMinor: number; done: boolean } | null>(
    null,
  )

  const categoriesQ = useQuery({
    queryKey: ['incomeCategories'],
    queryFn: () => dataClient.incomeCategories.listAll(),
    enabled: open,
  })

  // Reset everything when the dialog closes.
  useEffect(() => {
    if (open) return
    setAmount('')
    setLabel('')
    setCategoryId(null)
    setCategoryLabel(null)
    setNote('')
    setCreating(false)
    setError(null)
    setLink(null)
    setQr(null)
    setSettle(null)
  }, [open])

  // Default the category to "Delivery fees" (or the first) once categories load.
  useEffect(() => {
    if (!open || categoryId || !categoriesQ.data?.length) return
    const preferred =
      categoriesQ.data.find((c) => c.slug === 'delivery-fees') ?? categoriesQ.data[0]!
    setCategoryId(preferred.id)
    setCategoryLabel(preferred.name)
  }, [open, categoryId, categoriesQ.data])

  // Live settlement once a link exists (Spec 08/09 realtime).
  useEffect(() => {
    if (!link) return
    const off = dataClient.payments.onLinkEvent((e) => {
      if (e.paymentLinkId !== link.id) return
      setSettle({ paidMinor: e.amountPaidMinor, totalMinor: e.amountMinor, done: e.status === 'PAID' })
      void Promise.resolve(dataClient.sync.trigger())
        .catch(() => undefined)
        .then(() => qc.invalidateQueries())
    })
    return off
  }, [link, qc])

  const loadCategories = async (search: string) => {
    const rows = categoriesQ.data ?? (await dataClient.incomeCategories.listAll())
    const s = search.trim().toLowerCase()
    return rows
      .filter((c) => !s || c.name.toLowerCase().includes(s))
      .map((c) => ({ value: c.id, label: c.name }))
  }

  const generate = async () => {
    if (!categoryId) return setError(t('generalLink.errCategory'))
    if (!label.trim()) return setError(t('generalLink.errLabel'))
    const major = Number(amount.replace(/\s/g, '').replace(',', '.')) || 0
    setError(null)
    setCreating(true)
    try {
      const created = await dataClient.payments.createGeneralLink({
        amountMinor: major > 0 ? majorToMinor(major, 'XAF') : 0,
        label: label.trim(),
        incomeCategoryId: categoryId,
        note: note.trim() || undefined,
      })
      setLink(created)
      try {
        setQr(await QRCode.toDataURL(created.url, { width: 240, margin: 1 }))
      } catch {
        /* QR is a nicety; the copyable link still works */
      }
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('generalLink.title')}>
      {!link ? (
        <div>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14, lineHeight: 1.5 }}>
            {t('generalLink.body')}
          </p>
          {error ? (
            <div className="msg err" style={{ marginBottom: 12 }}>
              <span>{error}</span>
            </div>
          ) : null}
          <div style={{ marginBottom: 12 }}>
            <label className="lbl2">{t('generalLink.category')}</label>
            <CommandSelect
              value={categoryId}
              valueLabel={categoryLabel}
              onChange={(v, opt) => {
                setCategoryId(v)
                setCategoryLabel(opt?.label ?? null)
              }}
              loadOptions={loadCategories}
              placeholder={t('generalLink.categoryPh')}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="lbl2">{t('generalLink.label')}</label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t('generalLink.labelPh')}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="lbl2">{t('generalLink.amount')}</label>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={t('generalLink.amountPh')}
            />
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {t('generalLink.amountHint')}
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="lbl2">{t('generalLink.note')}</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="soft" onClick={onClose} disabled={creating}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" loading={creating} onClick={generate}>
              {t('generalLink.generate')}
            </Button>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          {settle ? (
            <div
              style={{
                margin: '0 0 12px',
                padding: '10px 12px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                color: settle.done ? 'var(--success, #1a7f45)' : '#b26b00',
                background: settle.done ? 'rgba(26,127,69,0.12)' : 'rgba(245,179,1,0.16)',
              }}
            >
              {settle.done
                ? t('paymentLink.livePaid')
                : t('paymentLink.livePartial')
                    .replace('{paid}', money.format(minorToMajor(settle.paidMinor, link.currency)))
                    .replace('{total}', money.format(minorToMajor(settle.totalMinor, link.currency)))}
            </div>
          ) : null}
          {qr && !settle?.done ? (
            <img
              src={qr}
              alt=""
              width={200}
              height={200}
              style={{
                borderRadius: 12,
                border: '1px solid var(--line, rgba(0,0,0,0.08))',
                background: '#fff',
                padding: 8,
              }}
            />
          ) : null}
          <p style={{ color: 'var(--text-2)', fontSize: 12.5, margin: '12px 0 10px' }}>
            {t('paymentLink.shareHint')}
          </p>
          <CopyLinkRow url={link.url} />
          <div style={{ marginTop: 14 }}>
            <Button variant="primary" onClick={onClose} block>
              {t('common.close')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
