import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Modal, Select } from '@biztrack/ui/biztrack'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { MV_PILL, formatMovementDate } from '@/lib/movements'
import { useT } from '@/i18n'
import type { LocalProduct, StockMovementType } from '@shared/ipc'

const TYPES: StockMovementType[] = ['OPENING_STOCK', 'RESTOCK_IN', 'MANUAL_ADJUSTMENT', 'SALE', 'VOID_REVERSAL', 'TRANSFER_IN', 'TRANSFER_OUT']

/** Full, paginated stock-movement ledger for a product. */
export function MovementHistoryModal({ product, open, onClose }: { product: LocalProduct; open: boolean; onClose: () => void }) {
  const t = useT()
  const [page, setPage] = useState(1)
  const [type, setType] = useState<StockMovementType | ''>('')
  const limit = 10

  const { data, isPending } = useQuery({
    queryKey: [...queryKeys.products, 'movements-page', product.id, page, type],
    queryFn: () => dataClient.inventory.listMovements(product.id, { page, limit, ...(type ? { type } : {}) }),
    enabled: isElectron && open,
  })
  const rows = data?.data ?? []
  const totalPages = data?.totalPages ?? 1

  return (
    <Modal open={open} onClose={onClose} title={t('inv.historyTitle')} className="modal-lg">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{product.name}</span>
        <div style={{ maxWidth: 200 }}>
          <Select value={type} onChange={(e) => { setType(e.target.value as StockMovementType | ''); setPage(1) }}>
            <option value="">{t('inv.allTypes')}</option>
            {TYPES.map((tp) => (
              <option key={tp} value={tp}>{t(`pdv.mv_${tp}` as Parameters<typeof t>[0])}</option>
            ))}
          </Select>
        </div>
      </div>

      {isPending ? (
        <div className="hint" style={{ padding: 20, textAlign: 'center' }}>{t('inv.loading')}</div>
      ) : rows.length === 0 ? (
        <div className="hint" style={{ padding: 20, textAlign: 'center' }}>{t('pdv.noMovements')}</div>
      ) : (
        <table className="ltbl">
          <thead>
            <tr>
              <th>{t('pdv.mvDate')}</th>
              <th>{t('pdv.mvMovement')}</th>
              <th>{t('pdv.mvReference')}</th>
              <th className="right">{t('pdv.mvChange')}</th>
              <th className="right">{t('pdv.mvBalance')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const positive = m.quantityChange >= 0
              return (
                <tr key={m.id}>
                  <td className="num">{formatMovementDate(m.createdAt)}</td>
                  <td><span className={`et ${MV_PILL[m.type] ?? 'et-sale'}`}>{t(`pdv.mv_${m.type}` as Parameters<typeof t>[0])}</span></td>
                  <td>{m.type === 'OPENING_STOCK' ? t('pdv.mvInitial') : m.notes || t('pdv.none')}</td>
                  <td className={`right ${positive ? 't-credit' : 't-debit'}`}>{positive ? '+' : '−'}{Math.abs(m.quantityChange)}</td>
                  <td className="right t-bal">{m.quantityAfter}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {totalPages > 1 ? (
        <div className="panel-foot" style={{ borderTop: 0, paddingLeft: 0, paddingRight: 0 }}>
          <span>{t('inv.pageOf').replace('{p}', String(page)).replace('{n}', String(totalPages))}</span>
          <div className="spacer" />
          <Button variant="soft" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t('inv.prev')}</Button>
          <Button variant="soft" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>{t('inv.next')}</Button>
        </div>
      ) : null}
    </Modal>
  )
}
