import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, CommandSelect, Input, Select } from '@biztrack/ui/biztrack'
import { dataClient, isElectron } from '@/lib/data-client'
import { useCurrency } from '@/lib/currency'
import { useLangStore, useT } from '@/i18n'
import { errorMessage } from '@/lib/error'
import { FileUpload } from '@/components/FileUpload'
import { FieldError } from '@/components/FieldError'
import { expenseSchema, type ExpenseFieldErrors } from '@/lib/schemas'
import type { MessageKey } from '@/i18n/messages'
import type { ExpenseCategorySlice, ExpenseInput, ExpensesListQuery, LocalExpense, LocalExpenseCategory } from '@shared/ipc'

const PAGE = 10
type Period = 'week' | 'month' | 'year'

// Payment methods offered for expenses (no Deposit/Savings — that's a customer tender).
const PAY_METHODS = ['CASH', 'MTN_MOMO', 'ORANGE_MONEY', 'CARD'] as const
const CAT_COLORS = ['#16467A', '#2F7D4F', '#B0772E', '#C0473F', '#1E5DA8', '#8A93A1', '#6D4Aed', '#0E8A8A']

const I = {
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M5 12h14" /></svg>,
  search: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="9" cy="9" r="6" /><path d="m14 14 3 3" /></svg>,
  trash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>,
}

function ymd(d: Date): string { return d.toLocaleDateString('en-CA') }
function rangeFor(period: Period): { dateFrom: string; dateTo: string } {
  const now = new Date()
  const to = ymd(now)
  if (period === 'week') { const f = new Date(now); f.setDate(now.getDate() - 6); return { dateFrom: ymd(f), dateTo: to } }
  if (period === 'year') return { dateFrom: ymd(new Date(now.getFullYear(), 0, 1)), dateTo: to }
  return { dateFrom: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), dateTo: to } // month
}

function donutGradient(slices: ExpenseCategorySlice[]): string {
  if (slices.length === 0) return 'var(--inset)'
  let acc = 0
  const stops: string[] = []
  for (const s of slices) {
    const start = acc
    acc = Math.min(100, acc + s.percentage)
    stops.push(`${s.color} ${start}% ${acc}%`)
  }
  if (acc < 100) stops.push(`var(--inset) ${acc}% 100%`)
  return `conic-gradient(${stops.join(', ')})`
}

