'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ApiError, useAdminApi } from '@/lib/api'
import { useAdmin } from '@/lib/use-admin'
import type { MetricsOverview, MrrHistory, RevenueBreakdown, RevenueMetrics } from '@/lib/types'

const xaf = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' XAF'

export default function RevenuePage() {
  const api = useAdminApi()
  const { can, status } = useAdmin()
  const canRevenue = can('revenue:view')

  const [overview, setOverview] = useState<MetricsOverview | null>(null)
  const [revenue, setRevenue] = useState<RevenueMetrics | null>(null)
  const [history, setHistory] = useState<MrrHistory | null>(null)
  const [breakdown, setBreakdown] = useState<RevenueBreakdown | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const overview = await api.get<MetricsOverview>('/admin/metrics/overview')
      setOverview(overview)
      if (canRevenue) {
        const [rev, hist, brk] = await Promise.all([
          api.get<RevenueMetrics>('/admin/metrics/revenue?period=30d'),
          api.get<MrrHistory>('/admin/metrics/mrr-history?period=30d'),
          api.get<RevenueBreakdown>('/admin/metrics/revenue/breakdown'),
        ])
        setRevenue(rev)
        setHistory(hist)
        setBreakdown(brk)
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to load metrics.')
    } finally {
      setLoading(false)
    }
  }, [api, canRevenue])

  useEffect(() => {
    if (status === 'authenticated') void load()
  }, [status, load])

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm uppercase tracking-[0.24em] text-neutral-500">Platform</p>
        <h1 className="text-3xl font-semibold">Revenue &amp; metrics</h1>
      </header>

      {/* Platform stat cards (visible to everyone with metrics:view) */}
      {overview && (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Total businesses"
            value={String(overview.growth.totalBusinesses)}
            sub={`+${overview.growth.newBusinessesThisMonth} this month`}
          />
          <Stat
            label="Active today"
            value={String(overview.engagement.activeToday)}
            sub={`${overview.engagement.activeLast7Days} in 7 days`}
          />
          <Stat
            label="Open tickets"
            value={String(overview.health.openSupportTickets)}
            sub={`${overview.health.criticalTickets} critical`}
          />
          <Stat
            label="Sync errors"
            value={String(overview.health.syncErrorCount)}
            sub="businesses affected"
          />
        </section>
      )}

      {!canRevenue && (
        <p className="rounded-2xl border border-neutral-200 bg-white p-5 text-sm text-neutral-500">
          Revenue figures are hidden — your role does not include <code>revenue:view</code>.
        </p>
      )}

      {canRevenue && revenue && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="MRR" value={xaf(revenue.mrr)} highlight />
            <Stat label="ARR" value={xaf(revenue.arr)} />
            <Stat
              label="Active subscribers"
              value={String(revenue.activeSubscribers)}
              sub={`ARPU ${xaf(revenue.arpu)}`}
            />
            <Stat
              label="Trials"
              value={String(revenue.trialCount)}
              sub={`${revenue.trialConversionRate}% conv · ${revenue.churnRate}% churn`}
            />
          </section>

          {history && (
            <section className="rounded-2xl border border-neutral-200 bg-white p-5">
              <p className="mb-4 text-sm font-medium text-neutral-700">MRR — last 30 days</p>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={history.points}
                    margin={{ left: 10, right: 10, top: 5, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(d) => String(d).slice(5)}
                      minTickGap={24}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                      width={40}
                    />
                    <Tooltip formatter={(v) => xaf(Number(v))} />
                    <Area
                      type="monotone"
                      dataKey="mrr"
                      stroke="#111"
                      fill="#111"
                      fillOpacity={0.08}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {breakdown && (
            <section className="rounded-2xl border border-neutral-200 bg-white p-5">
              <p className="mb-4 text-sm font-medium text-neutral-700">Revenue by plan</p>
              {breakdown.breakdown.length === 0 ? (
                <p className="text-sm text-neutral-500">No active paid subscriptions.</p>
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={breakdown.breakdown}
                      margin={{ left: 10, right: 10, top: 5, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis dataKey="plan" tick={{ fontSize: 11 }} />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                        width={40}
                      />
                      <Tooltip formatter={(v) => xaf(Number(v))} />
                      <Bar dataKey="revenue" fill="#111" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>
          )}

          <p className="text-xs italic text-neutral-400">{revenue.caveat}</p>
        </>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  sub,
  highlight,
}: {
  label: string
  value: string
  sub?: string
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${highlight ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white'}`}
    >
      <p className={`text-sm ${highlight ? 'text-neutral-300' : 'text-neutral-500'}`}>{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {sub && (
        <p className={`mt-1 text-xs ${highlight ? 'text-neutral-400' : 'text-neutral-400'}`}>
          {sub}
        </p>
      )}
    </div>
  )
}
