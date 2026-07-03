import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Pagination } from '@biztrack/ui/biztrack'
import { PurchaseOrderStatus } from '@biztrack/types'
import { dataClient } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { usePaged } from '@/lib/usePaged'
import { useCurrency } from '@/lib/currency'
import { useT } from '@/i18n'
import { useBreakpoint } from '@/lib/useBreakpoint'
import { DetailDrawer } from '@/components/DetailDrawer'
import { PoDetailBody } from '@/components/procurement/PoDetailBody'
import type { LocalPurchaseOrderListItem } from '@shared/ipc'

const STATUS_CLASS: Record<string, string> = {
  DRAFT: 'st-neutral',
  SENT: 'st-brand',
  CONFIRMED: 'st-brand',
  PARTIALLY_RECEIVED: 'st-low',
  RECEIVED: 'st-ok',
  CANCELLED: 'st-out',
}

export function PurchaseOrders() {
  const t = useT()
  const bp = useBreakpoint()
  const money = useCurrency()
  const navigate = useNavigate()

  const [openId, setOpenId] = useState<string | null>(null)

  const { items, total, page, limit, totalPages, isPending, search, setSearch, setPage } = usePaged<LocalPurchaseOrderListItem>(
    queryKeys.purchaseOrders,
    (q) => dataClient.purchaseOrders.list(q),
    { enabled: true },
  )

  const statusPill = (s: PurchaseOrderStatus) => <span className={`st ${STATUS_CLASS[s] ?? 'st-neutral'}`}>{t(`po.status_${s}` as Parameters<typeof t>[0])}</span>

  return (
    <div className="frame">
      <div className="page-head">
        <div>
          <h1>{t('po.title')}</h1>
          <p>{t('po.subtitle')}</p>
        </div>
        <Button variant="primary" onClick={() => navigate('/purchasing/orders/new')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M5 12h14" /></svg>
          {t('po.new')}
        </Button>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>{t('po.all')}</h3>
          <div className="spacer" style={{ flex: 1 }} />
          <Input value={search} placeholder={t('po.search')} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 230, height: 36 }} />
        </div>

        {isPending ? (
          <div className="cat-empty">{t('po.loading')}</div>
        ) : items.length === 0 ? (
          <div className="cat-empty">{t('po.empty')}</div>
        ) : bp === 'mobile' ? (
          <div className="u-cards">
            {items.map((p) => (
              <div key={p.id} className="u-card clickable" onClick={() => navigate(`/purchasing/orders/${p.id}`)}>
                <div className="u-main">
                  <div className="u-nm">{p.number}{p.supplierName ? ` · ${p.supplierName}` : ''}</div>
                  <div className="u-sub" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {statusPill(p.status)}
                    <span className="num">{money.format(p.totalAmount)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <table className="utbl">
            <thead>
              <tr>
                <th>{t('po.colNumber')}</th>
                <th>{t('po.colSupplier')}</th>
                <th>{t('po.colStatus')}</th>
                <th className="right">{t('po.colReceived')}</th>
                <th className="right">{t('po.colTotal')}</th>
                <th>{t('po.colDate')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="clickable" onClick={() => setOpenId(p.id)}>
                  <td><div className="nm">{p.number}</div>{p.title ? <div className="sub">{p.title}</div> : null}</td>
                  <td>{p.supplierName ?? '—'}</td>
                  <td>{statusPill(p.status)}</td>
                  <td className="right num">{Math.round(p.receivedRatio * 100)}%</td>
                  <td className="right num">{money.format(p.totalAmount)}</td>
                  <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalPages={totalPages} total={total} limit={limit} onPage={setPage} prevLabel={t('common.prev')} nextLabel={t('common.next')} />
      </div>

      {/* Tablet/desktop open the PO in a side drawer; mobile navigates to the route. */}
      <DetailDrawer openId={openId} onClose={() => setOpenId(null)}>
        {(id) => <PoDetailBody id={id} />}
      </DetailDrawer>
    </div>
  )
}
