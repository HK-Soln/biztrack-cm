import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { dataClient } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { useT } from '@/i18n'
import { ReceiveLine, newGroup, type RecvGroup } from '@/components/inventory/receive/ReceiveLine'
import { SettlementPanel } from '@/components/inventory/receive/SettlementPanel'
import { validateSerial } from '@/lib/serial'
import type { LocalProduct, LocalVariant, RestockItemInput } from '@shared/ipc'

const num = (s: string) => (s.trim() ? Number(s.replace(/\s/g, '')) : 0)
const round2 = (n: number) => Math.round(n * 100) / 100

interface ProductMeta { product: LocalProduct; variants: LocalVariant[] }

/** Full-page goods receipt against a purchase order — items on the left, a sticky
 * settlement + payment panel on the right (mirrors the Sell/POS layout). */
export function ReceivePo() {
  const { id = '' } = useParams()
  const t = useT()
  const navigate = useNavigate()

  const { data: po, isPending } = useQuery({
    queryKey: [...queryKeys.purchaseOrders, id],
    queryFn: () => dataClient.purchaseOrders.get(id),
    enabled: !!id,
  })

  const { data: meta } = useQuery({
    queryKey: [...queryKeys.purchaseOrders, id, 'receive-meta'],
    enabled: !!po,
    queryFn: async () => {
      const ids = [...new Set(po!.items.map((i) => i.productId))]
      const entries = await Promise.all(
        ids.map(async (pid) => {
          const [product, variants] = await Promise.all([dataClient.products.get(pid), dataClient.products.listVariants(pid)])
          return [pid, { product: product!, variants }] as const
        }),
      )
      return Object.fromEntries(entries) as Record<string, ProductMeta>
    },
  })

  const [groups, setGroups] = useState<Record<string, RecvGroup[]>>({})
  const [inited, setInited] = useState(false)

  useEffect(() => {
    if (inited || !po || !meta) return
    const init: Record<string, RecvGroup[]> = {}
    for (const line of po.items) {
      const m = meta[line.productId]
      const hasVariants = (m?.variants.length ?? 0) > 0
      const single = !hasVariants || !!line.variantId
      const serialized = m?.product.isSerialized ?? false
      const remaining = Math.max(0, line.quantity - line.receivedQuantity)
      init[line.id] = single ? [{ ...newGroup(line.variantId ?? null, String(line.unitPrice)), qty: serialized ? '' : String(remaining) }] : []
    }
    setGroups(init)
    setInited(true)
  }, [inited, po, meta])

  const built = useMemo(() => {
    const items: RestockItemInput[] = []
    let subtotal = 0
    if (!po || !meta) return { items, subtotal: 0 }
    for (const line of po.items) {
      const serialized = meta[line.productId]?.product.isSerialized ?? false
      const serialType = meta[line.productId]?.product.serialType ?? 'SERIAL_NUMBER'
      for (const g of groups[line.id] ?? []) {
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
          items.push({ productId: line.productId, variantId: g.variantId, serialNumbers: valid, unitCost: cost })
          subtotal += valid.length * cost
        } else {
          const qty = num(g.qty)
          if (qty <= 0) continue
          items.push({ productId: line.productId, variantId: g.variantId, quantity: qty, unitCost: cost })
          subtotal += qty * cost
        }
      }
    }
    return { items, subtotal: round2(subtotal) }
  }, [groups, po, meta])

  if (isPending || !po) return <div className="frame"><div className="cat-empty">{t('recv.loading')}</div></div>

  return (
    <div className="frame">
      <button type="button" className="back-btn" onClick={() => navigate(`/purchasing/orders/${id}`)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 18l-6-6 6-6" /></svg>
        {po.number}
      </button>

      <div className="page-head">
        <div>
          <h1>{t('recv.pageTitle')}</h1>
          <p>{t('recv.sub')}</p>
        </div>
      </div>

      <div className="recv">
        <div className="recv-main">
          {po.items.map((line) =>
            meta?.[line.productId] ? (
              <ReceiveLine
                key={line.id}
                line={line}
                product={meta[line.productId]!.product}
                variants={meta[line.productId]!.variants}
                groups={groups[line.id] ?? []}
                onChange={(g) => setGroups((s) => ({ ...s, [line.id]: g }))}
              />
            ) : (
              <div key={line.id} className="recv-line"><div className="sub">{line.description}…</div></div>
            ),
          )}
        </div>

        <div className="recv-side">
          <SettlementPanel
            subtotal={built.subtotal}
            buildItems={() => built.items}
            supplier={{ id: po.supplierId, name: po.supplierName ?? null }}
            allowSupplierPick={false}
            purchaseOrderId={po.id}
            defaultReference={po.number}
            onDone={() => navigate(`/purchasing/orders/${id}`)}
          />
        </div>
      </div>
    </div>
  )
}
