'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLocale } from 'next-intl'
import { ChevronLeft, ChevronRight, Loader2, ShoppingBag } from 'lucide-react'
import type {
  OnlineOrder,
  OnlineOrderDetail,
  OnlineOrderStatus,
  UpdateOrderStatusRequest,
} from '@biztrack/types'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth.store'
import { getApiErrorMessage } from '@/services/api-response'
import {
  getOnlineOrder,
  listOnlineOrders,
  updateOnlineOrderStatus,
} from '@/services/online-orders.api'
import { formatCurrency } from '../../_components/dashboard.shared'
import { ORDER_STATUS_META, PAYMENT_STATUS_META, STATUS_FILTERS } from './order-status'
import { OrderDetailDrawer } from './_components/OrderDetailDrawer'

const PAGE_SIZE = 25

export default function OnlineOrdersPage() {
  const locale = useLocale()
  const localeTag = locale.startsWith('fr') ? 'fr-CM' : 'en-GB'
  const currency = useAuthStore((state) => state.businessCurrency)

  const [filter, setFilter] = useState<OnlineOrderStatus | 'ALL'>('ALL')
  const [page, setPage] = useState(1)
  const [orders, setOrders] = useState<OnlineOrder[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // detail drawer
  const [selected, setSelected] = useState<OnlineOrderDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await listOnlineOrders({
        status: filter === 'ALL' ? undefined : filter,
        page,
        limit: PAGE_SIZE,
      })
      setOrders(result.data)
      setTotal(result.total)
      setTotalPages(Math.max(result.totalPages, 1))
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not load online orders. Check your connection.'))
    } finally {
      setLoading(false)
    }
  }, [filter, page])

  useEffect(() => {
    void load()
  }, [load])

  const openDetail = async (id: string) => {
    setDetailLoading(true)
    setSelected({ id } as OnlineOrderDetail)
    try {
      setSelected(await getOnlineOrder(id))
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not load the order.'))
      setSelected(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleUpdateStatus = async (id: string, payload: UpdateOrderStatusRequest) => {
    setBusy(true)
    setError(null)
    try {
      const updated = await updateOnlineOrderStatus(id, payload)
      setSelected(updated)
      await load()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not update the order status.'))
    } finally {
      setBusy(false)
    }
  }

  const changeFilter = (value: OnlineOrderStatus | 'ALL') => {
    setFilter(value)
    setPage(1)
  }

  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return '—'
    const date = new Date(iso)
    return Number.isNaN(date.getTime())
      ? '—'
      : date.toLocaleString(localeTag, { dateStyle: 'medium', timeStyle: 'short' })
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <ShoppingBag className="h-5 w-5" /> Online orders
        </h1>
        <p className="text-sm text-muted-foreground">
          Orders placed on your BizTrack Online store. Confirm, prepare, dispatch and mark them
          delivered — the sale is recorded when delivered and paid. Requires an internet connection.
        </p>
      </header>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => changeFilter(tab.value)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              filter === tab.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {/* Orders table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : orders.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No orders here yet.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-medium">Order</th>
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2 font-medium">Payment</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => openDetail(order.id)}
                  className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-muted/40"
                >
                  <td className="px-4 py-2.5 font-medium text-foreground">{order.orderNumber}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    <span className="block text-foreground">{order.customerName}</span>
                    {order.customerPhone ? (
                      <span className="text-xs">{order.customerPhone}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{formatDate(order.createdAt)}</td>
                  <td className="px-4 py-2.5 text-right text-foreground">
                    {formatCurrency(order.totalAmount, localeTag, currency)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                        PAYMENT_STATUS_META[order.paymentStatus].pill,
                      )}
                    >
                      {PAYMENT_STATUS_META[order.paymentStatus].label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                        ORDER_STATUS_META[order.status].pill,
                      )}
                    >
                      {ORDER_STATUS_META[order.status].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && total > 0 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {total} order{total === 1 ? '' : 's'} · page {page} of {totalPages}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page <= 1}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:bg-muted disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              disabled={page >= totalPages}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:bg-muted disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      {selected ? (
        <OrderDetailDrawer
          order={detailLoading ? null : selected}
          loading={detailLoading}
          busy={busy}
          localeTag={localeTag}
          currency={currency}
          onClose={() => setSelected(null)}
          onUpdateStatus={handleUpdateStatus}
        />
      ) : null}
    </div>
  )
}
