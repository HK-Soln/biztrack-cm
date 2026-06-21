import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, CommandSelect, Input, PhoneInput, Select, isValidPhone } from '@biztrack/ui/biztrack'
import { dataClient, isElectron } from '@/lib/data-client'
import { useCurrency } from '@/lib/currency'
import { useLangStore, useT } from '@/i18n'
import { errorMessage } from '@/lib/error'
import type { CloseDepositInput, CustomerDeposit, DepositTaggedProduct, DepositTransaction } from '@shared/ipc'

const PAY_METHODS = ['CASH', 'MTN_MOMO', 'ORANGE_MONEY', 'CARD'] as const

const I = {
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M5 12h14" /></svg>,
  x: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6 6 18" /></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path d="m5 12 5 5L20 7" /></svg>,
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '—'
}

export function Deposits() {
  const t = useT()
  const money = useCurrency()
  const lang = useLangStore((s) => s.lang)
  const qc = useQueryClient()

  const [status, setStatus] = useState<'OPEN' | 'CLOSED' | ''>('OPEN')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const summary = useQuery({ queryKey: ['deposits', 'summary'], queryFn: () => dataClient.deposits.summary(), enabled: isElectron })
  const list = useQuery({
    queryKey: ['deposits', 'list', status],
    queryFn: () => dataClient.deposits.list({ status: status || undefined, limit: 100 }),
    enabled: isElectron,
  })
  const rows = list.data?.data ?? []

  useEffect(() => {
    if (rows.length === 0) { setSelectedId(null); return }
    if (!selectedId || !rows.some((r) => r.id === selectedId)) setSelectedId(rows[0]!.id)
  }, [rows, selectedId])

  const refresh = () => { void qc.invalidateQueries({ queryKey: ['deposits'] }) }
  const s = summary.data

  return (
    <div className="frame">
      <div className="page-head">
        <div>
          <h1>{t('dep.title')}</h1>
          <p>{t('dep.subtitle')}</p>
        </div>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>{I.plus}{t('dep.new')}</Button>
      </div>

      <div className="minihead">
        <div className="m"><div className="k">{t('dep.kpiOpen')}</div><div className="v">{s?.openCount ?? 0}</div><div className="h">{t('dep.kpiOpenHint')}</div></div>
        <div className="m"><div className="k">{t('dep.kpiHeld')}</div><div className="v">{money.format(s?.depositsHeld ?? 0)}</div><div className="h">{t('dep.kpiHeldHint')}</div></div>
        <div className="m"><div className="k">{t('dep.kpiCollected')}</div><div className="v">{money.format(s?.collectedAmount ?? 0)}</div><div className="h">{t('dep.kpiCollectedHint').replace('{n}', String(s?.collectedCount ?? 0))}</div></div>
        <div className="m"><div className="k">{t('dep.kpiSettled')}</div><div className="v">{money.format(s?.refundedTransferredAmount ?? 0)}</div><div className="h">{t('dep.kpiSettledHint').replace('{n}', String(s?.refundedTransferredCount ?? 0))}</div></div>
      </div>

      <div className="mdlayout">
        <div className="panel">
          <div className="panel-head">
            <h3>{t('dep.sessions')}</h3>
            <div className="spacer" style={{ flex: 1 }} />
            <div className="select-wrap" style={{ width: 150 }}>
              <select className="select" style={{ height: 36 }} value={status} onChange={(e) => setStatus(e.target.value as 'OPEN' | 'CLOSED' | '')}>
                <option value="OPEN">{t('dep.open')}</option>
                <option value="CLOSED">{t('dep.closed')}</option>
                <option value="">{t('dep.all')}</option>
              </select>
            </div>
          </div>
          <div className="slist">
            {rows.map((d) => (
              <button key={d.id} type="button" className={`it${d.id === selectedId ? ' sel' : ''}`} onClick={() => setSelectedId(d.id)}>
                <div className="ic" style={{ borderRadius: '50%' }}>{initials(d.customerName ?? '—')}</div>
                <div className="tx"><div className="nm">{d.customerName ?? '—'}</div><div className="sub">{d.accountNumber} · {formatDay(d.createdAt, lang)}</div></div>
                <div className="rt">{money.format(d.balance)}<div className="rs">{statusLabel(t, d)}</div></div>
              </button>
            ))}
            {!list.isPending && rows.length === 0 ? <div className="cat-empty" style={{ padding: 20 }}>{t('dep.empty')}</div> : null}
          </div>
        </div>
        <div className="mddetail">
          {selectedId ? <DepositDetail id={selectedId} t={t} onChanged={refresh} /> : <div className="receipt-empty">{t('dep.selectHint')}</div>}
        </div>
      </div>

      {createOpen ? <NewDepositModal t={t} onClose={() => setCreateOpen(false)} onSaved={(d) => { refresh(); setSelectedId(d.id); setCreateOpen(false) }} /> : null}
    </div>
  )
}

