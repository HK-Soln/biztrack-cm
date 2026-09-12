import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, CommandSelect, Input, Select } from '@biztrack/ui/biztrack'
import { dataClient } from '@/lib/data-client'
import { useCurrency } from '@/lib/currency'
import { useLangStore, useT } from '@/i18n'
import { useBreakpoint } from '@/lib/useBreakpoint'
import { errorMessage } from '@/lib/error'
import { GeneralLinkDialog } from '@/components/payments/GeneralLinkDialog'
import type { MessageKey } from '@/i18n/messages'
import type {
  LocalIncomeCategory,
  LocalOtherIncome,
  OtherIncomeInput,
  OtherIncomeListQuery,
} from '@shared/ipc'

const PAGE = 10
type Period = 'week' | 'month' | 'year'
const PAY_METHODS = ['CASH', 'MTN_MOMO', 'ORANGE_MONEY', 'CARD'] as const
const CAT_COLORS = ['#0EA5E9', '#2F7D4F', '#B0772E', '#8B5CF6', '#1E5DA8', '#64748B', '#0E8A8A', '#C0473F']

const I = {
  plus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  link: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}>
      <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="9" cy="9" r="6" />
      <path d="m14 14 3 3" />
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </svg>
  ),
  back: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  ),
}

const SOURCE_STYLE: Record<string, { bg: string; fg: string }> = {
  MANUAL: { bg: 'var(--inset)', fg: 'var(--text-2)' },
  PAYMENT_LINK: { bg: 'var(--brand-soft, #eaf0f7)', fg: 'var(--brand)' },
  DEPOSIT_CHARGE: { bg: 'color-mix(in srgb, #8B5CF6 16%, transparent)', fg: '#8B5CF6' },
}

function ymd(d: Date): string {
  return d.toLocaleDateString('en-CA')
}
function rangeFor(period: Period): { dateFrom: string; dateTo: string } {
  const now = new Date()
  const to = ymd(now)
  const from = new Date(now)
  if (period === 'week') from.setDate(now.getDate() - 6)
  else if (period === 'month') from.setDate(now.getDate() - 29)
  else from.setFullYear(now.getFullYear() - 1)
  return { dateFrom: ymd(from), dateTo: to }
}
function formatDay(iso: string, locale: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
}
function categoryChipStyle(color: string | null): CSSProperties | undefined {
  if (!color || color.startsWith('var(')) return undefined
  return { background: `color-mix(in srgb, ${color} 16%, transparent)`, color }
}

/**
 * Spec 10 ① — Other Income: non-trading income (delivery fees via payment links, deposit-cancellation
 * charges, manual entries). Sibling of the Expenses page. Manual entries are offline-capable + editable;
 * PAYMENT_LINK / DEPOSIT_CHARGE rows are server-booked and read-only.
 */
