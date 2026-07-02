// Shared building blocks for the role-based Home dashboards (Owner · Manager ·
// Accountant · Cashier · General). These are layout-agnostic presentational
// pieces + small helpers; the desktop role screens compose them, and the future
// mobile/tablet screens will recompose the same pieces at their own breakpoints.
import { useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCurrency } from '@/lib/currency'
import { useLangStore, useT } from '@/i18n'
import { useSessionStore } from '@/stores/session.store'
import { dataClient } from '@/lib/data-client'
import { SaleDetailDrawer } from '@/components/sales/SaleDetailDrawer'
import type { MessageKey } from '@/i18n/messages'
import type { LocalSale, SyncStatus } from '@shared/ipc'

// ---- roles & periods ------------------------------------------------------
export type RoleKey = 'owner' | 'manager' | 'accountant' | 'cashier' | 'general'
export type Period = 'today' | 'week' | 'month' | 'quarter' | 'year'
export interface Range {
  dateFrom: string
  dateTo: string
}

const ROLE_LABEL: Record<Exclude<RoleKey, 'general'>, MessageKey> = {
  owner: 'home.roleOwner',
  manager: 'home.roleManager',
  accountant: 'home.roleAccountant',
  cashier: 'home.roleCashier',
}
const SUB_KEY: Record<RoleKey, MessageKey> = {
  owner: 'home.subOwner',
  manager: 'home.subManager',
  accountant: 'home.subAccountant',
  cashier: 'home.subCashier',
  general: 'home.subGeneral',
}
const PERIOD_LABEL: Record<Period, MessageKey> = {
  today: 'home.today',
  week: 'home.week',
  month: 'home.month',
  quarter: 'home.quarter',
  year: 'home.year',
}

/** Normalise the free-form session role string to one of our dashboard variants. */
export function roleKeyFor(role: string | null | undefined): RoleKey {
  switch ((role ?? '').trim().toUpperCase()) {
    case 'OWNER':
    case 'ADMIN':
      return 'owner'
    case 'MANAGER':
      return 'manager'
    case 'ACCOUNTANT':
      return 'accountant'
    case 'CASHIER':
      return 'cashier'
    default:
      return 'general'
  }
}

function ymd(d: Date): string {
  return d.toLocaleDateString('en-CA')
}
/** Inclusive date range for a period, anchored on today. */
export function rangeFor(period: Period): Range {
  const now = new Date()
  const to = ymd(now)
  switch (period) {
    case 'today':
      return { dateFrom: to, dateTo: to }
    case 'week': {
      const f = new Date(now)
      f.setDate(now.getDate() - 6)
      return { dateFrom: ymd(f), dateTo: to }
    }
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3) * 3
      return { dateFrom: ymd(new Date(now.getFullYear(), q, 1)), dateTo: to }
    }
    case 'year':
      return { dateFrom: ymd(new Date(now.getFullYear(), 0, 1)), dateTo: to }
    case 'month':
    default:
      return { dateFrom: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), dateTo: to }
  }
}

/**
 * Selected period, persisted in the URL (`?period=…`) so a refresh keeps the
 * label the user picked. Works with the hash router (the query lives inside the
 * hash). Falls back to `fallback` when the param is missing or not allowed for
 * this role. History is replaced (not pushed) so toggling doesn't spam back/forward.
 */
export function usePeriodParam(fallback: Period, allowed: Period[]): [Period, (p: Period) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get('period') as Period | null
  const period = raw && (allowed as string[]).includes(raw) ? raw : fallback
  const setPeriod = (p: Period) => {
    const next = new URLSearchParams(params)
    next.set('period', p)
    setParams(next, { replace: true })
  }
  return [period, setPeriod]
}

