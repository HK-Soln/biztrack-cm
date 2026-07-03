// Shared building blocks for the MOBILE (phone) home dashboards. These recompose
// the same use-home-data sources as the desktop role screens into the phone layout
// from the mobile design system (m-hero / balance / mkpi / mrow …). Rendered only at
// the `mobile` breakpoint (see Dashboard.tsx); the classes are scoped to .m-content.
import type { ReactNode } from 'react'
import { useSessionStore } from '@/stores/session.store'
import { initialsOf } from '../home-kit'
import type { MessageKey } from '@/i18n/messages'
import type { LocalSale } from '@shared/ipc'

/** Payment/credit status → mobile pill tone + label key (mirrors SaleStatusBadge). */
export function salePill(sale: LocalSale): { tone: 'ok' | 'low' | 'out'; label: MessageKey } {
  const st = (sale.status ?? '').toUpperCase()
  if (st.includes('VOID')) return { tone: 'out', label: 'home.stVoid' }
  if (sale.creditAmount > 0 && sale.amountPaid > 0) return { tone: 'low', label: 'home.stPartial' }
  if (sale.creditAmount > 0) return { tone: 'low', label: 'home.stCredit' }
  return { tone: 'ok', label: 'home.stPaid' }
}

// ---- icon set (inline, matching the design) -------------------------------
type IconKey =
  | 'bell' | 'plus' | 'cart' | 'wallet' | 'card' | 'download' | 'check' | 'clipboard'
  | 'coin' | 'chart' | 'warn' | 'box' | 'chev' | 'up' | 'refresh' | 'drawer' | 'doc' | 'tax'
export function MIcon({ name }: { name: IconKey }) {
  const p: Record<IconKey, ReactNode> = {
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M10.3 21a2 2 0 0 0 3.4 0" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    cart: <><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.4 12.3a1 1 0 0 0 1 .8h8.2a1 1 0 0 0 1-.8L21 7H6" /></>,
    wallet: <><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2Z" /><path d="M8 8h8M8 12h8" /></>,
    card: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></>,
    download: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></>,
    check: <><path d="m9 11 3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
    clipboard: <><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="9" y="2" width="6" height="4" rx="1" /></>,
    coin: <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
    chart: <><path d="M3 3v18h18" /><path d="m7 14 3-4 3 3 4-6" /></>,
    warn: <><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></>,
    box: <><path d="M20 7 12 3 4 7l8 4 8-4ZM4 7v10l8 4 8-4V7" /></>,
    chev: <path d="m9 6 6 6-6 6" />,
    up: <path d="m6 15 6-6 6 6" />,
    refresh: <><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></>,
    drawer: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9h18M7 14h4" /></>,
    doc: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6" /></>,
    tax: <><circle cx="12" cy="12" r="9" /><path d="M9 9h6M9 12h6M9 15h3" /></>,
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {p[name]}
    </svg>
  )
}

// ---- hero header ----------------------------------------------------------
export function MHero({ eyebrow, onBell }: { eyebrow: string; onBell?: () => void }) {
  const user = useSessionStore((s) => s.status.user)
  return (
    <header className="m-hero">
      <div className="row">
        <div className="av">{initialsOf(user?.name)}</div>
        <div className="gt">
          <div className="h">{eyebrow}</div>
          <div className="n">{user?.name || 'BizTrack CM'}</div>
        </div>
        <button type="button" className="ico" onClick={onBell} aria-label="Notifications">
          <span className="dot" />
          <MIcon name="bell" />
        </button>
      </div>
    </header>
  )
}