export function OtherIncome() {
  const t = useT()
  const nav = useNavigate()
  const money = useCurrency()
  const lang = useLangStore((s) => s.lang)
  const qc = useQueryClient()
  const bp = useBreakpoint()

  const [period, setPeriod] = useState<Period>('month')
  const [category, setCategory] = useState('')
  const [source, setSource] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<LocalOtherIncome | null>(null)
  const [genLinkOpen, setGenLinkOpen] = useState(false)

  const range = useMemo(() => rangeFor(period), [period])
  const filters: OtherIncomeListQuery = useMemo(
    () => ({ ...range, categoryId: category || undefined, source: source || undefined, search: search || undefined }),
    [range, category, source, search],
  )

  useEffect(() => setPage(1), [period, category, source, search])

  const catsQ = useQuery({ queryKey: ['incomeCategories'], queryFn: () => dataClient.incomeCategories.listAll() })
  const summaryQ = useQuery({ queryKey: ['income', 'summary', filters], queryFn: () => dataClient.income.summary(filters) })
  const listQ = useQuery({
    queryKey: ['income', 'list', filters, page],
    queryFn: () => dataClient.income.list({ ...filters, page, limit: PAGE }),
  })
  // Owner-only + online: surfaces whether a provider is routed (hides the generate button otherwise).
  const routesQ = useQuery({
    queryKey: ['payments', 'routes'],
    queryFn: () => dataClient.payments.listRoutes(),
    retry: false,
  })
  const canGenerateLink = (routesQ.data ?? []).length > 0

  const cats = catsQ.data ?? []
  const s = summaryQ.data
  const rows = listQ.data?.data ?? []
  const total = listQ.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE))

  const removeMut = useMutation({
    mutationFn: (id: string) => dataClient.income.remove(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['income'] }),
  })

  const openEdit = (row: LocalOtherIncome) => {
    setEditing(row)
    setFormOpen(true)
  }
  const openAdd = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const modals = (
    <>
      {formOpen ? (
        <IncomeFormModal
          editing={editing}
          categories={cats}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false)
            void qc.invalidateQueries({ queryKey: ['income'] })
            void qc.invalidateQueries({ queryKey: ['incomeCategories'] })
          }}
          onDelete={(id) => {
            setFormOpen(false)
            removeMut.mutate(id)
          }}
        />
      ) : null}
      <GeneralLinkDialog
        open={genLinkOpen}
        onClose={() => {
          setGenLinkOpen(false)
          void qc.invalidateQueries({ queryKey: ['income'] })
        }}
      />
    </>
  )

  // ---------- Mobile ----------
  if (bp === 'mobile') {
    return (
      <div className="frame">
        <div className="m-head">
          <button type="button" className="back" onClick={() => nav('/more')} aria-label={t('common.back')}>
            {I.back}
          </button>
          <div>
            <div className="m-title">{t('income.title')}</div>
            <div className="m-sub">{t('income.subtitle')}</div>
          </div>
        </div>
        <div className="minihead" style={{ marginTop: 12 }}>
          <div className="m">
            <div className="k">{t('income.kpiTotal')}</div>
            <div className="v">{money.compact(s?.total ?? 0)}</div>
          </div>
          <div className="m">
            <div className="k">{t('income.kpiFromLinks')}</div>
            <div className="v">{money.compact(s?.fromLinks ?? 0)}</div>
          </div>
        </div>
        <div className="mlist" style={{ marginTop: 12 }}>
          {rows.length === 0 ? (
            <div style={{ padding: '28px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {listQ.isPending ? t('income.loading') : t('income.empty')}
            </div>
          ) : (
            rows.map((r) => (
              <button type="button" className="mrow" key={r.id} onClick={() => openEdit(r)}>
                <div className="mt">
                  <div className="nm">{r.description}</div>
                  <div className="sub">
                    {r.categoryName ?? '—'} · {formatDay(r.date, lang)}
                  </div>
                </div>
                <div className="rt" style={{ color: 'var(--success)', fontWeight: 650 }}>
                  {money.format(r.amount)}
                </div>
              </button>
            ))
          )}
        </div>
        <button type="button" className="mfab" onClick={openAdd} aria-label={t('income.add')}>
          {I.plus}
        </button>
        {modals}
      </div>
    )
  }

  // ---------- Desktop / tablet ----------
  return (
    <div className="frame">
      <div className="page-head">
        <div>
          <h1>{t('income.title')}</h1>
          <p>{t('income.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="seg2">
            {(['week', 'month', 'year'] as Period[]).map((p) => (
              <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}>
                {t(`income.${p}` as MessageKey)}
              </button>
            ))}
          </span>
          {canGenerateLink ? (
            <Button variant="soft" onClick={() => setGenLinkOpen(true)}>
              {I.link}
              {t('income.generateLink')}
            </Button>
          ) : null}
          <Button variant="primary" onClick={openAdd}>
            {I.plus}
            {t('income.add')}
          </Button>
        </div>
      </div>

      <div className="minihead">
        <div className="m">
          <div className="k">
            {t('income.kpiTotal')}
            {s && s.changePct !== 0 ? (
              <span className={`badge ${s.changePct > 0 ? 'b-up' : 'b-down'}`}>
                {s.changePct > 0 ? '▲' : '▼'} {Math.abs(s.changePct).toFixed(1)}%
              </span>
            ) : null}
          </div>
          <div className="v">{money.compact(s?.total ?? 0)}</div>
          <div className="h">{t('income.kpiTotalHint').replace('{prev}', money.compact(s?.previousTotal ?? 0))}</div>
        </div>
        <div className="m">
          <div className="k">{t('income.kpiTop')}</div>
          <div className="v" style={{ fontSize: 16 }}>
            {s?.largest ? s.largest.name : '—'}
          </div>
          <div className="h">{s?.largest ? `${s.largest.percentage}% · ${money.compact(s.largest.amount)}` : ''}</div>
        </div>
        <div className="m">
          <div className="k">{t('income.kpiAvg')}</div>
          <div className="v">{money.compact(s?.avgPerDay ?? 0)}</div>
          <div className="h">{t('income.kpiAvgHint')}</div>
        </div>
        <div className="m">
          <div className="k">{t('income.kpiFromLinks')}</div>
          <div className="v">{money.compact(s?.fromLinks ?? 0)}</div>
          <div className="h">{t('income.kpiFromLinksHint')}</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>{t('income.ledger')}</h3>
          <div style={{ flex: 1 }} />
          <div className="select-wrap" style={{ width: 160 }}>
            <select className="select" style={{ height: 36 }} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">{t('income.allCategories')}</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="select-wrap" style={{ width: 150 }}>
            <select className="select" style={{ height: 36 }} value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">{t('income.allSources')}</option>
              <option value="MANUAL">{t('income.sourceMANUAL')}</option>
              <option value="PAYMENT_LINK">{t('income.sourcePAYMENT_LINK')}</option>
              <option value="DEPOSIT_CHARGE">{t('income.sourceDEPOSIT_CHARGE')}</option>
            </select>
          </div>
          <div className="field" style={{ width: 190 }}>
            {I.search}
            <input
              className="input ic"
              style={{ height: 36 }}
              placeholder={t('income.searchPh')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="saletable-wrap">
          <table className="saletable">
            <thead>
              <tr>
                <th>{t('income.colDate')}</th>
                <th>{t('income.colDesc')}</th>
                <th className="hide-sm">{t('income.colCategory')}</th>
                <th className="hide-sm">{t('income.colSource')}</th>
                <th className="hide-sm">{t('income.colMethod')}</th>
                <th className="hide-sm">{t('income.colReference')}</th>
                <th className="right">{t('income.colAmount')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !listQ.isPending ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 12px' }}>
                    {t('income.empty')}
                  </td>
                </tr>
              ) : null}
              {rows.length === 0 && listQ.isPending ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 12px' }}>
                    {t('income.loading')}
                  </td>
                </tr>
              ) : null}
              {rows.map((r) => {
                const ss = SOURCE_STYLE[r.source] ?? SOURCE_STYLE.MANUAL!
                return (
                  <tr key={r.id} onClick={() => openEdit(r)} style={{ cursor: 'pointer' }}>
                    <td className="num">{formatDay(r.date, lang)}</td>
                    <td className="trunc" style={{ fontWeight: 550 }} title={r.description}>
                      {r.description}
                    </td>
                    <td className="hide-sm">
                      {r.categoryName ? (
                        <span className="chip-tag" style={categoryChipStyle(r.categoryColor)}>
                          {r.categoryName}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="hide-sm">
                      <span className="chip-tag" style={{ background: ss.bg, color: ss.fg }}>
                        {t(`income.source${r.source}` as MessageKey)}
                      </span>
                    </td>
                    <td className="hide-sm">
                      {r.paymentMethod ? <span className="pill-tag">{r.paymentMethod.replace(/_/g, ' ')}</span> : '—'}
                    </td>
                    <td className="hide-sm trunc" title={r.reference || undefined} style={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {r.reference || '—'}
                    </td>
                    <td className="right num" style={{ color: 'var(--success)', fontWeight: 600 }}>
                      {money.format(r.amount)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="panel-foot">
          <span>{t('income.showing').replace('{shown}', String(rows.length)).replace('{total}', String(total))}</span>
          <div style={{ flex: 1 }} />
          <button className="link" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            {t('income.prev')}
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 8px' }}>
            {page} / {totalPages}
          </span>
          <button className="link" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            {t('income.next')}
          </button>
          <div style={{ flex: 1 }} />
          <span style={{ fontWeight: 600 }}>{money.format(listQ.data?.totalAmount ?? 0)}</span>
        </div>
      </div>

      {modals}
    </div>
  )
}

// ---- Add / edit modal --------------------------------------------------------
function IncomeFormModal({
  editing,
  categories,
  onClose,
  onSaved,
  onDelete,
}: {
  editing: LocalOtherIncome | null
  categories: LocalIncomeCategory[]
  onClose: () => void
  onSaved: () => void
  onDelete: (id: string) => void
}) {
  const t = useT()
  const readOnly = !!editing && editing.source !== 'MANUAL'

  const [categoryId, setCategoryId] = useState<string | null>(editing?.categoryId ?? null)
  const [categoryLabel, setCategoryLabel] = useState<string | null>(editing?.categoryName ?? null)
  const [description, setDescription] = useState(editing?.description ?? '')
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [date, setDate] = useState(editing?.date ?? new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState(editing?.paymentMethod ?? '')
  const [note, setNote] = useState(editing?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [addingCat, setAddingCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [saving, setSaving] = useState(false)

  const loadCats = async (q: string) => {
    const s = q.trim().toLowerCase()
    return categories
      .filter((c) => !s || c.name.toLowerCase().includes(s))
      .map((c) => ({ value: c.id, label: c.name }))
  }

  const addCategory = async () => {
    const name = newCatName.trim()
    if (!name) return
    const color = CAT_COLORS[categories.length % CAT_COLORS.length]!
    try {
      const created = await dataClient.incomeCategories.create({ name, color })
      setCategoryId(created.id)
      setCategoryLabel(created.name)
      setAddingCat(false)
      setNewCatName('')
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const save = async () => {
    if (readOnly) return onClose()
    if (!categoryId) return setError(t('income.errCategory'))
    if (!description.trim()) return setError(t('income.errDesc'))
    const amt = Number(amount.replace(/\s/g, '').replace(',', '.')) || 0
    if (!(amt > 0)) return setError(t('income.errAmount'))
    setError(null)
    setSaving(true)
    const input: OtherIncomeInput = {
      categoryId,
      description: description.trim(),
      amount: amt,
      date,
      paymentMethod: method || undefined,
      note: note.trim() || undefined,
    }
    try {
      if (editing) await dataClient.income.update(editing.id, input)
      else await dataClient.income.create(input)
      onSaved()
    } catch (e) {
      setError(errorMessage(e))
      setSaving(false)
    }
  }

  return (
    <div className="pay-overlay open" onMouseDown={onClose}>
      <div className="pay-modal" style={{ width: 480 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="pm-head">
          <span>{editing ? (readOnly ? t('income.viewTitle') : t('income.editTitle')) : t('income.addTitle')}</span>
          <button className="x" onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </div>
        <div className="pm-body">
          {readOnly ? (
            <div className="msg" style={{ marginBottom: 12, fontSize: 12.5, color: 'var(--text-2)' }}>
              {t('income.readOnlyNote')}
            </div>
          ) : null}
          {error ? (
            <div className="msg err" style={{ marginBottom: 12 }}>
              <span>{error}</span>
            </div>
          ) : null}

          <div className="ff">
            <label className="lbl2">{t('income.fCategory')}</label>
            {addingCat ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder={t('income.newCatPh')} />
                <Button variant="primary" onClick={addCategory}>
                  {t('income.addCat')}
                </Button>
                <Button variant="soft" onClick={() => setAddingCat(false)}>
                  {t('common.cancel')}
                </Button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <CommandSelect
                    value={categoryId}
                    valueLabel={categoryLabel}
                    onChange={(v, opt) => {
                      setCategoryId(v)
                      setCategoryLabel(opt?.label ?? null)
                    }}
                    loadOptions={loadCats}
                    placeholder={t('income.pickCategory')}
                    disabled={readOnly}
                  />
                </div>
                {!readOnly ? (
                  <Button variant="soft" onClick={() => setAddingCat(true)} aria-label={t('income.addCat')}>
                    +
                  </Button>
                ) : null}
              </div>
            )}
          </div>

          <div className="ff">
            <label className="lbl2">{t('income.fDesc')}</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} disabled={readOnly} />
          </div>

          <div className="form-2col">
            <div className="ff">
              <label className="lbl2">{t('income.fAmount')}</label>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={readOnly} />
            </div>
            <div className="ff">
              <label className="lbl2">{t('income.fDate')}</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={readOnly} />
            </div>
          </div>

          <div className="ff">
            <label className="lbl2">{t('income.fMethod')}</label>
            <Select value={method} onChange={(e) => setMethod(e.target.value)} disabled={readOnly}>
              <option value="">{t('income.noMethod')}</option>
              {PAY_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </div>

          <div className="ff">
            <label className="lbl2">{t('income.fNote')}</label>
            <textarea className="ta" rows={2} value={note} onChange={(e) => setNote(e.target.value)} disabled={readOnly} />
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '14px 18px',
            borderTop: '1px solid var(--border)',
          }}
        >
          {editing && !readOnly ? (
            <Button variant="soft" style={{ color: 'var(--danger)' }} onClick={() => onDelete(editing.id)}>
              {I.trash}
              {t('income.delete')}
            </Button>
          ) : null}
          <div style={{ flex: 1 }} />
          <Button variant="soft" onClick={onClose}>
            {readOnly ? t('common.close') : t('common.cancel')}
          </Button>
          {!readOnly ? (
            <Button variant="primary" loading={saving} onClick={save}>
              {editing ? t('income.save') : t('income.add')}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
