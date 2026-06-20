import { useMemo, useState, type ReactNode } from 'react'
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query'
import { PaymentMethod } from '@biztrack/types'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { useCurrency } from '@/lib/currency'
import { useBarcodeScanner } from '@/lib/useBarcodeScanner'
import { useLangStore, useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'
import type { ChargeType, DocumentSendChannel, LocalProduct, LocalSaleDetail, LocalSerialUnit, LocalVariant, SaleInput } from '@shared/ipc'

const PAGE = 20

// --- tiny icon set (matches the approved design) ---------------------------
const I = {
  search: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="9" cy="9" r="6" /><path d="m14 14 3 3" /></svg>,
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M5 12h14" /></svg>,
  x: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6 6 18" /></svg>,
  user: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="8" r="3.2" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>,
  receipt: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 2v6l2-1.5L16 8V2" /><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2Z" /></svg>,
  cash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></svg>,
  card: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18" /></svg>,
  phone: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M11 18h2" /></svg>,
  clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  split: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 6h7v12H3zM14 6h7v12h-7z" /></svg>,
  wallet: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 7a2 2 0 0 1 2-2h12v4M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7H6a3 3 0 0 1-3-3Z" /><circle cx="17" cy="13.5" r="1.3" /></svg>,
  tag: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 7v6l8 8 7-7-8-8H3Z" /><circle cx="7.5" cy="11.5" r="1.4" /></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6}><path d="m4 12 5 5L20 6" /></svg>,
  bell: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M10.3 21a2 2 0 0 0 3.4 0" /></svg>,
  print: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 9V3h12v6M6 18H4v-6h16v6h-2M8 14h8v7H8z" /></svg>,
}

type TenderKey = 'cash' | 'momo' | 'om' | 'card' | 'deposit' | 'credit' | 'split'
const PM: Record<Exclude<TenderKey, 'credit' | 'split' | 'deposit'>, PaymentMethod> = {
  cash: PaymentMethod.CASH, momo: PaymentMethod.MTN_MOMO, om: PaymentMethod.ORANGE_MONEY, card: PaymentMethod.CARD,
}
const SPLIT_KEYS = ['cash', 'momo', 'om', 'card'] as const

interface CartLine {
  key: string
  productId: string
  name: string
  unitPrice: number
  quantity: number
  variantId?: string | null
  variantName?: string | null
  /** Set for a serialized line — one cart line per serial unit (quantity always 1). */
  serialUnitId?: string | null
}
interface ChargeLine { id: string; kind: 'charge' | 'discount'; name: string; mode: 'PERCENT' | 'FIXED'; value: number; chargeTypeId: string | null }
interface Cust { id: string; name: string; phone: string | null }

function round2(n: number): number { return Math.round((n + Number.EPSILON) * 100) / 100 }

// Held/parked sales live only in the browser (no DB / no sync) — a counter convenience.
const HELD_KEY = 'biztrack:sell:held'
interface Held { id: string; ts: number; cart: CartLine[]; charges: ChargeLine[]; customer: Cust | null }
function readHeld(): Held[] { try { return JSON.parse(localStorage.getItem(HELD_KEY) || '[]') as Held[] } catch { return [] } }
function writeHeld(h: Held[]): void { try { localStorage.setItem(HELD_KEY, JSON.stringify(h)) } catch { /* ignore */ } }

export function Sell() {
  const t = useT()
  const money = useCurrency()

  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [cart, setCart] = useState<CartLine[]>([])
  const [charges, setCharges] = useState<ChargeLine[]>([])
  const [customer, setCustomer] = useState<Cust | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [custOpen, setCustOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [done, setDone] = useState<LocalSaleDetail | null>(null)
  const [variantPick, setVariantPick] = useState<LocalProduct | null>(null)
  const [serialPick, setSerialPick] = useState<LocalProduct | null>(null)
  const [held, setHeld] = useState<Held[]>(() => readHeld())
  const [heldOpen, setHeldOpen] = useState(false)
  const [scanMiss, setScanMiss] = useState<string | null>(null)

  // --- data ----------------------------------------------------------------
  const { data: cats = [] } = useQuery({
    queryKey: [...queryKeys.categories, 'selectable', 'sell'],
    queryFn: () => dataClient.categories.listSelectable({}),
    enabled: isElectron,
  })
  const { data: chargeTypes = [] } = useQuery({
    queryKey: ['charge-types'],
    queryFn: () => dataClient.charges.listActive(),
    enabled: isElectron,
  })
  const catalog = useInfiniteQuery({
    queryKey: [...queryKeys.products, 'sell', search, categoryId],
    queryFn: ({ pageParam }) =>
      dataClient.products.list({ search, categoryId: categoryId ?? undefined, page: pageParam, limit: PAGE, stockStatus: 'all' }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    enabled: isElectron,
  })
  const products = catalog.data?.pages.flatMap((p) => p.data) ?? []

  // --- cart ops ------------------------------------------------------------
  // Click routes to a picker for variant/serialized products; simple products add directly.
  const onProductClick = async (p: LocalProduct) => {
    if (p.isSerialized) { setSerialPick(p); return }
    const variants = await dataClient.products.listVariants(p.id)
    if (variants.length > 0) { setVariantPick(p); return }
    addSimple(p)
  }
  const addSimple = (p: LocalProduct) => {
    setCart((prev) => {
      const found = prev.find((l) => l.key === p.id)
      if (found) return prev.map((l) => (l.key === p.id ? { ...l, quantity: l.quantity + 1 } : l))
      return [...prev, { key: p.id, productId: p.id, name: p.name, unitPrice: p.effectiveSellingPrice, quantity: 1 }]
    })
  }
  const addVariant = (p: LocalProduct, v: LocalVariant) => {
    const key = `${p.id}:${v.id}`
    const unitPrice = v.priceOverride ?? p.sellingPrice
    setCart((prev) => {
      const found = prev.find((l) => l.key === key)
      if (found) return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l))
      return [...prev, { key, productId: p.id, name: `${p.name} · ${v.name}`, unitPrice, quantity: 1, variantId: v.id, variantName: v.name }]
    })
    setVariantPick(null)
  }
  const addSerials = (p: LocalProduct, units: LocalSerialUnit[]) => {
    setCart((prev) => {
      const existing = new Set(prev.map((l) => l.serialUnitId).filter(Boolean))
      const next = units
        .filter((u) => !existing.has(u.id))
        .map<CartLine>((u) => ({ key: `serial:${u.id}`, productId: p.id, name: `${p.name} · ${u.serialNumber}`, unitPrice: p.effectiveSellingPrice, quantity: 1, serialUnitId: u.id }))
      return [...prev, ...next]
    })
    setSerialPick(null)
  }
  const setQty = (key: string, d: number) =>
    setCart((prev) => prev.flatMap((l) => (l.key === key ? (l.quantity + d <= 0 ? [] : [{ ...l, quantity: l.quantity + d }]) : [l])))
  const removeLine = (key: string) => setCart((prev) => prev.filter((l) => l.key !== key))
  const clearAll = () => { setCart([]); setCharges([]) }

  // --- hold / park (local only) -------------------------------------------
  const hold = () => {
    if (cart.length === 0) return
    const next = [...held, { id: crypto.randomUUID(), ts: Date.now(), cart, charges, customer }]
    setHeld(next); writeHeld(next); setCart([]); setCharges([]); setCustomer(null)
  }
  const resume = (h: Held) => {
    setCart(h.cart); setCharges(h.charges); setCustomer(h.customer)
    const next = held.filter((x) => x.id !== h.id); setHeld(next); writeHeld(next); setHeldOpen(false)
  }
  const dropHeld = (id: string) => { const next = held.filter((x) => x.id !== id); setHeld(next); writeHeld(next) }

  // --- scanning ------------------------------------------------------------
  // Resolve a scanned/typed code to a product/variant/serial and add it to the cart.
  const handleScan = async (raw: string, opts?: { silent?: boolean }): Promise<boolean> => {
    const code = raw.trim()
    if (!code) return false
    const hit = await dataClient.products.resolveScan(code)
    if (!hit) {
      if (!opts?.silent) { setScanMiss(code); window.setTimeout(() => setScanMiss(null), 1600) }
      return false
    }
    // A specific serial/variant code adds directly; a product code routes through the same
    // path as a tap — +1 for a simple product, or the variant/serial picker otherwise.
    if (hit.kind === 'serial') addSerials(hit.product, [hit.serial])
    else if (hit.kind === 'variant') addVariant(hit.product, hit.variant)
    else await onProductClick(hit.product)
    return true
  }
  // Hardware barcode scanners type fast and end with Enter — capture them globally
  // (capture phase, scanner-speed timing) so a scan adds to the cart wherever focus is.
  // Paused while a dialog is open so those handle their own input.
  const overlayOpen = payOpen || custOpen || !!variantPick || !!serialPick || heldOpen || !!done
  useBarcodeScanner((code) => { void handleScan(code) }, { enabled: !overlayOpen, minLength: 3 })

  // --- charge/discount library --------------------------------------------
  const addCharge = (c: ChargeType) =>
    setCharges((prev) => [...prev, { id: crypto.randomUUID(), kind: 'charge', name: c.name, mode: c.rateType === 'PERCENT' ? 'PERCENT' : 'FIXED', value: c.defaultValue ?? 0, chargeTypeId: c.id }])
  const addCustom = (kind: 'charge' | 'discount') =>
    setCharges((prev) => [...prev, { id: crypto.randomUUID(), kind, name: kind === 'discount' ? t('sell.discount') : t('sell.customCharge'), mode: kind === 'discount' ? 'PERCENT' : 'FIXED', value: kind === 'discount' ? 5 : 500, chargeTypeId: null }])
  const setChargeValue = (id: string, value: number) => setCharges((prev) => prev.map((c) => (c.id === id ? { ...c, value } : c)))
  const removeCharge = (id: string) => setCharges((prev) => prev.filter((c) => c.id !== id))

  // --- totals --------------------------------------------------------------
  const calc = useMemo(() => {
    const subtotal = round2(cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0))
    const amountOf = (c: ChargeLine) => round2(c.mode === 'PERCENT' ? (subtotal * c.value) / 100 : c.value)
    let disc = 0, chg = 0
    for (const c of charges) { if (c.kind === 'discount') disc += amountOf(c); else chg += amountOf(c) }
    disc = round2(Math.min(subtotal, disc)); chg = round2(chg)
    const total = round2(Math.max(0, subtotal - disc + chg))
    return { subtotal, disc, chg, total, amountOf }
  }, [cart, charges])

  const itemCount = cart.reduce((a, l) => a + l.quantity, 0)

  const buildInput = (payments: SaleInput['payments']): SaleInput => ({
    clientId: crypto.randomUUID(),
    customerId: customer?.id ?? null,
    customerName: customer?.name ?? null,
    customerPhone: customer?.phone ?? null,
    items: cart.map((l) =>
      l.serialUnitId
        ? { productId: l.productId, unitPrice: l.unitPrice, quantity: 1, serialUnitIds: [l.serialUnitId] }
        : { productId: l.productId, variantId: l.variantId ?? null, variantName: l.variantName ?? null, quantity: l.quantity, unitPrice: l.unitPrice },
    ),
    payments,
    charges: charges.filter((c) => c.kind === 'charge').map((c) => ({ id: c.id, chargeTypeId: c.chargeTypeId, name: c.name, rateType: c.mode, rateValue: c.value, amount: calc.amountOf(c) })),
    discounts: charges.filter((c) => c.kind === 'discount').map((c) => ({ id: c.id, description: c.name, discountType: c.mode === 'PERCENT' ? 'PERCENTAGE' : 'FIXED_AMOUNT', rate: c.mode === 'PERCENT' ? c.value : null, amount: calc.amountOf(c) })),
  })

  const checkout = useMutation({
    mutationFn: (input: SaleInput) => dataClient.sales.create(input),
    onSuccess: (sale) => { setDone(sale); setPayOpen(false) },
  })

  const startNew = () => { setCart([]); setCharges([]); setCustomer(null); setDone(null); void catalog.refetch() }

  return (
    <div className="frame">
      <div className="page-head">
        <div>
          <h1>{t('sell.title')}</h1>
          <p>{t('sell.subtitle')}</p>
        </div>
        {held.length > 0 ? (
          <button type="button" className="ab" style={{ width: 'auto', padding: '9px 14px' }} onClick={() => setHeldOpen(true)}>
            {t('sell.resume')} <span className="cnt2">{held.length}</span>
          </button>
        ) : null}
      </div>

      <div className="pos">
        {/* Catalog */}
        <div>
          <div className="pos-search">
            {I.search}
            <input
              value={search}
              placeholder={t('sell.searchPh')}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                // Enter tries to resolve the text as a code; on a hit it adds + clears, otherwise
                // the text stays as a catalog filter (no toast).
                if (e.key === 'Enter' && search.trim()) {
                  e.preventDefault()
                  void handleScan(search.trim(), { silent: true }).then((ok) => { if (ok) setSearch('') })
                }
              }}
            />
          </div>
          {scanMiss ? <div className="scan-miss">{t('sell.scanMiss').replace('{code}', scanMiss)}</div> : null}
          <div className="cat-chips">
            <button type="button" className={`chip${categoryId === null ? ' active' : ''}`} onClick={() => setCategoryId(null)}>{t('sell.allCats')}</button>
            {cats.map((c) => (
              <button key={c.id} type="button" className={`chip${categoryId === c.id ? ' active' : ''}`} onClick={() => setCategoryId(c.id)}>{c.name}</button>
            ))}
          </div>
          <div className="prod-grid">
            {products.map((p) => {
              const out = p.trackInventory && p.currentStock <= 0
              return (
                <button key={p.id} type="button" className="prod" disabled={out} onClick={() => void onProductClick(p)}>
                  <div className="thumb">{p.imageUrl ? <img src={p.imageUrl} alt="" className="ava-img" /> : p.name.trim().charAt(0).toUpperCase()}</div>
                  <div className="pn">{p.name}</div>
                  <div className="pmeta">
                    <span className="pp">{money.format(p.effectiveSellingPrice)}</span>
                    {p.trackInventory ? <span className={`ps${p.currentStock <= 0 ? ' out' : ''}`}>{out ? t('sell.outOfStock') : p.currentStock}</span> : null}
                  </div>
                </button>
              )
            })}
            {!catalog.isPending && products.length === 0 ? <div className="cat-empty" style={{ gridColumn: '1 / -1' }}>{t('sell.noProducts')}</div> : null}
          </div>
          {catalog.hasNextPage ? (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button type="button" className="ab" style={{ maxWidth: 200, margin: '0 auto' }} onClick={() => void catalog.fetchNextPage()}>{t('sell.loadMore')}</button>
            </div>
          ) : null}
        </div>

        {/* Ticket */}
        <div className="ticket">
          <div className="ticket-h">
            <h3>{t('sell.currentSale')} <span className="cnt2">{itemCount}</span></h3>
            <button type="button" className="cust" onClick={() => setCustOpen(true)}>
              {I.user}<span>{customer?.name ?? t('sell.walkIn')}</span>
            </button>
          </div>

          <div className="tl">
            {cart.length === 0 ? (
              <div className="tl-empty">{I.receipt}<div className="t">{t('sell.noItems')}</div><div className="s">{t('sell.noItemsHint')}</div></div>
            ) : (
              cart.map((l) => (
                <div key={l.key} className="tl-row">
                  <div className="tn"><div className="nm">{l.name}</div><div className="up">{money.format(l.unitPrice)} × {l.quantity}</div></div>
                  {l.serialUnitId ? (
                    <span className="qty"><span>1</span></span>
                  ) : (
                    <span className="qty">
                      <button type="button" onClick={() => setQty(l.key, -1)}>−</button>
                      <span>{l.quantity}</span>
                      <button type="button" onClick={() => setQty(l.key, 1)}>+</button>
                    </span>
                  )}
                  <span className="lt">{money.format(l.unitPrice * l.quantity)}</span>
                  <button type="button" className="trm" title={t('sell.remove')} onClick={() => removeLine(l.key)}>{I.x}</button>
                </div>
              ))
            )}
          </div>

          {charges.length > 0 ? (
            <div className="tl-charges">
              {charges.map((c) => (
                <div key={c.id} className={`charge-line${c.kind === 'discount' ? ' disc' : ''}`}>
                  <div className="ci">{c.kind === 'discount' ? I.tag : I.plus}</div>
                  <div className="cl">{c.name}</div>
                  <span className="cinp">
                    <input value={c.value} inputMode="decimal" onChange={(e) => setChargeValue(c.id, Number(e.target.value.replace(',', '.')) || 0)} />
                    <span className="u">{c.mode === 'PERCENT' ? '%' : money.symbol}</span>
                  </span>
                  <span className="ca">{c.kind === 'discount' ? '−' : '+'}{money.format(calc.amountOf(c))}</span>
                  <button type="button" className="crm" title={t('sell.remove')} onClick={() => removeCharge(c.id)}>{I.x}</button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="addcharge">
            <button type="button" className="ab" onClick={() => setMenuOpen((v) => !v)}>{I.plus}{t('sell.addCharge')}</button>
            {menuOpen ? (
              <div className="charge-menu open" onMouseLeave={() => setMenuOpen(false)}>
                <div className="mh">{t('sell.addToSale')}</div>
                {chargeTypes.map((c) => (
                  <button key={c.id} type="button" onClick={() => { addCharge(c); setMenuOpen(false) }}>
                    <span className="mi">{I.plus}</span>
                    <span className="mt"><span className="nm">{c.name}</span><small>{c.rateType === 'PERCENT' ? `${c.defaultValue ?? 0}%` : money.format(c.defaultValue ?? 0)}</small></span>
                  </button>
                ))}
                <button type="button" className="disc" onClick={() => { addCustom('discount'); setMenuOpen(false) }}>
                  <span className="mi">{I.tag}</span><span className="mt"><span className="nm">{t('sell.discount')}</span><small>{t('sell.discountHint')}</small></span>
                </button>
                <button type="button" onClick={() => { addCustom('charge'); setMenuOpen(false) }}>
                  <span className="mi">{I.plus}</span><span className="mt"><span className="nm">{t('sell.customCharge')}</span><small>{t('sell.customChargeHint')}</small></span>
                </button>
              </div>
            ) : null}
          </div>

          <div className="totals">
            <div className="tr"><span>{t('sell.subtotal')}</span><span>{money.format(calc.subtotal)}</span></div>
            {calc.disc > 0 ? <div className="tr charge"><span>{t('sell.discounts')}</span><span className="pos2">− {money.format(calc.disc)}</span></div> : null}
            {calc.chg > 0 ? <div className="tr charge"><span>{t('sell.charges')}</span><span>+ {money.format(calc.chg)}</span></div> : null}
            <div className="tr grand"><span>{t('sell.total')}</span><span>{money.format(calc.total)}</span></div>
          </div>

          <div className="charge">
            <button type="button" id="chargeBtn" disabled={cart.length === 0} onClick={() => setPayOpen(true)}>
              {cart.length ? `${t('sell.charge')} ${money.format(calc.total)}` : t('sell.addItemsToCharge')}
            </button>
            <div className="row2">
              <button type="button" onClick={hold} disabled={cart.length === 0}>{t('sell.hold')}</button>
              <button type="button" onClick={clearAll} disabled={cart.length === 0 && charges.length === 0}>{t('sell.clear')}</button>
            </div>
          </div>
        </div>
      </div>

      {heldOpen ? (
        <div className="pay-overlay open" onClick={(e) => { if (e.target === e.currentTarget) setHeldOpen(false) }}>
          <div className="pay-modal" style={{ width: 440 }}>
            <div className="pm-head"><h3>{t('sell.heldSales')}</h3><button type="button" className="x" onClick={() => setHeldOpen(false)}>{I.x}</button></div>
            <div className="cust-list">
              {held.length === 0 ? <div className="cat-empty">{t('sell.noHeld')}</div> : null}
              {held.map((h) => {
                const items = h.cart.reduce((a, l) => a + l.quantity, 0)
                const tot = h.cart.reduce((a, l) => a + l.unitPrice * l.quantity, 0)
                return (
                  <button key={h.id} type="button" onClick={() => resume(h)}>
                    <div className="a">{I.receipt}</div>
                    <div className="t"><div className="nm">{h.customer?.name ?? t('sell.walkIn')} · {items} {t('sell.itemsWord')}</div><div className="s">{money.format(tot)}</div></div>
                    <div className="rt"><span className="trm" role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); dropHeld(h.id) }} style={{ display: 'inline-flex' }}>{I.x}</span></div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}

      {variantPick ? (
        <VariantPicker product={variantPick} onClose={() => setVariantPick(null)} onPick={(v) => addVariant(variantPick, v)} />
      ) : null}

      {serialPick ? (
        <SerialPicker product={serialPick} onClose={() => setSerialPick(null)} onAdd={(units) => addSerials(serialPick, units)} />
      ) : null}

      {custOpen ? (
        <CustomerPicker
          currentId={customer?.id ?? null}
          onClose={() => setCustOpen(false)}
          onPick={(c) => { setCustomer(c); setCustOpen(false) }}
          onWalkIn={() => { setCustomer(null); setCustOpen(false) }}
        />
      ) : null}

      {payOpen ? (
        <PaymentModal
          total={calc.total}
          subtotal={calc.subtotal}
          disc={calc.disc}
          chg={calc.chg}
          customer={customer}
          onClose={() => setPayOpen(false)}
          onPickCustomer={() => { setPayOpen(false); setCustOpen(true) }}
          busy={checkout.isPending}
          onConfirm={(payments) => checkout.mutate(buildInput(payments))}
        />
      ) : null}

      {done ? <SuccessModal sale={done} customerName={customer?.name ?? t('sell.walkIn')} onNew={startNew} /> : null}
    </div>
  )
}

// --- customer picker -------------------------------------------------------
function CustomerPicker({ currentId, onClose, onPick, onWalkIn }: { currentId: string | null; onClose: () => void; onPick: (c: Cust) => void; onWalkIn: () => void }) {
  const t = useT()
  const [q, setQ] = useState('')
  const { data: customers = [] } = useQuery({
    queryKey: [...queryKeys.contacts, 'customers', 'sell'],
    queryFn: () => dataClient.contacts.listAllCustomers(),
    enabled: isElectron,
  })
  const list = customers.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="pay-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="pay-modal" style={{ width: 440 }}>
        <div className="pm-head"><h3>{t('sell.selectCustomer')}</h3><button type="button" className="x" onClick={onClose}>{I.x}</button></div>
        <div style={{ padding: '14px 16px 6px' }}>
          <div className="field">{I.search}<input className="input ic" placeholder={t('sell.searchCustomers')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
        <div className="cust-list">
          <button type="button" className={currentId === null ? 'sel' : ''} onClick={onWalkIn}>
            <div className="a">{I.user}</div><div className="t"><div className="nm">{t('sell.walkIn')}</div><div className="s">{t('sell.walkInHint')}</div></div>
          </button>
          {list.map((c) => (
            <button key={c.id} type="button" className={currentId === c.id ? 'sel' : ''} onClick={() => onPick({ id: c.id, name: c.name, phone: c.phone })}>
              <div className="a">{initials(c.name)}</div>
              <div className="t"><div className="nm">{c.name}</div><div className="s">{c.phone || '—'}</div></div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// --- variant picker --------------------------------------------------------
function VariantPicker({ product, onClose, onPick }: { product: LocalProduct; onClose: () => void; onPick: (v: LocalVariant) => void }) {
  const t = useT()
  const money = useCurrency()
  const { data: variants = [], isPending } = useQuery({
    queryKey: [...queryKeys.products, 'variants', product.id, 'sell'],
    queryFn: () => dataClient.products.listVariants(product.id),
    enabled: isElectron,
  })
  return (
    <div className="pay-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="pay-modal" style={{ width: 440 }}>
        <div className="pm-head"><h3>{product.name}</h3><button type="button" className="x" onClick={onClose}>{I.x}</button></div>
        <div className="pm-body" style={{ paddingTop: 14 }}>
          <div className="pm-lbl">{t('sell.pickVariant')}</div>
          {isPending ? <div className="cat-empty">…</div> : null}
          <div className="pm-split">
            {variants.filter((v) => v.isActive).map((v) => {
              const out = v.stockQuantity <= 0
              return (
                <button key={v.id} type="button" className="pm-cust" style={{ marginBottom: 0 }} disabled={out} onClick={() => onPick(v)}>
                  <div className="t"><div className="nm">{v.name}</div><div className="s">{out ? t('sell.outOfStock') : `${v.stockQuantity} ${t('sell.inStock')}`}</div></div>
                  <div className="ch">{money.format(v.priceOverride ?? product.sellingPrice)}</div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// --- serial picker ---------------------------------------------------------
function SerialPicker({ product, onClose, onAdd }: { product: LocalProduct; onClose: () => void; onAdd: (units: LocalSerialUnit[]) => void }) {
  const t = useT()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const { data: serials = [], isPending } = useQuery({
    queryKey: [...queryKeys.products, 'in-stock-serials', product.id, q],
    queryFn: () => dataClient.products.listInStockSerials(product.id, null, q),
    enabled: isElectron,
  })
  const toggle = (id: string) => setPicked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  return (
    <div className="pay-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="pay-modal" style={{ width: 440 }}>
        <div className="pm-head"><h3>{product.name}</h3><button type="button" className="x" onClick={onClose}>{I.x}</button></div>
        <div className="pm-body" style={{ paddingTop: 14 }}>
          <div className="pm-lbl">{t('sell.pickSerials')}</div>
          <div className="field" style={{ marginBottom: 10 }}>{I.search}<input className="input ic" placeholder={t('sell.searchSerials')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {isPending ? <div className="cat-empty">…</div> : serials.length === 0 ? <div className="cat-empty">{t('sell.noSerials')}</div> : null}
          <div className="cust-list" style={{ maxHeight: 320, overflowY: 'auto' }}>
            {serials.map((u) => (
              <button key={u.id} type="button" className={picked.has(u.id) ? 'sel' : ''} onClick={() => toggle(u.id)}>
                <span className={`ctree-cb${picked.has(u.id) ? ' on' : ''}`} aria-hidden>{picked.has(u.id) ? I.check : null}</span>
                <div className="t"><div className="nm">{u.serialNumber}</div></div>
              </button>
            ))}
          </div>
          <button type="button" className="pm-confirm" style={{ marginTop: 14 }} disabled={picked.size === 0}
            onClick={() => onAdd(serials.filter((u) => picked.has(u.id)))}>
            {t('sell.addSerials').replace('{n}', String(picked.size))}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- payment modal ---------------------------------------------------------
function PaymentModal({ total, subtotal, disc, chg, customer, onClose, onPickCustomer, onConfirm, busy }: {
  total: number; subtotal: number; disc: number; chg: number; customer: Cust | null
  onClose: () => void; onPickCustomer: () => void; onConfirm: (p: SaleInput['payments']) => void; busy: boolean
}) {
  const t = useT()
  const money = useCurrency()
  const [method, setMethod] = useState<TenderKey>('cash')
  const [tendered, setTendered] = useState<number | null>(null)
  const [momoRef, setMomoRef] = useState('')
  const [depRem, setDepRem] = useState<number | null>(null)
  const [splits, setSplits] = useState<Record<string, number>>({ cash: 0, momo: 0, om: 0, card: 0, deposit: 0 })

  const { data: deposit } = useQuery({
    queryKey: [...queryKeys.contacts, 'savings', customer?.id],
    queryFn: () => dataClient.savings.getForCustomer(customer!.id),
    enabled: isElectron && !!customer,
  })
  const depBalance = deposit?.balance ?? 0
  const depAccountId = deposit?.id ?? null
  const hasDeposit = depBalance > 0

  const METHODS: Array<{ key: TenderKey; label: string; icon: ReactNode }> = [
    { key: 'cash', label: t('sell.cash'), icon: I.cash }, { key: 'momo', label: t('sell.momo'), icon: I.phone },
    { key: 'om', label: t('sell.om'), icon: I.phone }, { key: 'card', label: t('sell.card'), icon: I.card },
    { key: 'deposit', label: t('sell.deposit'), icon: I.wallet }, { key: 'credit', label: t('sell.credit'), icon: I.clock },
    { key: 'split', label: t('sell.split'), icon: I.split },
  ]
  // Deposit is a split option whenever a customer is selected (disabled if they have no
  // balance) so it's always discoverable; walk-in sales have no deposit to draw from.
  const splitKeys = customer ? [...SPLIT_KEYS, 'deposit' as const] : SPLIT_KEYS
  const isWalkIn = !customer
  const t2 = tendered == null ? total : tendered
  const change = t2 - total
  const allocated = splitKeys.reduce((a, k) => a + (splits[k] || 0), 0)
  const remaining = round2(total - allocated)

  // deposit method: deposit covers min(balance, total); remainder paid in cash.
  const depApplied = round2(Math.min(depBalance, total))
  const depRemaining = round2(total - depApplied)
  const depTendered = depRem == null ? depRemaining : depRem
  const depChange = depTendered - depRemaining

  let canConfirm = true
  let confirmLabel = t('sell.confirmPayment')
  if (method === 'cash' || method === 'momo' || method === 'om') canConfirm = change >= 0
  else if (method === 'credit') { canConfirm = !isWalkIn; confirmLabel = t('sell.recordCredit') }
  else if (method === 'deposit') { canConfirm = hasDeposit && depChange >= 0; confirmLabel = depRemaining > 0 ? t('sell.confirmPayment') : t('sell.payFromDeposit') }
  else if (method === 'split') { canConfirm = remaining <= 0 || !isWalkIn; confirmLabel = remaining > 0 ? `${t('sell.confirm')} · ${money.format(remaining)} ${t('sell.onCredit')}` : t('sell.confirmSplit') }

  const confirm = () => {
    let payments: SaleInput['payments'] = []
    if (method === 'cash') payments = [{ method: PM.cash, amount: t2 }]
    else if (method === 'momo') payments = [{ method: PM.momo, amount: t2, mobileMoneyReference: momoRef.trim() || null }]
    else if (method === 'om') payments = [{ method: PM.om, amount: t2, mobileMoneyReference: momoRef.trim() || null }]
    else if (method === 'card') payments = [{ method: PM.card, amount: total }]
    else if (method === 'credit') payments = []
    else if (method === 'deposit') {
      payments = [{ method: PaymentMethod.SAVINGS, amount: depApplied, savingsAccountId: depAccountId }]
      if (depRemaining > 0) payments.push({ method: PM.cash, amount: depTendered })
    } else if (method === 'split') {
      payments = splitKeys.filter((k) => (splits[k] || 0) > 0).map((k) =>
        k === 'deposit'
          ? { method: PaymentMethod.SAVINGS, amount: splits[k]!, savingsAccountId: depAccountId }
          : { method: PM[k], amount: splits[k]!, mobileMoneyReference: (k === 'momo' || k === 'om') && momoRef.trim() ? momoRef.trim() : null },
      )
    }
    onConfirm(payments)
  }

  return (
    <div className="pay-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="pay-modal">
        <div className="pm-head"><h3>{t('sell.takePayment')}</h3><button type="button" className="x" onClick={onClose}>{I.x}</button></div>
        <div className="pm-due"><div className="l">{t('sell.amountDue')}</div><div className="v">{money.format(total)}</div></div>
        <div className="pm-body" style={{ paddingBottom: 0 }}>
          <button type="button" className="pm-cust" onClick={onPickCustomer}>
            <div className="a">{customer ? initials(customer.name) : I.user}</div>
            <div className="t"><div className="nm">{customer?.name ?? t('sell.walkIn')}</div><div className="s">{customer?.phone ?? t('sell.walkInHint')}</div></div>
            <div className="ch">{t('sell.change2')}</div>
          </button>
        </div>
        <div className="pm-body" style={{ paddingTop: 0 }}>
          <div className="pm-lbl">{t('sell.paymentMethod')}</div>
          <div className="pm-methods">
            {METHODS.map((m) => (
              <button key={m.key} type="button" className={`pm-m${method === m.key ? ' active' : ''}`} onClick={() => setMethod(m.key)}>{m.icon}{m.label}</button>
            ))}
          </div>

          {(method === 'cash' || method === 'momo' || method === 'om') ? (
            <>
              {(method === 'momo' || method === 'om') ? (
                <div className="pm-field"><div className="pm-lbl">{method === 'momo' ? t('sell.momoNumber') : t('sell.omNumber')}</div>
                  <input className="input" value={momoRef} onChange={(e) => setMomoRef(e.target.value)} placeholder="6 91 22 14 08" /></div>
              ) : null}
              <div className="pm-field"><div className="pm-lbl">{t('sell.amountReceived')}</div>
                <input className="input" inputMode="decimal" value={String(t2)} onChange={(e) => setTendered(Number(e.target.value.replace(/\s/g, '').replace(',', '.')) || 0)} />
                <div className="pm-quick">
                  {quickAmounts(total).map((v) => <button key={v} type="button" onClick={() => setTendered(v)}>{money.format(v)}</button>)}
                </div>
              </div>
              <div className={`pm-change${change < 0 ? ' short' : ''}`}><span>{change < 0 ? t('sell.stillDue') : t('sell.changeToGive')}</span><span className="big">{money.format(Math.abs(change))}</span></div>
            </>
          ) : null}

          {method === 'card' ? <div className="pm-note">{I.card}<span>{t('sell.cardHint')}</span></div> : null}

          {method === 'deposit' ? (
            !hasDeposit ? (
              <div className="pm-note">{I.bell}<span>{t('sell.noDeposit')}</span></div>
            ) : (
              <>
                <div className="dep-applied">
                  <div><div className="l">{t('sell.fromDeposit').replace('{name}', customer!.name)}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 3 }}>{t('sell.balanceAfter')} {money.format(depBalance - depApplied)}</div></div>
                  <div className="v">− {money.format(depApplied)}</div>
                </div>
                {depRemaining > 0 ? (
                  <>
                    <div className="pm-field"><div className="pm-lbl">{t('sell.payRemainingCash').replace('{amt}', money.format(depRemaining))}</div>
                      <input className="input" inputMode="decimal" value={String(depTendered)} onChange={(e) => setDepRem(Number(e.target.value.replace(/\s/g, '').replace(',', '.')) || 0)} /></div>
                    <div className={`pm-change${depChange < 0 ? ' short' : ''}`}><span>{depChange < 0 ? t('sell.stillDue') : t('sell.changeToGive')}</span><span className="big">{money.format(Math.abs(depChange))}</span></div>
                  </>
                ) : null}
              </>
            )
          ) : null}

          {method === 'credit' ? (
            isWalkIn ? <CustNeeded t={t} onPick={onPickCustomer} /> : <div className="pm-note">{I.clock}<span>{t('sell.creditHint').replace('{name}', customer!.name)}</span></div>
          ) : null}

          {method === 'split' ? (
            <>
              <div className="pm-lbl">{t('sell.splitAcross')}</div>
              <div className="pm-split">
                {splitKeys.map((k) => {
                  const m = METHODS.find((x) => x.key === k)!
                  const depDisabled = k === 'deposit' && !hasDeposit
                  return (
                    <div key={k} className="split-row">
                      <div className="si">{m.icon}</div>
                      <div className="sl">{m.label}{k === 'deposit' ? <small>{hasDeposit ? `${t('sell.max')} ${money.format(depBalance)}` : t('sell.noDepositShort')}</small> : null}</div>
                      <div className="sf"><input inputMode="decimal" disabled={depDisabled} value={splits[k] ? String(splits[k]) : ''} placeholder="0" onChange={(e) => {
                        let v = Number(e.target.value.replace(/\s/g, '').replace(',', '.')) || 0
                        if (k === 'deposit' && v > depBalance) v = depBalance
                        setSplits((s) => ({ ...s, [k]: v }))
                      }} /></div>
                    </div>
                  )
                })}
              </div>
              <div className={`split-sum ${remaining > 0 ? 'credit' : remaining < 0 ? 'short' : 'ok'}`}>
                <span>{remaining > 0 ? t('sell.remainingCredit') : remaining < 0 ? t('sell.changeCash') : t('sell.fullyAllocated')}</span>
                <span className="big">{money.format(Math.abs(remaining))}</span>
              </div>
              {remaining > 0 && isWalkIn ? <CustNeeded t={t} onPick={onPickCustomer} /> : null}
            </>
          ) : null}

          <div className="pm-recap-mini">
            <div className="r"><span>{t('sell.subtotal')}</span><span>{money.format(subtotal)}</span></div>
            {disc > 0 ? <div className="r"><span>{t('sell.discounts')}</span><span>− {money.format(disc)}</span></div> : null}
            {chg > 0 ? <div className="r"><span>{t('sell.charges')}</span><span>+ {money.format(chg)}</span></div> : null}
          </div>
          <button type="button" className="pm-confirm" disabled={!canConfirm || busy} onClick={confirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

function CustNeeded({ t, onPick }: { t: ReturnType<typeof useT>; onPick: () => void }) {
  return (
    <>
      <div className="pm-note">{I.bell}<span>{t('sell.creditNeedsCustomer')}</span></div>
      <button type="button" className="pm-confirm" style={{ background: 'var(--inset)', color: 'var(--text)', border: '1px solid var(--border)', marginBottom: 6 }} onClick={onPick}>{t('sell.chooseCustomer')}</button>
    </>
  )
}

function SuccessModal({ sale, customerName, onNew }: { sale: LocalSaleDetail; customerName: string; onNew: () => void }) {
  const t = useT()
  const money = useCurrency()
  const lang = useLangStore((s) => s.lang)
  const onCredit = sale.creditAmount > 0
  const [printing, setPrinting] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [sendOpen, setSendOpen] = useState(false)

  const flash = (msg: string) => { setNote(msg); window.setTimeout(() => setNote(null), 2200) }
  const print = async () => {
    setPrinting(true)
    try {
      const r = await dataClient.sales.printReceipt(sale.id, lang)
      flash(r.printed ? t('sell.printed') : t('sell.printSaved'))
    } catch {
      flash(t('sell.printFailed'))
    } finally {
      setPrinting(false)
    }
  }

  const title = onCredit ? (sale.amountPaid > 0 ? t('sell.partPaid') : t('sell.onCreditTitle')) : t('sell.paymentReceived')
  return (
    // No outside-click close: the cashier must start a new sale to begin a new session.
    <div className="pay-overlay open">
      <div className="pay-modal">
        <div className="pm-success">
          <div className="pm-check">{I.check}</div>
          <h2>{title}</h2>
          <div className="sub">{sale.saleNumber} · {customerName} · {sale.itemCount} {t('sell.itemsWord')}</div>
          <div className="pm-recap">
            {sale.payments.map((p) => <div key={p.id} className="r"><span>{methodLabel(p.method, t)}</span><span>{money.format(p.amount)}</span></div>)}
            {sale.creditAmount > 0 ? <div className="r"><span>{t('sell.onCredit')}</span><span>{money.format(sale.creditAmount)}</span></div> : null}
            {sale.changeGiven > 0 ? <div className="r chg"><span>{t('sell.changeGiven')}</span><span>{money.format(sale.changeGiven)}</span></div> : null}
            <div className="r big"><span>{t('sell.total')}</span><span>{money.format(sale.totalAmount)}</span></div>
          </div>
          {note ? <div className="pm-note" style={{ background: 'var(--inset)', border: '1px solid var(--border)', color: 'var(--text-2)' }}><span>{note}</span></div> : null}
          <div className="pm-success-acts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button type="button" disabled={printing} onClick={print}>{I.print}{printing ? '…' : t('sell.print')}</button>
            <button type="button" onClick={() => setSendOpen(true)}>{I.receipt}{t('sell.send')}</button>
            <button type="button" className="primary" onClick={onNew}>{t('sell.newSale')}</button>
          </div>
        </div>
      </div>
      {sendOpen ? <ReceiptSendDialog sale={sale} locale={lang} onClose={() => setSendOpen(false)} /> : null}
    </div>
  )
}

// Send the receipt to the customer. Mirrors RFQ/PO: online → server dispatches; offline →
// the desktop opens the WhatsApp/email composer with the PDF revealed to attach.
function ReceiptSendDialog({ sale, locale, onClose }: { sale: LocalSaleDetail; locale: string; onClose: () => void }) {
  const t = useT()
  const [channel, setChannel] = useState<DocumentSendChannel>('whatsapp')
  const [phone, setPhone] = useState(sale.customerPhone ?? '')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const online = navigator.onLine

  const send = useMutation({
    mutationFn: () =>
      dataClient.sales.sendReceipt(sale.id, channel, locale, {
        recipient: { phone: phone.trim() || undefined, email: email.trim() || undefined },
        online,
      }),
    onSuccess: onClose,
    onError: () => setError(t('sell.sendError')),
  })
  const submit = () => {
    if (channel === 'whatsapp' && !phone.trim()) return setError(t('sell.needPhone'))
    if (channel === 'email' && !email.trim()) return setError(t('sell.needEmail'))
    setError(null)
    send.mutate()
  }

  return (
    <div className="pay-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="pay-modal" style={{ width: 420 }}>
        <div className="pm-head"><h3>{t('sell.sendReceipt')}</h3><button type="button" className="x" onClick={onClose}>{I.x}</button></div>
        <div className="pm-body">
          <div className="pm-lbl">{t('sell.channel')}</div>
          <div className="pm-methods" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button type="button" className={`pm-m${channel === 'whatsapp' ? ' active' : ''}`} onClick={() => setChannel('whatsapp')}>{I.phone}{t('sell.sendWhatsApp')}</button>
            <button type="button" className={`pm-m${channel === 'email' ? ' active' : ''}`} onClick={() => setChannel('email')}>{I.receipt}{t('sell.sendEmail')}</button>
          </div>
          {channel === 'whatsapp' ? (
            <div className="pm-field"><div className="pm-lbl">{t('sell.phone')}</div><input className="input" value={phone} onChange={(e) => { setPhone(e.target.value); setError(null) }} placeholder="+237 6 …" /></div>
          ) : (
            <div className="pm-field"><div className="pm-lbl">{t('sell.email')}</div><input className="input" value={email} onChange={(e) => { setEmail(e.target.value); setError(null) }} placeholder="client@email.com" /></div>
          )}
          <div className="pm-note">{I.bell}<span>{online ? t('sell.sendOnlineNote') : t('sell.sendOfflineNote')}</span></div>
          {error ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 10 }} role="alert">{error}</p> : null}
          <button type="button" className="pm-confirm" disabled={send.isPending} onClick={submit}>{send.isPending ? '…' : t('sell.send')}</button>
        </div>
      </div>
    </div>
  )
}

// --- helpers ---------------------------------------------------------------
function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (!p.length) return '—'
  return ((p[0]![0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase()
}
function quickAmounts(total: number): number[] {
  const set = [total, Math.ceil(total / 1000) * 1000, Math.ceil(total / 5000) * 5000, Math.ceil(total / 10000) * 10000]
  return [...new Set(set)].filter((v) => v > 0)
}
function methodLabel(m: string, t: ReturnType<typeof useT>): string {
  const map: Record<string, MessageKey> = {
    CASH: 'sell.cash', MTN_MOMO: 'sell.momo', ORANGE_MONEY: 'sell.om', CARD: 'sell.card', SAVINGS: 'sell.deposit',
  }
  return map[m] ? t(map[m]) : m
}