// --- detail pane -----------------------------------------------------------
function DepositDetail({ id, t, onChanged }: { id: string; t: ReturnType<typeof useT>; onChanged: () => void }) {
  const money = useCurrency()
  const lang = useLangStore((s) => s.lang)
  const [payOpen, setPayOpen] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)
  const [receiptTxn, setReceiptTxn] = useState<DepositTransaction | null>(null)

  const { data } = useQuery({ queryKey: ['deposits', 'detail', id], queryFn: () => dataClient.deposits.get(id), enabled: isElectron })
  if (!data) return <div className="receipt-empty">{t('dep.loading')}</div>
  const d = data
  const open = d.status === 'OPEN'
  const tagged = d.taggedProducts ?? []

  return (
    <>
      <div className="receipt" style={{ marginBottom: 14 }}>
        <div className="binhead">
          <div className="t">{d.customerName ?? '—'}<p>{d.accountNumber} · {formatDay(d.createdAt, lang)}</p></div>
          <div className="big">{money.format(d.balance)}<small>{t('dep.balance')}</small></div>
        </div>
        <div className="binmeta">
          <div className="c"><div className="l">{t('dep.deposited')}</div><div className="v">{money.format(d.totalDeposited)}</div></div>
          <div className="c"><div className="l">{t('dep.collected')}</div><div className="v">{money.format(d.totalUsed)}</div></div>
          <div className="c"><div className="l">{t('dep.balance')}</div><div className="v">{money.format(d.balance)}</div></div>
          <div className="c"><div className="l">{t('dep.status')}</div><div className="v">{statusLabel(t, d)}</div></div>
        </div>
        {tagged.length > 0 ? (
          <div className="receipt-b">
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>{t('dep.taggedItems')}</div>
            {tagged.map((p: DepositTaggedProduct) => (
              <div key={p.productId} className="receipt-line"><div className="nm">{p.productName}</div></div>
            ))}
          </div>
        ) : null}
        {open ? (
          <div className="receipt-act">
            <button type="button" onClick={() => setPayOpen(true)}>{t('dep.addPayment')}</button>
            <button type="button" className="primary" onClick={() => setCloseOpen(true)}>{d.salesCount && d.salesCount > 0 ? t('dep.markCollected') : t('dep.closeSession')}</button>
          </div>
        ) : null}
      </div>

      <div className="card">
        <div className="card-h"><div><h3>{t('dep.timeline')}</h3></div></div>
        {d.transactions.length === 0 ? <div className="hint">{t('dep.noActivity')}</div> : (
          d.transactions.map((tx: DepositTransaction) => (
            <div key={tx.id} style={{ display: 'flex', gap: 11, padding: '8px 0', alignItems: 'flex-start' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: tx.direction === 'inbound' ? 'var(--success)' : 'var(--brand)', marginTop: 5, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 550, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>{txLabel(t, tx.type)}{tx.method ? ` · ${payLabel(t, tx.method)}` : ''}</span>
                  <span style={{ color: tx.direction === 'inbound' ? 'var(--success)' : 'var(--text)' }}>{tx.direction === 'inbound' ? '+' : '−'}{money.format(tx.amount)}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span>{formatDateTime(tx.occurredAt, lang)}{tx.notes ? ` · ${tx.notes}` : ''}</span>
                  {tx.type === 'deposit' || tx.type === 'refund' ? (
                    <button type="button" className="link" style={{ fontSize: 11 }} onClick={() => setReceiptTxn(tx)}>{t('dep.receipt')}</button>
                  ) : null}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {payOpen ? <AddPaymentModal id={id} t={t} onClose={() => setPayOpen(false)} onSaved={() => { onChanged(); setPayOpen(false) }} /> : null}
      {closeOpen ? <CloseModal deposit={d} t={t} onClose={() => setCloseOpen(false)} onSaved={() => { onChanged(); setCloseOpen(false) }} /> : null}
      {receiptTxn ? <DepositReceiptDialog transactionId={receiptTxn.id} customerName={d.customerName ?? ''} customerPhone={d.customerPhone ?? ''} t={t} locale={lang} onClose={() => setReceiptTxn(null)} /> : null}
    </>
  )
}

// --- tagged-items picker: a searchable popover checklist; the count chip opens a review modal --
function TaggedItemsPicker({ tagged, onChange, t }: { tagged: DepositTaggedProduct[]; onChange: (next: DepositTaggedProduct[]) => void; t: ReturnType<typeof useT> }) {
  const [open, setOpen] = useState(false)
  const [review, setReview] = useState(false)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => { const id = setTimeout(() => setDebounced(search), 200); return () => clearTimeout(id) }, [search])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const { data } = useQuery({
    queryKey: ['deposits', 'product-pick', debounced],
    queryFn: () => dataClient.products.list({ search: debounced.trim() || undefined, limit: 30, stockStatus: 'all' }),
    enabled: isElectron && open,
  })
  const results = data?.data ?? []
  const selectedIds = new Set(tagged.map((x) => x.productId))
  const toggle = (id: string, name: string) =>
    onChange(selectedIds.has(id) ? tagged.filter((x) => x.productId !== id) : [...tagged, { productId: id, productName: name }])
  const countLabel = t('dep.itemsCount').replace('{n}', String(tagged.length))

  return (
    <div className="tag-field" ref={wrapRef}>
      <button type="button" className="tag-trigger" onClick={() => setOpen((o) => !o)}>
        <span className={tagged.length ? 'tag-trigger-val' : 'tag-trigger-ph'}>{tagged.length ? countLabel : t('dep.addProduct')}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="tag-chev"><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {open ? (
        <div className="tag-pop">
          <div className="tag-pop-head">
            <input className="tag-pop-search" autoFocus value={search} placeholder={t('dep.searchProduct')} onChange={(e) => setSearch(e.target.value)} />
            {tagged.length ? <button type="button" className="tag-count clickable" onClick={() => setReview(true)}>{countLabel}</button> : null}
          </div>
          <div className="tag-pop-list">
            {results.length === 0 ? (
              <div className="tag-picker-empty">{t('dep.noProducts')}</div>
            ) : (
              results.map((p) => {
                const on = selectedIds.has(p.id)
                return (
                  <button type="button" key={p.id} className={`tag-opt${on ? ' on' : ''}`} onClick={() => toggle(p.id, p.name)}>
                    <span className="tag-check">{on ? I.check : null}</span>
                    <span className="tag-name">{p.name}</span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      ) : null}

      {review ? (
        <div className="pay-overlay open" onClick={(e) => { if (e.target === e.currentTarget) setReview(false) }}>
          <div className="pay-modal" style={{ width: 420 }}>
            <div className="pm-head"><h3>{t('dep.selectedItems')} · {tagged.length}</h3><button type="button" className="x" onClick={() => setReview(false)}>{I.x}</button></div>
            <div className="pm-body">
              {tagged.length === 0 ? <p className="hint">{t('dep.noneSelected')}</p> : (
                <div className="tag-list" style={{ maxHeight: 340 }}>
                  {tagged.map((p) => (
                    <div key={p.productId} className="tag-row">
                      <span className="tag-name">{p.productName}</span>
                      <button type="button" className="tag-x" aria-label={t('dep.remove')} onClick={() => toggle(p.productId, p.productName)}>{I.x}</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                <Button type="button" variant="primary" onClick={() => setReview(false)}>{t('dep.done')}</Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// --- new session modal -----------------------------------------------------
function NewDepositModal({ t, onClose, onSaved }: { t: ReturnType<typeof useT>; onClose: () => void; onSaved: (d: CustomerDeposit) => void }) {
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [tagged, setTagged] = useState<DepositTaggedProduct[]>([])
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('CASH')
  const [error, setError] = useState<string | null>(null)

  const loadCustomers = async (q: string) => {
    const all = await dataClient.contacts.listAllCustomers()
    const s = q.trim().toLowerCase()
    return all.filter((c) => !s || c.name.toLowerCase().includes(s)).map((c) => ({ value: c.id, label: c.name, sublabel: c.phone ?? undefined }))
  }
  const save = useMutation({
    mutationFn: () => dataClient.deposits.create({
      customerId: customerId!,
      taggedProducts: tagged.length ? tagged : null,
      initialDeposit: Number(amount.replace(/\s/g, '').replace(',', '.')) > 0 ? { amount: Number(amount.replace(/\s/g, '').replace(',', '.')), method } : null,
    }),
    onSuccess: onSaved,
    onError: (e) => setError(errorMessage(e, t('dep.saveError'))),
  })
  const submit = () => {
    if (!customerId) return setError(t('dep.errCustomer'))
    setError(null)
    save.mutate()
  }

  return (
    <div className="pay-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="pay-modal" style={{ width: 460 }}>
        <div className="pm-head"><h3>{t('dep.new')}</h3><button type="button" className="x" onClick={onClose}>{I.x}</button></div>
        <form className="pm-body" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <div className="ff" style={{ marginBottom: 12 }}>
            <label className="lbl2">{t('dep.customer')}</label>
            <CommandSelect value={customerId} valueLabel={customerName} onChange={(id, opt) => { setCustomerId(id); setCustomerName(opt?.label ?? ''); setError(null) }} loadOptions={loadCustomers} placeholder={t('dep.pickCustomer')} searchPlaceholder={t('dep.searchCustomer')} />
          </div>
          <div className="ff" style={{ marginBottom: 12 }}>
            <label className="lbl2" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{t('dep.taggedItems')} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {t('dep.taggedHint')}</span></span>
              {tagged.length > 0 ? <span className="tag-count">{t('dep.itemsCount').replace('{n}', String(tagged.length))}</span> : null}
            </label>
            <TaggedItemsPicker tagged={tagged} onChange={setTagged} t={t} />
          </div>
          <div className="form-2col">
            <div className="ff" style={{ marginBottom: 12 }}>
              <label className="lbl2">{t('dep.initialDeposit')}</label>
              <Input value={amount} inputMode="decimal" placeholder="0" onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="ff" style={{ marginBottom: 12 }}>
              <label className="lbl2">{t('dep.method')}</label>
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                {PAY_METHODS.map((m) => <option key={m} value={m}>{payLabel(t, m)}</option>)}
              </Select>
            </div>
          </div>
          {error ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 6 }} role="alert">{error}</p> : null}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <Button type="button" variant="soft" onClick={onClose} disabled={save.isPending}>{t('dep.cancel')}</Button>
            <Button type="submit" variant="primary" loading={save.isPending}>{t('dep.create')}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// --- add payment modal -----------------------------------------------------
function AddPaymentModal({ id, t, onClose, onSaved }: { id: string; t: ReturnType<typeof useT>; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('CASH')
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: () => dataClient.deposits.addPayment(id, { amount: Number(amount.replace(/\s/g, '').replace(',', '.')) || 0, method }),
    onSuccess: onSaved,
    onError: (e) => setError(errorMessage(e, t('dep.saveError'))),
  })
  return (
    <div className="pay-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="pay-modal" style={{ width: 380 }}>
        <div className="pm-head"><h3>{t('dep.addPayment')}</h3><button type="button" className="x" onClick={onClose}>{I.x}</button></div>
        <form className="pm-body" onSubmit={(e) => { e.preventDefault(); if (!(Number(amount.replace(/\s/g, '').replace(',', '.')) > 0)) { setError(t('dep.errAmount')); return } setError(null); save.mutate() }}>
          <div className="ff" style={{ marginBottom: 12 }}>
            <label className="lbl2">{t('dep.amount')}</label>
            <Input value={amount} inputMode="decimal" placeholder="0" onChange={(e) => { setAmount(e.target.value); setError(null) }} />
          </div>
          <div className="ff" style={{ marginBottom: 12 }}>
            <label className="lbl2">{t('dep.method')}</label>
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>{PAY_METHODS.map((m) => <option key={m} value={m}>{payLabel(t, m)}</option>)}</Select>
          </div>
          {error ? <p style={{ color: 'var(--danger)', fontSize: 12.5 }} role="alert">{error}</p> : null}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <Button type="button" variant="soft" onClick={onClose} disabled={save.isPending}>{t('dep.cancel')}</Button>
            <Button type="submit" variant="primary" loading={save.isPending}>{t('dep.addPayment')}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// --- close modal -----------------------------------------------------------
function CloseModal({ deposit, t, onClose, onSaved }: { deposit: CustomerDeposit; t: ReturnType<typeof useT>; onClose: () => void; onSaved: () => void }) {
  const money = useCurrency()
  const leftover = deposit.balance
  const hasSales = (deposit.salesCount ?? 0) > 0
  // Default settlement: refund if leftover, else none.
  const [settlement, setSettlement] = useState<'NONE' | 'REFUND' | 'TRANSFER'>(leftover > 0 ? 'REFUND' : 'NONE')
  const [method, setMethod] = useState('CASH')
  const [error, setError] = useState<string | null>(null)

  const outcomeLabel = !hasSales
    ? t('dep.outcomeRefunded')
    : settlement === 'REFUND'
      ? t('dep.outcomeCollectedRefunded')
      : settlement === 'TRANSFER'
        ? t('dep.outcomeCollectedTransferred')
        : t('dep.outcomeCollected')

  const save = useMutation({
    mutationFn: () => dataClient.deposits.close(deposit.id, { settlement, method: settlement === 'REFUND' ? method : null } as CloseDepositInput),
    onSuccess: onSaved,
    onError: (e) => setError(errorMessage(e, t('dep.saveError'))),
  })

  return (
    <div className="pay-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="pay-modal" style={{ width: 440 }}>
        <div className="pm-head"><h3>{t('dep.closeTitle')}</h3><button type="button" className="x" onClick={onClose}>{I.x}</button></div>
        <form className="pm-body" onSubmit={(e) => { e.preventDefault(); setError(null); save.mutate() }}>
          <div style={{ marginBottom: 12 }}>
            <div className="recv-tot"><span style={{ color: 'var(--text-2)' }}>{t('dep.deposited')}</span><span>{money.format(deposit.totalDeposited)}</span></div>
            <div className="recv-tot"><span style={{ color: 'var(--text-2)' }}>{t('dep.collected')}</span><span>{money.format(deposit.totalUsed)}</span></div>
            <div className="recv-tot grand"><span>{t('dep.leftover')}</span><span>{money.format(leftover)}</span></div>
          </div>

          {leftover > 0 ? (
            <div className="ff" style={{ marginBottom: 12 }}>
              <label className="lbl2">{t('dep.settleLeftover')}</label>
              <div className="pm-chips">
                <button type="button" className={`pm-chip${settlement === 'REFUND' ? ' active' : ''}`} onClick={() => setSettlement('REFUND')}>{t('dep.refund')}</button>
                <button type="button" className={`pm-chip${settlement === 'TRANSFER' ? ' active' : ''}`} disabled={!hasSales} title={!hasSales ? t('dep.transferNeedsSales') : undefined} onClick={() => setSettlement('TRANSFER')}>{t('dep.transfer')}</button>
              </div>
              {settlement === 'REFUND' ? (
                <div style={{ marginTop: 10 }}>
                  <label className="lbl2">{t('dep.refundMethod')}</label>
                  <Select value={method} onChange={(e) => setMethod(e.target.value)}>{PAY_METHODS.map((m) => <option key={m} value={m}>{payLabel(t, m)}</option>)}</Select>
                </div>
              ) : null}
              {settlement === 'TRANSFER' ? <p className="hint" style={{ marginTop: 8 }}>{t('dep.transferHint').replace('{amt}', money.format(leftover))}</p> : null}
            </div>
          ) : (
            <p className="hint" style={{ marginBottom: 12 }}>{t('dep.noLeftover')}</p>
          )}

          <div className="pm-note" style={{ marginBottom: 4 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="m5 12 5 5L20 7" /></svg>
            <span>{t('dep.willClose').replace('{outcome}', outcomeLabel)}</span>
          </div>
          {error ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 6 }} role="alert">{error}</p> : null}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
            <Button type="button" variant="soft" onClick={onClose} disabled={save.isPending}>{t('dep.cancel')}</Button>
            <Button type="submit" variant="primary" loading={save.isPending}>{t('dep.confirmClose')}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// --- deposit receipt share dialog ------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
function DepositReceiptDialog({ transactionId, customerName, customerPhone, t, locale, onClose }: {
  transactionId: string
  customerName: string
  customerPhone: string
  t: ReturnType<typeof useT>
  locale: string
  onClose: () => void
}) {
  const [mode, setMode] = useState<'menu' | 'whatsapp' | 'email'>('menu')
  const [phone, setPhone] = useState(customerPhone)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const print = useMutation({ mutationFn: () => dataClient.deposits.printReceipt(transactionId, locale), onSuccess: () => setDone(t('dep.printed')), onError: (e) => setError(errorMessage(e, t('dep.receiptError'))) })
  const download = useMutation({ mutationFn: () => dataClient.deposits.downloadReceipt(transactionId, locale), onSuccess: (r) => { if (r.saved) setDone(t('dep.saved')) }, onError: (e) => setError(errorMessage(e, t('dep.receiptError'))) })
  const send = useMutation({
    mutationFn: (channel: 'whatsapp' | 'email') => dataClient.deposits.sendReceipt(transactionId, channel, locale, { recipient: channel === 'whatsapp' ? { phone: phone.trim() } : { email: email.trim() } }),
    onSuccess: () => { setDone(t('dep.receiptShared')); setMode('menu') },
    onError: (e) => setError(errorMessage(e, t('dep.receiptError'))),
  })
  const submitSend = () => {
    if (mode === 'whatsapp' && !isValidPhone(phone.trim())) return setError(t('dep.invalidPhone'))
    if (mode === 'email' && !EMAIL_RE.test(email.trim())) return setError(t('dep.invalidEmail'))
    setError(null)
    send.mutate(mode as 'whatsapp' | 'email')
  }

  return (
    <div className="pay-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="pay-modal" style={{ width: 400 }}>
        <div className="pm-head"><h3>{t('dep.shareReceipt')}</h3><button type="button" className="x" onClick={onClose}>{I.x}</button></div>
        <div className="pm-body">
          {customerName ? <p className="hint" style={{ marginBottom: 12 }}>{customerName}</p> : null}
          {mode === 'menu' ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <Button type="button" variant="soft" loading={print.isPending} onClick={() => { setError(null); setDone(null); print.mutate() }}>{t('dep.print')}</Button>
              <Button type="button" variant="soft" loading={download.isPending} onClick={() => { setError(null); setDone(null); download.mutate() }}>{t('dep.downloadPdf')}</Button>
              <Button type="button" variant="soft" onClick={() => { setError(null); setDone(null); setMode('whatsapp') }}>{t('dep.sendWhatsapp')}</Button>
              <Button type="button" variant="soft" onClick={() => { setError(null); setDone(null); setMode('email') }}>{t('dep.sendEmail')}</Button>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); submitSend() }}>
              <div className="ff" style={{ marginBottom: 12 }}>
                <label className="lbl2">{mode === 'whatsapp' ? t('dep.phone') : t('dep.email')}</label>
                {mode === 'whatsapp'
                  ? <PhoneInput value={phone} onChange={(v) => setPhone(v ?? '')} />
                  : <Input value={email} type="email" placeholder="name@example.com" onChange={(e) => setEmail(e.target.value)} />}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button type="button" variant="soft" onClick={() => { setError(null); setMode('menu') }} disabled={send.isPending}>{t('dep.back')}</Button>
                <Button type="submit" variant="primary" loading={send.isPending}>{t('dep.send')}</Button>
              </div>
            </form>
          )}
          {done ? <p style={{ color: 'var(--success)', fontSize: 12.5, marginTop: 10 }}>{done}</p> : null}
          {error ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }} role="alert">{error}</p> : null}
        </div>
      </div>
    </div>
  )
}

// --- helpers ---------------------------------------------------------------
function statusLabel(t: ReturnType<typeof useT>, d: CustomerDeposit): string {
  if (d.status === 'OPEN') return t('dep.open')
  switch (d.outcome) {
    case 'COLLECTED': return t('dep.outcomeCollected')
    case 'COLLECTED_REFUNDED': return t('dep.outcomeCollectedRefunded')
    case 'COLLECTED_TRANSFERRED': return t('dep.outcomeCollectedTransferred')
    case 'REFUNDED': return t('dep.outcomeRefunded')
    default: return t('dep.closed')
  }
}
function txLabel(t: ReturnType<typeof useT>, type: string): string {
  switch (type) {
    case 'deposit': return t('dep.txDeposit')
    case 'refund': return t('dep.txRefund')
    case 'sale': return t('dep.txSale')
    case 'voided_sale': return t('dep.txVoided')
    case 'transfer_in': return t('dep.txTransferIn')
    case 'transfer_out': return t('dep.txTransferOut')
    default: return type
  }
}
function payLabel(t: ReturnType<typeof useT>, method: string | null): string {
  switch (method) {
    case 'CASH': return t('sell.cash')
    case 'MTN_MOMO': return t('sell.momo')
    case 'ORANGE_MONEY': return t('sell.om')
    case 'CARD': return t('sell.card')
    case 'SAVINGS': return t('sell.deposit')
    default: return method || '—'
  }
}
function formatDay(iso: string, locale: string): string {
  try { return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) } catch { return iso }
}
function formatDateTime(iso: string, locale: string): string {
  try { return new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) } catch { return iso }
}