export function Expenses() {
  const t = useT()
  const money = useCurrency()
  const lang = useLangStore((s) => s.lang)
  const qc = useQueryClient()

  const [period, setPeriod] = useState<Period>('month')
  const [category, setCategory] = useState<string>('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<LocalExpense | null>(null)

  const range = useMemo(() => rangeFor(period), [period])
  const filters = useMemo<ExpensesListQuery>(() => ({ ...range, categoryId: category || undefined, search: search.trim() || undefined }), [range, category, search])
  useEffect(() => { setPage(1) }, [period, category, search])

  const { data: cats = [] } = useQuery({ queryKey: ['expense-categories'], queryFn: () => dataClient.expenseCategories.listAll(), enabled: isElectron })
  const summary = useQuery({ queryKey: ['expenses', 'summary', range, category, search], queryFn: () => dataClient.expenses.summary(filters), enabled: isElectron })
  const trend = useQuery({ queryKey: ['expenses', 'trend'], queryFn: () => dataClient.expenses.trend(), enabled: isElectron })
  const list = useQuery({ queryKey: ['expenses', 'list', range, category, search, page], queryFn: () => dataClient.expenses.list({ ...filters, page, limit: PAGE }), enabled: isElectron })
  const rows = list.data?.data ?? []

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['expenses'] })
    void qc.invalidateQueries({ queryKey: ['expense-categories'] })
  }
  const [markPaidExpense, setMarkPaidExpense] = useState<LocalExpense | null>(null)

  const s = summary.data
  const trendItems = trend.data ?? []
  const maxTrend = Math.max(1, ...trendItems.map((x) => x.total))
  const thisMonth = trendItems[trendItems.length - 1]?.total ?? 0
  const lastMonth = trendItems[trendItems.length - 2]?.total ?? 0
  const avg6 = trendItems.length ? Math.round(trendItems.reduce((a, x) => a + x.total, 0) / trendItems.length) : 0
  const change = thisMonth - lastMonth

  // Compact number WITHOUT the currency symbol (money.compact appends it).
  const compactNum = (n: number): string => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}K` : money.plain(n))

  return (
    <div className="frame">
      <div className="page-head">
        <div>
          <h1>{t('expenses.title')}</h1>
          <p>{t('expenses.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="seg2">
            {(['week', 'month', 'year'] as Period[]).map((p) => (
              <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}>{t(`expenses.${p}` as Parameters<typeof t>[0])}</button>
            ))}
          </span>
          <Button variant="primary" onClick={() => { setEditing(null); setFormOpen(true) }}>{I.plus}{t('expenses.add')}</Button>
        </div>
      </div>

      <div className="minihead">
        <div className="m">
          <div className="k">{t('expenses.kpiTotal')}{s && s.changePct !== 0 ? <span className={`badge ${s.changePct > 0 ? 'b-down' : 'b-up'}`}>{s.changePct > 0 ? '▲' : '▼'} {Math.abs(s.changePct).toFixed(1)}%</span> : null}</div>
          <div className="v">{money.compact(s?.total ?? 0)}</div>
          <div className="h">{t('expenses.kpiTotalHint').replace('{prev}', money.compact(s?.previousTotal ?? 0))}</div>
        </div>
        <div className="m">
          <div className="k">{t('expenses.kpiLargest')}</div>
          <div className="v" style={{ fontSize: 17 }}>{s?.largest ? `${s.largest.name} · ${compactNum(s.largest.amount)}` : '—'}</div>
          <div className="h">{s?.largest ? t('expenses.kpiLargestHint').replace('{pct}', String(s.largest.percentage)) : ' '}</div>
        </div>
        <div className="m">
          <div className="k">{t('expenses.kpiAvg')}</div>
          <div className="v">{money.format(s?.avgPerDay ?? 0)}</div>
          <div className="h">{t('expenses.kpiAvgHint')}</div>
        </div>
        <div className="m">
          <div className="k">{t('expenses.kpiPending')}{s && s.pendingCount > 0 ? <span className="badge b-warn">{s.pendingCount}</span> : null}</div>
          <div className="v">{money.compact(s?.pendingAmount ?? 0)}</div>
          <div className="h">{t('expenses.kpiPendingHint').replace('{n}', String(s?.pendingCount ?? 0))}</div>
        </div>
      </div>

      <div className="split mb20" style={{ alignItems: 'stretch' }}>
        <div className="card">
          <div className="card-h"><div><h3>{t('expenses.byCategory')}</h3><p>{t('expenses.byCategorySub')}</p></div></div>
          <div className="donut-wrap">
            <div className="donut" style={{ background: donutGradient(s?.byCategory ?? []) }}>
              <div className="ctr"><div><div className="b">{compactNum(s?.total ?? 0)}</div><div className="s">{money.symbol}</div></div></div>
            </div>
            <div className="cat-legend">
              {(s?.byCategory ?? []).slice(0, 6).map((c) => (
                <div key={c.categoryId} className="cl">
                  <span className="sw" style={{ background: c.color }} />
                  <span className="nm">{c.name}</span>
                  <span className="pct">{c.percentage}%</span>
                  <span className="amt">{money.format(c.amount)}</span>
                </div>
              ))}
              {(s?.byCategory ?? []).length === 0 ? <div className="hint">{t('expenses.noData')}</div> : null}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><div><h3>{t('expenses.trend')}</h3><p>{t('expenses.trendSub')}</p></div></div>
          <div className="bars">
            {trendItems.map((m) => (
              <div key={`${m.year}-${m.month}`} className="bar-col">
                <div className="bar-pair"><div className="bar cur" style={{ height: `${Math.max(3, Math.round((m.total / maxTrend) * 100))}%` }} /></div>
                <div className="bar-lab">{m.label}</div>
              </div>
            ))}
          </div>
          <div className="stat-row">
            <div className="well"><div className="k">{t('expenses.thisMonth')}</div><div className="v">{money.format(thisMonth)}</div></div>
            <div className="well"><div className="k">{t('expenses.avg6')}</div><div className="v">{money.format(avg6)}</div></div>
            <div className="well"><div className="k">{t('expenses.vsLast')}</div><div className="v" style={{ color: change > 0 ? 'var(--danger)' : 'var(--success)' }}>{change >= 0 ? '+' : '−'}{money.format(Math.abs(change))}</div></div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>{t('expenses.ledger')}</h3>
          <div style={{ flex: 1 }} />
          <div className="select-wrap" style={{ width: 180 }}>
            <select className="select" style={{ height: 36 }} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">{t('expenses.allCategories')}</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ width: 200 }}>
            {I.search}
            <input className="input ic" style={{ height: 36 }} placeholder={t('expenses.searchPh')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="saletable-wrap">
          <table className="saletable">
            <thead>
              <tr>
                <th>{t('expenses.colDate')}</th>
                <th>{t('expenses.colDesc')}</th>
                <th className="hide-sm">{t('expenses.colCategory')}</th>
                <th className="hide-sm">{t('expenses.colPaidTo')}</th>
                <th className="hide-sm">{t('expenses.colMethod')}</th>
                <th className="right">{t('expenses.colAmount')}</th>
                <th>{t('expenses.colStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} onClick={() => { setEditing(e); setFormOpen(true) }}>
                  <td className="num">{formatDay(e.expenseDate, lang)}</td>
                  <td style={{ fontWeight: 550 }}>{e.description}</td>
                  <td className="hide-sm">{e.categoryName ? <span className="chip-tag" style={categoryChipStyle(e.categoryColor)}>{e.categoryName}</span> : '—'}</td>
                  <td className="hide-sm">{e.vendor || '—'}</td>
                  <td className="hide-sm"><span className="pill-tag">{payLabel(t, e.paymentMethod)}</span></td>
                  <td className="right num">{money.format(e.amount)}</td>
                  <td>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span className={`st ${e.status === 'PENDING' ? 'st-low' : 'st-ok'}`}><span className="d" />{e.status === 'PENDING' ? t('expenses.pending') : t('expenses.paid')}</span>
                      {e.status === 'PENDING' ? (
                        <button type="button" className="markpaid-btn" onClick={(ev) => { ev.stopPropagation(); setMarkPaidExpense(e) }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}><path d="m5 12 5 5L20 7" /></svg>
                          {t('expenses.markPaid')}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!list.isPending && rows.length === 0 ? <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 12px' }}>{t('expenses.empty')}</td></tr> : null}
              {list.isPending && rows.length === 0 ? <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 12px' }}>{t('expenses.loading')}</td></tr> : null}
            </tbody>
          </table>
        </div>

        <div className="panel-foot">
          <span>{t('expenses.foot').replace('{shown}', String(rows.length)).replace('{total}', String(list.data?.total ?? 0))}</span>
          <div className="spacer" style={{ flex: 1 }} />
          <span className="link" aria-disabled={page <= 1} onClick={() => { if (page > 1) setPage((p) => p - 1) }}>{t('expenses.prev')}</span>
          <span>{t('expenses.page').replace('{p}', String(list.data?.page ?? 1)).replace('{t}', String(list.data?.totalPages ?? 1))}</span>
          <span className="link" aria-disabled={(list.data?.page ?? 1) >= (list.data?.totalPages ?? 1)} onClick={() => { if ((list.data?.page ?? 1) < (list.data?.totalPages ?? 1)) setPage((p) => p + 1) }}>{t('expenses.next')}</span>
          <span style={{ marginLeft: 12 }}>{t('expenses.totalLabel').replace('{amt}', money.format(list.data?.totalAmount ?? 0))}</span>
        </div>
      </div>

      {formOpen ? (
        <ExpenseFormModal
          expense={editing}
          categories={cats}
          t={t}
          onClose={() => setFormOpen(false)}
          onSaved={() => { refresh(); setFormOpen(false) }}
        />
      ) : null}

      {markPaidExpense ? (
        <MarkPaidDialog
          expense={markPaidExpense}
          t={t}
          onClose={() => setMarkPaidExpense(null)}
          onSaved={() => { refresh(); setMarkPaidExpense(null) }}
        />
      ) : null}
    </div>
  )
}

// --- mark-paid dialog (requires a payment method) --------------------------
function MarkPaidDialog({ expense, t, onClose, onSaved }: {
  expense: LocalExpense
  t: ReturnType<typeof useT>
  onClose: () => void
  onSaved: () => void
}) {
  const money = useCurrency()
  const [method, setMethod] = useState('CASH')
  const [error, setError] = useState<string | null>(null)
  const run = useMutation({
    mutationFn: () => dataClient.expenses.setStatus(expense.id, 'PAID', method),
    onSuccess: onSaved,
    onError: (e) => setError(errorMessage(e, t('expenses.saveError'))),
  })
  return (
    <div className="pay-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="pay-modal" style={{ width: 380 }}>
        <div className="pm-head">
          <h3>{t('expenses.markPaidTitle')}</h3>
          <button type="button" className="x" onClick={onClose}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6 6 18" /></svg></button>
        </div>
        <form className="pm-body" onSubmit={(e) => { e.preventDefault(); run.mutate() }}>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14 }}>
            {t('expenses.markPaidBody').replace('{desc}', expense.description).replace('{amt}', money.format(expense.amount))}
          </p>
          <div className="ff" style={{ marginBottom: 8 }}>
            <label className="lbl2">{t('expenses.fMethod')}</label>
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAY_METHODS.map((m) => <option key={m} value={m}>{payLabel(t, m)}</option>)}
            </Select>
          </div>
          {error ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 8 }} role="alert">{error}</p> : null}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <Button type="button" variant="soft" onClick={onClose} disabled={run.isPending}>{t('expenses.cancel')}</Button>
            <Button type="submit" variant="primary" loading={run.isPending}>{t('expenses.markPaid')}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// --- add / edit modal ------------------------------------------------------
function ExpenseFormModal({ expense, categories, t, onClose, onSaved }: {
  expense: LocalExpense | null
  categories: LocalExpenseCategory[]
  t: ReturnType<typeof useT>
  onClose: () => void
  onSaved: () => void
}) {
  const editing = !!expense
  const [categoryId, setCategoryId] = useState(expense?.categoryId ?? categories[0]?.id ?? '')
  const [description, setDescription] = useState(expense?.description ?? '')
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '')
  const [expenseDate, setExpenseDate] = useState(expense?.expenseDate ?? new Date().toLocaleDateString('en-CA'))
  const [vendor, setVendor] = useState(expense?.vendor ?? '')
  const [method, setMethod] = useState(expense?.paymentMethod ?? 'CASH')
  const [status, setStatus] = useState(expense?.status ?? 'PAID')
  const [notes, setNotes] = useState(expense?.notes ?? '')
  const [isRecurring, setIsRecurring] = useState(expense?.isRecurring ?? false)
  const [receiptUrl, setReceiptUrl] = useState<string | null>(expense?.receiptUrl ?? null)
  const [newCat, setNewCat] = useState<{ name: string; color: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<ExpenseFieldErrors>({})

  const selectedCatName = categories.find((c) => c.id === categoryId)?.name ?? ''
  const loadCatOptions = async (q: string) => {
    const s = q.trim().toLowerCase()
    return categories
      .filter((c) => !s || c.name.toLowerCase().includes(s))
      .map((c) => ({ value: c.id, label: c.name, sublabel: c.isSystem ? t('expenses.systemCat') : `${c.expenseCount ?? 0}` }))
  }

  const createCat = useMutation({
    mutationFn: () => dataClient.expenseCategories.create({ name: newCat!.name.trim(), color: newCat!.color }),
    onSuccess: (c) => { categories.push(c); setCategoryId(c.id); setNewCat(null) },
    onError: (e) => setError(errorMessage(e, t('expenses.saveError'))),
  })

  const buildInput = (): ExpenseInput => ({
    categoryId,
    description: description.trim(),
    amount: Number(amount.replace(/\s/g, '').replace(',', '.')) || 0,
    expenseDate,
    vendor: vendor.trim() || null,
    notes: notes.trim() || null,
    isRecurring,
    status,
    paymentMethod: status === 'PENDING' ? null : method,
    receiptUrl,
  })
  const save = useMutation({
    mutationFn: () => (editing ? dataClient.expenses.update(expense!.id, buildInput()) : dataClient.expenses.create(buildInput())),
    onSuccess: onSaved,
    onError: (e) => setError(errorMessage(e, t('expenses.saveError'))),
  })
  const remove = useMutation({
    mutationFn: () => dataClient.expenses.remove(expense!.id),
    onSuccess: onSaved,
    onError: (e) => setError(errorMessage(e, t('expenses.saveError'))),
  })

  const submit = () => {
    const amt = Number(amount.replace(/\s/g, '').replace(',', '.'))
    const parsed = expenseSchema.safeParse({ categoryId, description, amount: Number.isFinite(amt) ? amt : NaN, expenseDate })
    if (!parsed.success) {
      const f = parsed.error.flatten().fieldErrors
      setFieldErrors({ categoryId: f.categoryId?.[0], description: f.description?.[0], amount: f.amount?.[0], expenseDate: f.expenseDate?.[0] })
      return
    }
    setFieldErrors({})
    setError(null)
    save.mutate()
  }
  const fe = (k: keyof ExpenseFieldErrors): ReactNode => (fieldErrors[k] ? <FieldError message={t(fieldErrors[k] as MessageKey)} /> : null)

  return (
    <div className="pay-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="pay-modal" style={{ width: 480 }}>
        <div className="pm-head">
          <h3>{editing ? t('expenses.editTitle') : t('expenses.add')}</h3>
          <button type="button" className="x" onClick={onClose}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6 6 18" /></svg></button>
        </div>
        <form className="pm-body" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <div className="ff" style={{ marginBottom: 12 }}>
            <label className="lbl2">{t('expenses.fCategory')}</label>
            {newCat ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="color"
                  className="opt-color"
                  value={newCat.color}
                  aria-label={t('expenses.catColor')}
                  onChange={(e) => setNewCat({ ...newCat, color: e.target.value })}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Input value={newCat.name} placeholder={t('expenses.newCatPh')}
                    onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newCat.name.trim()) createCat.mutate() } }} />
                </div>
                <Button type="button" variant="primary" loading={createCat.isPending} disabled={!newCat.name.trim()} onClick={() => createCat.mutate()}>{t('expenses.addCat')}</Button>
                <Button type="button" variant="soft" onClick={() => setNewCat(null)}>{t('expenses.cancel')}</Button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <CommandSelect
                    value={categoryId || null}
                    valueLabel={selectedCatName}
                    onChange={(id) => { setCategoryId(id ?? ''); setFieldErrors((x) => ({ ...x, categoryId: undefined })) }}
                    loadOptions={loadCatOptions}
                    placeholder={t('expenses.pickCategory')}
                    searchPlaceholder={t('expenses.searchCat')}
                  />
                </div>
                <Button type="button" variant="soft" onClick={() => setNewCat({ name: '', color: CAT_COLORS[0]! })} title={t('expenses.newCategory')}>{I.plus}</Button>
              </div>
            )}
            {fe('categoryId')}
          </div>
          <div className="ff" style={{ marginBottom: 12 }}>
            <label className="lbl2">{t('expenses.fDesc')}</label>
            <Input value={description} error={!!fieldErrors.description} placeholder={t('expenses.descPh')} onChange={(e) => { setDescription(e.target.value); setFieldErrors((x) => ({ ...x, description: undefined })) }} />
            {fe('description')}
          </div>
          <div className="form-2col">
            <div className="ff" style={{ marginBottom: 12 }}>
              <label className="lbl2">{t('expenses.fAmount')}</label>
              <Input value={amount} error={!!fieldErrors.amount} inputMode="decimal" placeholder="0" onChange={(e) => { setAmount(e.target.value); setFieldErrors((x) => ({ ...x, amount: undefined })) }} />
              {fe('amount')}
            </div>
            <div className="ff" style={{ marginBottom: 12 }}>
              <label className="lbl2">{t('expenses.fDate')}</label>
              <Input type="date" value={expenseDate} error={!!fieldErrors.expenseDate} onChange={(e) => { setExpenseDate(e.target.value); setFieldErrors((x) => ({ ...x, expenseDate: undefined })) }} />
              {fe('expenseDate')}
            </div>
          </div>
          <div className="ff" style={{ marginBottom: 12 }}>
            <label className="lbl2">{t('expenses.fPaidTo')}</label>
            <Input value={vendor} placeholder={t('expenses.paidToPh')} onChange={(e) => setVendor(e.target.value)} />
          </div>
          <div className="form-2col">
            <div className="ff" style={{ marginBottom: 12 }}>
              <label className="lbl2">{t('expenses.fStatus')}</label>
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="PAID">{t('expenses.paid')}</option>
                <option value="PENDING">{t('expenses.pending')}</option>
              </Select>
            </div>
            <div className="ff" style={{ marginBottom: 12 }}>
              <label className="lbl2">{t('expenses.fMethod')}</label>
              {status === 'PENDING' ? (
                <div className="fv" style={{ paddingTop: 9, color: 'var(--text-muted)', fontSize: 12.5 }}>{t('expenses.noMethodPending')}</div>
              ) : (
                <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                  {PAY_METHODS.map((m) => <option key={m} value={m}>{payLabel(t, m)}</option>)}
                </Select>
              )}
            </div>
          </div>
          <div className="ff" style={{ marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13.5 }}>
              <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} style={{ width: 16, height: 16 }} />
              <span style={{ fontWeight: 600 }}>{t('expenses.recurring')}</span>
              <small style={{ color: 'var(--text-muted)' }}>{t('expenses.recurringHint')}</small>
            </label>
          </div>
          <div className="ff" style={{ marginBottom: 12 }}>
            <label className="lbl2">{t('expenses.fNotes')}</label>
            <textarea className="ta" rows={2} value={notes} placeholder={t('expenses.notesPh')} onChange={(e) => setNotes(e.target.value)} style={{ width: '100%', resize: 'vertical' }} />
          </div>
          <div className="ff">
            <label className="lbl2">{t('expenses.fReceipt')}</label>
            <FileUpload value={receiptUrl} onChange={setReceiptUrl} folder="receipts" variant="image" hint={t('expenses.receiptHint')} />
          </div>

          {error ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }} role="alert">{error}</p> : null}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
            {editing ? (
              <Button type="button" variant="soft" onClick={() => remove.mutate()} loading={remove.isPending} style={{ color: 'var(--danger)' }}>{I.trash}{t('expenses.delete')}</Button>
            ) : <span />}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button type="button" variant="soft" onClick={onClose} disabled={save.isPending}>{t('expenses.cancel')}</Button>
              <Button type="submit" variant="primary" loading={save.isPending}>{editing ? t('expenses.save') : t('expenses.add')}</Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// --- helpers ---------------------------------------------------------------
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
  try { return new Date(iso + 'T00:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short' }) } catch { return iso }
}
function categoryChipStyle(color: string | null): CSSProperties | undefined {
  if (!color || color.startsWith('var(')) return undefined
  return { background: `color-mix(in srgb, ${color} 16%, transparent)`, color }
}