// ---- balance hero card ----------------------------------------------------
export interface BalanceMetric {
  k: ReactNode
  v: ReactNode
}
export function Balance({
  label,
  amount,
  delta,
  target,
  metrics,
}: {
  label: ReactNode
  amount: ReactNode
  delta?: { text: ReactNode; up?: boolean } | null
  target?: { label: ReactNode; pct: number; hint: ReactNode } | null
  metrics?: BalanceMetric[]
}) {
  const pct = target ? Math.max(0, Math.min(100, Math.round(target.pct))) : 0
  return (
    <div className="balance" style={{ marginBottom: 16 }}>
      <div className="bc" />
      <div className="lab">{label}</div>
      <div className="amt">{amount}</div>
      {delta ? (
        <div className="delta">
          {delta.up != null ? <MIcon name="up" /> : null}
          {delta.text}
        </div>
      ) : null}
      {target ? (
        <div className="tgt">
          <div className="tt">
            <span>{target.label}</span>
            <span>{pct}%</span>
          </div>
          <div className="track">
            <i style={{ width: `${pct}%` }} />
          </div>
          <div className="hint">{target.hint}</div>
        </div>
      ) : null}
      {metrics && metrics.length ? (
        <div className="br">
          {metrics.map((m, i) => (
            <div key={i} className="i">
              <div className="k">{m.k}</div>
              <div className="v">{m.v}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// ---- quick actions --------------------------------------------------------
export interface QAction {
  icon: Parameters<typeof MIcon>[0]['name']
  label: ReactNode
  tone?: 'brand' | 'g' | 'w' | 'r'
  onPress?: () => void
}
const QI_STYLE: Record<NonNullable<QAction['tone']>, { background: string; color: string }> = {
  brand: { background: 'var(--brand-soft)', color: 'var(--brand)' },
  g: { background: 'var(--success-soft)', color: 'var(--success)' },
  w: { background: 'var(--warning-soft)', color: 'var(--warning)' },
  r: { background: 'var(--danger-soft)', color: 'var(--danger)' },
}
export function QuickActions({ items }: { items: QAction[] }) {
  return (
    <div className="qactions" style={{ marginBottom: 20 }}>
      {items.map((a, i) => (
        <button key={i} type="button" className="qaction" onClick={a.onPress}>
          <span className="qi" style={a.tone ? QI_STYLE[a.tone] : undefined}>
            <MIcon name={a.icon} />
          </span>
          <span className="ql">{a.label}</span>
        </button>
      ))}
    </div>
  )
}

// ---- mini KPI grid --------------------------------------------------------
export interface MKpiItem {
  icon: Parameters<typeof MIcon>[0]['name']
  tone: 'b' | 'g' | 'w' | 'r'
  delta?: { text: ReactNode; dir?: 'up' | 'down' } | null
  value: ReactNode
  label: ReactNode
}
export function MKpiGrid({ items }: { items: MKpiItem[] }) {
  return (
    <div className="mkpis" style={{ marginBottom: 20 }}>
      {items.map((k, i) => (
        <div key={i} className="mkpi">
          <div className="top">
            <span className={`ic ${k.tone}`}>
              <MIcon name={k.icon} />
            </span>
            {k.delta ? <span className={`d${k.delta.dir ? ` ${k.delta.dir}` : ''}`}>{k.delta.text}</span> : null}
          </div>
          <div className="v">{k.value}</div>
          <div className="k">{k.label}</div>
        </div>
      ))}
    </div>
  )
}

// ---- section label --------------------------------------------------------
export function MSec({ children, action }: { children: ReactNode; action?: { label: ReactNode; onPress: () => void } }) {
  return (
    <div className="m-sec">
      <span>{children}</span>
      {action ? (
        <button type="button" className="link" onClick={action.onPress}>
          {action.label}
        </button>
      ) : null}
    </div>
  )
}

// ---- list + row -----------------------------------------------------------
export function MList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`mlist${className ? ` ${className}` : ''}`} style={{ marginBottom: 18 }}>{children}</div>
}
export function MRow({
  initials,
  title,
  sub,
  value,
  right,
  onPress,
}: {
  initials: ReactNode
  title: ReactNode
  sub?: ReactNode
  value?: ReactNode
  right?: ReactNode
  onPress?: () => void
}) {
  const Tag = onPress ? 'button' : 'div'
  return (
    <Tag type={onPress ? 'button' : undefined} className="mrow" onClick={onPress}>
      <div className="th brand">{initials}</div>
      <div className="mt">
        <div className="nm">{title}</div>
        {sub != null ? <div className="sub">{sub}</div> : null}
      </div>
      {value != null || right != null ? (
        <div className="rt">
          {value != null ? <div className="v">{value}</div> : null}
          {right != null ? <div className="s">{right}</div> : null}
        </div>
      ) : null}
    </Tag>
  )
}

export function MPill({ tone, children }: { tone: 'ok' | 'low' | 'out' | 'neutral'; children: ReactNode }) {
  return (
    <span className={`mst mst-${tone}`}>
      <span className="d" />
      {children}
    </span>
  )
}

export function MEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="mrow" style={{ cursor: 'default' }}>
      <div className="mt">
        <div className="sub">{children}</div>
      </div>
    </div>
  )
}

// ---- reorder alert banner -------------------------------------------------
export function MAlert({ title, sub, onPress }: { title: ReactNode; sub: ReactNode; onPress?: () => void }) {
  return (
    <button type="button" className="m-alert" onClick={onPress} style={{ marginBottom: 8 }}>
      <span className="ai">
        <MIcon name="warn" />
      </span>
      <span className="at">
        <span className="t">{title}</span>
        <span className="s">{sub}</span>
      </span>
      <span className="chev">
        <MIcon name="chev" />
      </span>
    </button>
  )
}
