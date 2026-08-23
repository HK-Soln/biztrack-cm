import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BackButton } from '@biztrack/ui/biztrack'
import { buildReorderDigest, type ReorderSupplierGroup } from '@biztrack/utils'
import { dataClient } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { useCurrency } from '@/lib/currency'
import { openExternal } from '@/lib/share'
import { useT } from '@/i18n'

/**
 * "À commander" — the offline reorder surface (BIZ-4.5). Renders the low-stock lines
 * grouped by supplier and ranked by revenue-at-risk (from the shared buildReorderDigest,
 * over the local reorderSuggestions), with a per-supplier WhatsApp draft + a per-supplier
 * Generate-PO. Fully offline — the data comes from the local ledger.
 */
export function Reorder() {
  const t = useT()
  const navigate = useNavigate()
  const money = useCurrency()

  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: [...queryKeys.inventory, 'reorder'],
    queryFn: () => dataClient.inventory.reorderSuggestions(),
  })

  const digest = useMemo(
    () =>
      buildReorderDigest(
        suggestions.map((s) => ({
          productId: s.productId,
          name: s.name,
          sku: s.sku,
          currentStock: s.currentStock,
          suggestedQty: s.suggestedQty,
          unitCost: s.unitCost,
          sellingPrice: s.sellingPrice ?? null,
          currency: s.currency,
          velocity: s.velocity ?? null,
          daysCover: s.daysCover ?? null,
          stockoutDays: s.stockoutDays ?? null,
          supplierId: s.supplierId ?? null,
          supplierName: s.supplierName ?? null,
          supplierPhone: s.supplierPhone ?? null,
        })),
        { currency: suggestions[0]?.currency ?? 'XAF', generatedAt: new Date().toISOString() },
      ),
    [suggestions],
  )

  const generatePO = (group: ReorderSupplierGroup) => {
    const seedItems = group.lines.map((l) => ({
      productId: l.productId,
      name: l.name,
      quantity: String(l.suggestedQty),
      unitPrice: l.unitCost != null ? String(l.unitCost) : '',
    }))
    const supplierQuery = group.supplierId ? `?supplier=${group.supplierId}` : ''
    navigate(`/purchasing/orders/new${supplierQuery}`, { state: { seedItems } })
  }

  const whatsappSupplier = (group: ReorderSupplierGroup) => {
    const lines = group.lines.map((l) => `• ${l.name} × ${l.suggestedQty}`).join('\n')
    const message = `${t('reorder.waGreeting')}\n\n${lines}\n\n${t('reorder.waClosing')}`
    const digits = (group.supplierPhone ?? '').replace(/\D/g, '')
    // wa.me with no number lets the owner pick a contact (used for the "no supplier" group).
    openExternal(
      digits
        ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
        : `https://wa.me/?text=${encodeURIComponent(message)}`,
    )
  }

  return (
    <>
      <BackButton onClick={() => navigate('/inventory')}>{t('nav.inventory')}</BackButton>
      <div className="page-head">
        <div>
          <h1>{t('reorder.title')}</h1>
          <p>{t('reorder.sub')}</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="ro-kpis">
        <div className="ro-kpi">
          <div className="k">{digest.productCount}</div>
          <div className="l">{t('reorder.kpiProducts')}</div>
        </div>
        <div className="ro-kpi">
          <div className="k" style={{ color: 'var(--warning)' }}>
            {money.compact(digest.totalRevenueAtRisk)}
          </div>
          <div className="l">{t('reorder.kpiRisk')}</div>
        </div>
        <div className="ro-kpi">
          <div className="k">
            {money.compact(digest.supplierGroups.reduce((s, g) => s + g.estOrderCost, 0))}
          </div>
          <div className="l">{t('reorder.kpiCost')}</div>
        </div>
      </div>

      {isLoading ? null : digest.supplierGroups.length === 0 ? (
        <div className="card ro-empty">{t('reorder.empty')}</div>
      ) : (
        digest.supplierGroups.map((g) => (
          <div className="card ro-group" key={g.supplierId ?? '__none__'}>
            <div className="ro-group-h">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="nm">{g.supplierName || t('reorder.noSupplier')}</div>
                <div className="sub">
                  {t('reorder.groupMeta')
                    .replace('{count}', String(g.lineCount))
                    .replace('{risk}', money.compact(g.totalRevenueAtRisk))}
                </div>
              </div>
              <div className="ro-actions">
                <button type="button" className="btn" onClick={() => whatsappSupplier(g)}>
                  {t('reorder.whatsapp')}
                </button>
                <button type="button" className="btn btn-primary" onClick={() => generatePO(g)}>
                  {t('reorder.generatePO')}
                </button>
              </div>
            </div>
            <table className="ro-table">
              <thead>
                <tr>
                  <th>{t('reorder.colProduct')}</th>
                  <th className="num">{t('reorder.colOnHand')}</th>
                  <th className="num">{t('reorder.colCover')}</th>
                  <th className="num">{t('reorder.colOrder')}</th>
                  <th className="num">{t('reorder.colRisk')}</th>
                </tr>
              </thead>
              <tbody>
                {g.lines.map((l) => (
                  <tr key={l.productId}>
                    <td>
                      <div className="nm" title={l.name}>
                        {l.name}
                      </div>
                      {l.sku ? <div className="sub">{l.sku}</div> : null}
                    </td>
                    <td className="num">{l.currentStock}</td>
                    <td className="num">
                      {l.daysCover != null ? `${l.daysCover} ${t('reorder.daysShort')}` : '—'}
                    </td>
                    <td className="num">
                      <b>{l.suggestedQty}</b>
                    </td>
                    <td className="num">
                      {l.revenueAtRisk > 0 ? money.compact(l.revenueAtRisk) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </>
  )
}
