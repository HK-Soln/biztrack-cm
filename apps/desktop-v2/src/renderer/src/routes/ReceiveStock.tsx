import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CommandSelect } from '@biztrack/ui/biztrack'
import { PurchaseOrderStatus } from '@biztrack/types'
import { dataClient, isElectron } from '@/lib/data-client'
import { useT } from '@/i18n'
import { ReceiveLine, newGroup, type RecvGroup } from '@/components/inventory/receive/ReceiveLine'
import { SettlementPanel } from '@/components/inventory/receive/SettlementPanel'
import { validateSerial } from '@/lib/serial'
import type { LocalProduct, LocalPurchaseOrderItem, LocalVariant, RestockItemInput } from '@shared/ipc'

const num = (s: string) => (s.trim() ? Number(s.replace(/\s/g, '')) : 0)
const round2 = (n: number) => Math.round(n * 100) / 100
const newId = () => crypto.randomUUID()

const RECEIVABLE = new Set<string>([PurchaseOrderStatus.SENT, PurchaseOrderStatus.CONFIRMED, PurchaseOrderStatus.PARTIALLY_RECEIVED])

interface ProductMeta { product: LocalProduct; variants: LocalVariant[] }
interface ManualLine { id: string; productId: string; name: string }

/** Ad-hoc goods receipt. Either pick an open purchase order (→ the PO receive screen),
 * or add products manually and settle the same way (charges/discounts/payments/invoice). */
export function ReceiveStock() {
  const t = useT()
  const navigate = useNavigate()

  const [lines, setLines] = useState<ManualLine[]>([])
  const [meta, setMeta] = useState<Record<string, ProductMeta>>({})
  const [groups, setGroups] = useState<Record<string, RecvGroup[]>>({})

  // Pick an open PO → reuse the full PO receive flow.
  const loadPos = useCallback(async (search: string) => {
    const res = await dataClient.purchaseOrders.list({ search: search || undefined, limit: 20 })
    return res.data
      .filter((po) => RECEIVABLE.has(po.status))
      .map((po) => ({ value: po.id, label: po.number, sublabel: po.supplierName ?? undefined }))
  }, [])

  // Add a product as a manual line.
  const loadProducts = useCallback(async (search: string) => {
    const res = await dataClient.products.list({ search: search || undefined, limit: 20 })
    return res.data.map((p) => ({ value: p.id, label: p.name, sublabel: p.sku ?? undefined, imageUrl: p.imageUrl }))
  }, [])

  const addProduct = async (productId: string | null, label?: string) => {
    if (!productId) return
    const lineId = newId()
    let m = meta[productId]
    if (!m) {
      const [product, variants] = await Promise.all([dataClient.products.get(productId), dataClient.products.listVariants(productId)])
      if (!product) return
      m = { product, variants }
      setMeta((s) => ({ ...s, [productId]: m! }))
    }
    const hasVariants = m.variants.length > 0
    setLines((ls) => [...ls, { id: lineId, productId, name: label ?? m!.product.name }])
    setGroups((s) => ({ ...s, [lineId]: hasVariants ? [] : [newGroup(null, '')] }))
  }

  const removeLine = (lineId: string) => {
    setLines((ls) => ls.filter((l) => l.id !== lineId))
    setGroups((s) => { const next = { ...s }; delete next[lineId]; return next })
  }

  const built = useMemo(() => {
    const items: RestockItemInput[] = []
    let subtotal = 0
    for (const ml of lines) {
      const m = meta[ml.productId]
      if (!m) continue
      const serialized = m.product.isSerialized
      const serialType = m.product.serialType ?? 'SERIAL_NUMBER'
      for (const g of groups[ml.id] ?? []) {
        const cost = num(g.cost)
        if (serialized) {
          const seen = new Set<string>()
          const valid = g.serials.filter((s) => {
            const k = s.toLowerCase()
            if (seen.has(k) || !validateSerial(s, serialType)) return false
            seen.add(k)
            return true
          })
          if (valid.length === 0) continue
          items.push({ productId: ml.productId, variantId: g.variantId, serialNumbers: valid, unitCost: cost })
          subtotal += valid.length * cost
        } else {
          const qty = num(g.qty)
          if (qty <= 0) continue
          items.push({ productId: ml.productId, variantId: g.variantId, quantity: qty, unitCost: cost })
          subtotal += qty * cost
        }
      }
    }
    return { items, subtotal: round2(subtotal) }
  }, [lines, meta, groups])

  // A PO-line-shaped object so ReceiveLine can render a manual line.
  const asLine = (ml: ManualLine): LocalPurchaseOrderItem => ({ id: ml.id, productId: ml.productId, variantId: null, description: ml.name, quantity: 0, unitPrice: 0, receivedQuantity: 0 })

  return (
    <div className="frame">
      <button type="button" className="back-btn" onClick={() => navigate('/inventory')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 18l-6-6 6-6" /></svg>
        {t('nav.inventory')}
      </button>

      <div className="page-head">
        <div>
          <h1>{t('recv.stockTitle')}</h1>
          <p>{t('recv.stockSub')}</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="fsec-h" style={{ marginBottom: 8 }}>{t('recv.fromPo')}</div>
        <div style={{ maxWidth: 360 }}>
          <CommandSelect value={null} valueLabel={null} onChange={(poId) => { if (poId) navigate(`/purchasing/orders/${poId}/receive`) }} loadOptions={loadPos} placeholder={t('recv.pickPo')} searchPlaceholder={t('recv.searchPo')} />
        </div>
        <div className="hint" style={{ marginTop: 6 }}>{t('recv.fromPoHint')}</div>
      </div>

      <div className="recv">
        <div className="recv-main">
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="fsec-h" style={{ marginBottom: 8 }}>{t('recv.addProducts')}</div>
            <div style={{ maxWidth: 360 }}>
              <CommandSelect value={null} valueLabel={null} onChange={(id, opt) => void addProduct(id, opt?.label)} loadOptions={loadProducts} placeholder={t('field.addProduct')} searchPlaceholder={t('field.searchProducts')} />
            </div>
          </div>

          {lines.length === 0 ? (
            <div className="recv-line"><div className="sub">{t('recv.noManualItems')}</div></div>
          ) : (
            lines.map((ml) =>
              meta[ml.productId] ? (
                <ReceiveLine
                  key={ml.id}
                  line={asLine(ml)}
                  product={meta[ml.productId]!.product}
                  variants={meta[ml.productId]!.variants}
                  groups={groups[ml.id] ?? []}
                  onChange={(g) => setGroups((s) => ({ ...s, [ml.id]: g }))}
                  manual
                  onRemoveLine={() => removeLine(ml.id)}
                />
              ) : null,
            )
          )}
        </div>

        <div className="recv-side">
          <SettlementPanel
            subtotal={built.subtotal}
            buildItems={() => built.items}
            supplier={{ id: null, name: null }}
            allowSupplierPick
            onDone={() => navigate('/inventory')}
          />
        </div>
      </div>
    </div>
  )
}