// ---- small helpers --------------------------------------------------------
function greetingKey(): MessageKey {
  const h = new Date().getHours()
  if (h < 12) return 'home.morning'
  if (h < 18) return 'home.afternoon'
  return 'home.evening'
}
function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? ''
}
function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '—'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}
export function fmtTime(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}
/** Compact number WITHOUT a currency symbol (pairs with useCurrency().symbol). */
export function compactNum(n: number, plain: (n: number) => string): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}K`
  return plain(n)
}
export function payLabel(t: ReturnType<typeof useT>, method: string | null): string {
  switch (method) {
    case 'CASH':
      return t('sell.cash')
    case 'MTN_MOMO':
      return t('sell.momo')
    case 'ORANGE_MONEY':
      return t('sell.om')
    case 'CARD':
      return t('sell.card')
    case 'SAVINGS':
      return t('sell.deposit')
    default:
      return method || '—'
  }
}

// ---- sync status pill -----------------------------------------------------
export function useSyncStatusLine(): { label: string; warn: boolean } {
  const t = useT()
  const [status, setStatus] = useState<SyncStatus | null>(null)
  useEffect(() => {
    let alive = true
    void dataClient.sync.getStatus().then((s) => {
      if (alive) setStatus(s)
    })
    const off = dataClient.sync.onStatus((s) => setStatus(s))
    return () => {
      alive = false
      off()
    }
  }, [])
  if (!status) return { label: t('home.synced'), warn: false }
  if (status.state === 'syncing') return { label: t('home.syncing'), warn: false }
  if (status.failedCount > 0 || status.deadCount > 0 || status.lastError)
    return { label: t('home.syncError'), warn: true }
  if (status.pendingCount > 0) return { label: t('home.syncPending'), warn: true }
  return { label: t('home.synced'), warn: false }
}

// ---- layout pieces --------------------------------------------------------
export function Hero({
  roleKey,
  period,
  setPeriod,
  periods,
}: {
  roleKey: RoleKey
  period?: Period
  setPeriod?: (p: Period) => void
  periods?: Period[]
}) {
  const t = useT()
  const lang = useLangStore((s) => s.lang)
  const user = useSessionStore((s) => s.status.user)
  const sync = useSyncStatusLine()
  const name = firstName(user?.name)
  const roleLabel = roleKey === 'general' ? null : t(ROLE_LABEL[roleKey])
  const dateStr = cap(
    new Date().toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  )
  return (
    <div className="hero">
      <div>
        <span className={`sync${sync.warn ? ' warn' : ''}`}>
          <span className="dot" /> {sync.label}
        </span>
        <h1>
          {t(greetingKey())}
          {name ? `, ${name}` : ''}
          {roleLabel ? <span className="role-chip">{roleLabel}</span> : null}
        </h1>
        <p className="sub">
          {dateStr} · {t(SUB_KEY[roleKey])}
        </p>
      </div>
      {periods && period && setPeriod ? (
        <PeriodPills period={period} setPeriod={setPeriod} periods={periods} />
      ) : null}
    </div>
  )
}

export function PeriodPills({
  period,
  setPeriod,
  periods,
}: {
  period: Period
  setPeriod: (p: Period) => void
  periods: Period[]
}) {
  const t = useT()
  return (
    <div className="pills">
      {periods.map((p) => (
        <button key={p} type="button" className={period === p ? 'active' : ''} onClick={() => setPeriod(p)}>
          {t(PERIOD_LABEL[p])}
        </button>
      ))}
    </div>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="sec-label">{children}</div>
}

export type Tone = 'up' | 'down' | 'warn'
export function Kpi({
  label,
  value,
  hint,
  badge,
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  badge?: { text: string; tone: Tone } | null
}) {
  return (
    <div className="kpi">
      <div className="lab">
        <span>{label}</span>
        {badge ? <span className={`badge b-${badge.tone}`}>{badge.text}</span> : null}
      </div>
      <div className="val">{value}</div>
      {hint != null ? <div className="hint">{hint}</div> : null}
    </div>
  )
}

export function MiniKpi({
  label,
  value,
  hint,
  badge,
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  badge?: { text: string; tone: Tone } | null
}) {
  return (
    <div className="kpi-s">
      <div className="lab">
        <span>{label}</span>
        {badge ? <span className={`badge b-${badge.tone}`}>{badge.text}</span> : null}
      </div>
      <div className="val">{value}</div>
      {hint != null ? <div className="hint">{hint}</div> : null}
    </div>
  )
}

export function Card({
  title,
  sub,
  action,
  children,
}: {
  title: ReactNode
  sub?: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="card">
      <div className="card-h">
        <div>
          <h3>{title}</h3>
          {sub ? <p>{sub}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

export function ListRow({
  initials,
  tone = 'brand',
  title,
  meta,
  right,
}: {
  initials: ReactNode
  tone?: 'brand' | 'warn'
  title: ReactNode
  meta?: ReactNode
  right?: ReactNode
}) {
  return (
    <div className="list-item">
      <div className={`avatar av-${tone}`}>{initials}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="nm">{title}</div>
        {meta ? <div className="meta">{meta}</div> : null}
      </div>
      {right}
    </div>
  )
}

export function ProgressRow({
  name,
  pct,
  right,
  amount,
  color,
}: {
  name: ReactNode
  pct: number
  right?: ReactNode
  amount?: ReactNode
  color?: string
}) {
  const w = Math.max(0, Math.min(100, Math.round(pct)))
  return (
    <div className="progress-row">
      <div className="pr-top">
        <span className="nm">{name}</span>
        <span>{right ?? `${w}%`}</span>
      </div>
      <div className="pay-track">
        <div className="pay-fill" style={{ width: `${w}%`, ...(color ? { background: color } : {}) }} />
      </div>
      {amount != null ? <div className="pr-amt">{amount}</div> : null}
    </div>
  )
}

export interface BarItem {
  label: string
  value: number
}
export function Bars({ items }: { items: BarItem[] }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <div className="bars">
      {items.map((it, i) => (
        <div key={i} className="bar-col">
          <div className="bar-pair">
            <div className="bar cur" style={{ height: `${Math.max(3, Math.round((it.value / max) * 100))}%` }} />
          </div>
          <div className="bar-lab">{it.label}</div>
        </div>
      ))}
    </div>
  )
}

/** Derive a payment/credit status badge for a sale row. */
export function SaleStatusBadge({ sale }: { sale: LocalSale }) {
  const t = useT()
  if ((sale.status ?? '').toUpperCase().includes('VOID'))
    return <span className="mini-badge s-out">{t('home.stVoid')}</span>
  if (sale.creditAmount > 0 && sale.amountPaid > 0)
    return <span className="mini-badge s-cred">{t('home.stPartial')}</span>
  if (sale.creditAmount > 0) return <span className="mini-badge s-cred">{t('home.stCredit')}</span>
  return <span className="mini-badge s-ok">{t('home.stPaid')}</span>
}

/** Recent-sales table shared by Owner / Manager / Accountant / General. */
export function RecentSales({
  rows,
  loading,
  onViewAll,
}: {
  rows: LocalSale[]
  loading: boolean
  onViewAll?: () => void
}) {
  const t = useT()
  const money = useCurrency()
  const lang = useLangStore((s) => s.lang)
  const [openId, setOpenId] = useState<string | null>(null)
  return (
    <Card
      title={t('home.cRecent')}
      sub={t('home.cRecentSub')}
      action={
        onViewAll ? (
          <button type="button" className="link" onClick={onViewAll}>
            {t('home.viewAll')}
          </button>
        ) : null
      }
    >
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('home.thSale')}</th>
              <th>{t('home.thTime')}</th>
              <th>{t('home.thCustomer')}</th>
              <th>{t('home.thPayment')}</th>
              <th className="right">{t('home.thTotal')}</th>
              <th>{t('home.thStatus')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} onClick={() => setOpenId(s.id)} style={{ cursor: 'pointer' }}>
                <td>
                  <button type="button" className="link mono" onClick={(e) => { e.stopPropagation(); setOpenId(s.id) }}>
                    {s.saleNumber}
                  </button>
                </td>
                <td className="num">{fmtTime(s.soldAt, lang)}</td>
                <td>{s.customerName ?? t('home.walkIn')}</td>
                <td>
                  <span className="pill-tag">{payLabel(t, s.paymentMethod)}</span>
                </td>
                <td className="right num">{money.format(s.totalAmount)}</td>
                <td>
                  <SaleStatusBadge sale={s} />
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="card-empty">
                  {t('home.noSales')}
                </td>
              </tr>
            ) : null}
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="card-empty">
                  {t('home.loading')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <SaleDetailDrawer saleId={openId} onClose={() => setOpenId(null)} />
    </Card>
  )
}
