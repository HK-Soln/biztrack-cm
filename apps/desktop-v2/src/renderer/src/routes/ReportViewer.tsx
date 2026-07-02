import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { renderReportDocumentHtml, reportLabels } from '@biztrack/templates'
import type { ReportBusiness } from '@biztrack/types'
import { dataClient } from '@/lib/data-client'
import { useCurrency } from '@/lib/currency'
import { useLangStore, useT } from '@/i18n'
import { useSessionStore } from '@/stores/session.store'
import { LOADERS, REPORTS, REPORT_CATEGORIES, isRoutable, reportById } from '@/components/reports/registry'
import { periodLabel, rangeFor, type ReportPeriodKey } from '@/components/reports/period'

const PERIODS: ReportPeriodKey[] = ['month', 'quarter', 'year']

const I = {
  search: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="9" cy="9" r="6" /><path d="m14 14 3 3" /></svg>,
  csv: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 3h9l5 5v13H6z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg>,
  print: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 9V3h12v6M6 18H4v-6h16v6h-2M8 14h8v7H8z" /></svg>,
  pdf: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></svg>,
  doc: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}><path d="M6 3h9l5 5v13H6z" /><path d="M14 3v6h6" /></svg>,
  expand: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M8 3H3v5M21 8V3h-5M3 16v5h5M16 21h5v-5" /></svg>,
  x: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6 6 18" /></svg>,
}

function download(name: string, text: string, mime: string) {
  const blob = new Blob(['﻿' + text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(url)
    a.remove()
  }, 500)
}

export function ReportViewer() {
  const t = useT()
  const money = useCurrency()
  const lang = useLangStore((s) => s.lang)
  const fr = lang.startsWith('fr')
  const navigate = useNavigate()
  const { reportId } = useParams()
  const [params, setParams] = useSearchParams()
  const businessName = useSessionStore((s) => s.status.businessName) || 'BizTrack'

  const id = reportId ?? null
  const meta = id ? reportById(id) : undefined
  const routable = !!id && isRoutable(id)
  const period = (params.get('period') as ReportPeriodKey) || 'month'
  const setPeriod = (p: ReportPeriodKey) =>
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        n.set('period', p)
        return n
      },
      { replace: true },
    )

  const [search, setSearch] = useState('')
  const range = useMemo(() => rangeFor(period), [period])
  const label = periodLabel(period, lang)

  // Real business profile → the shared report letterhead.
  const profile = useQuery({ queryKey: ['business', 'profile'], queryFn: () => dataClient.business.getProfile() })
  const business = useMemo<ReportBusiness>(() => {
    const p = profile.data
    return {
      name: p?.name || businessName,
      activity: p?.description ?? undefined,
      address: p?.address ?? undefined,
      city: p?.city ?? undefined,
      phone: p?.phone ?? undefined,
      email: p?.email ?? undefined,
      logoUrl: p?.logoUrl ?? undefined,
    }
  }, [profile.data, businessName])

  // Overview KPIs (shown when no report is selected).
  const kpi = {
    sales: useQuery({ queryKey: ['reports', 'kpi-sales', range], queryFn: () => dataClient.sales.summary(range), enabled: !routable }),
    expenses: useQuery({ queryKey: ['reports', 'kpi-exp', range], queryFn: () => dataClient.expenses.summary(range), enabled: !routable }),
    contacts: useQuery({ queryKey: ['reports', 'kpi-contacts'], queryFn: () => dataClient.contacts.summary(), enabled: !routable }),
  }
  const revenue = kpi.sales.data?.revenue ?? 0
  const spend = kpi.expenses.data?.total ?? 0

  // Selected report.
  const report = useQuery({
    queryKey: ['report', id, range, lang, business],
    queryFn: () =>
      LOADERS[id!]!({
        client: dataClient,
        range,
        currency: money.currency,
        opts: { business, periodLabel: label, generatedAt: new Date().toISOString(), locale: lang, currency: money.currency },
      }),
    enabled: routable,
  })
  const html = useMemo(
    () => (report.data ? renderReportDocumentHtml(report.data.document, { labels: reportLabels(lang), locale: lang }) : ''),
    [report.data, lang],
  )

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const fsRef = useRef<HTMLDivElement>(null)
  const fsIframeRef = useRef<HTMLIFrameElement>(null)
  const [busy, setBusy] = useState(false)
  const [fs, setFs] = useState(false)
  const canCsv = routable && !!meta?.formats.includes('csv') && !!report.data?.csv
  const closeFs = () => {
    setFs(false)
    if (typeof document !== 'undefined' && document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  }

  const select = (rid: string) => {
    if (isRoutable(rid)) navigate(`/reports/${rid}?period=${period}`)
  }
  const exportPdf = async () => {
    if (!html || busy) return
    setBusy(true)
    try {
      await dataClient.documents.downloadHtmlPdf(html, `${id}-${period}.pdf`)
    } finally {
      setBusy(false)
    }
  }
  const print = () => (fs ? fsIframeRef : iframeRef).current?.contentWindow?.print()
  const exportCsv = () => {
    if (report.data?.csv) download(`${id}-${period}.csv`, report.data.csv, 'text/csv;charset=utf-8;')
  }

  const grouped = useMemo(() => {
    const s = search.trim().toLowerCase()
    return REPORT_CATEGORIES.map((cat) => ({
      cat,
      reps: REPORTS.filter((r) => r.cat === cat.key && (!s || `${r.name} ${r.fr}`.toLowerCase().includes(s))),
    })).filter((g) => g.reps.length)
  }, [search])

  // Enter real OS fullscreen when the modal opens (best-effort — the DOM overlay fills
  // the window regardless). Keep app state in sync when the user exits fullscreen.
  useEffect(() => {
    if (fs) void fsRef.current?.requestFullscreen?.().catch(() => {})
  }, [fs])
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFs(false)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  // F11 toggles fullscreen for the open report; Esc closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault()
        if (fs) closeFs()
        else if (routable && html) setFs(true)
      } else if (e.key === 'Escape' && fs) {
        closeFs()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fs, routable, html])

  return (
    <>
    <div className="rv-layout">
        {/* picker */}
        <div className="rv-picker">
          <div className="rv-search">
            {I.search}
            <input placeholder={t('reports.searchPh')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button type="button" className="rv-item" aria-current={!id ? 'true' : 'false'} onClick={() => navigate(`/reports?period=${period}`)}>
            <span className="nm">{t('reports.overview')}<small>{t('reports.overviewSub')}</small></span>
          </button>
          {grouped.map(({ cat, reps }) => (
            <div key={cat.key}>
              <div className="rv-cat">{fr ? cat.fr : cat.label}{cat.tag ? ` · ${cat.tag}` : ''}</div>
              {reps.map((r) => {
                const on = r.built && !!LOADERS[r.id]
                return (
                  <button key={r.id} type="button" className="rv-item" disabled={!on} aria-current={r.id === id ? 'true' : 'false'} onClick={() => select(r.id)} style={!on ? { cursor: 'default' } : undefined}>
                    <span className="nm">{fr ? r.fr : r.name}<small>{fr ? r.descFr : r.desc}</small></span>
                    <span className={`fmt${on ? '' : ' soon'}`}>{on ? r.formats.map((f) => f.toUpperCase()).join('·') : t('reports.soonTag')}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* stage */}
        <div className="rv-stage">
          <div className="rv-toolbar">
            <div className="tt">
              <div className="h">{meta ? (fr ? meta.fr : meta.name) : t('reports.overview')}</div>
              <div className="s">{label}</div>
            </div>
            <span className="seg2">
              {PERIODS.map((p) => (
                <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}>{t(`reports.${p}` as Parameters<typeof t>[0])}</button>
              ))}
            </span>
            {routable ? (
              <>
                {canCsv ? <button type="button" className="btn" onClick={exportCsv}>{I.csv}CSV</button> : null}
                <button type="button" className="btn" onClick={print} disabled={!html}>{I.print}{t('reports.print')}</button>
                <button type="button" className="btn btn-primary" onClick={() => void exportPdf()} disabled={!html || busy}>{I.pdf}{busy ? '…' : t('reports.exportPdf')}</button>
                <button type="button" className="btn" onClick={() => setFs(true)} disabled={!html} title={t('reports.fullscreen')}>{I.expand}</button>
              </>
            ) : null}
          </div>

          <div className="rv-body">
          {!id ? (
            <div className="rv-overview">
              <div className="sec-label">{label} · {t('reports.glance')}</div>
              <div className="grid4 mb20">
                <div className="kpi"><div className="lab">{t('reports.kRevenue')}</div><div className="val">{money.compact(revenue)}</div><div className="hint">{t('reports.hSales').replace('{n}', String(kpi.sales.data?.transactions ?? 0))}</div></div>
                <div className="kpi"><div className="lab">{t('reports.kExpenses')}</div><div className="val">{money.compact(spend)}</div><div className="hint">{t('reports.hEntries').replace('{n}', String(kpi.expenses.data?.count ?? 0))}</div></div>
                <div className="kpi"><div className="lab">{t('reports.kOperating')}</div><div className="val">{money.compact(revenue - spend)}</div><div className="hint">{t('reports.hOperating')}</div></div>
                <div className="kpi"><div className="lab">{t('reports.kReceivable')}</div><div className="val">{money.compact(kpi.contacts.data?.totalReceivable ?? 0)}</div><div className="hint">{t('reports.hDebtors').replace('{n}', String(kpi.contacts.data?.debtorCount ?? 0))}</div></div>
              </div>
              <div className="rv-soon"><div className="ic">{I.doc}</div><h3>{t('reports.pickTitle')}</h3><p>{t('reports.pickBody')}</p></div>
            </div>
          ) : !routable ? (
            <div className="rv-soon"><div className="ic">{I.doc}</div><h3>{t('reports.soonTitle')}</h3><p>{t('reports.soonBody')}</p></div>
          ) : report.isError ? (
            <div className="rv-soon"><h3>{t('reports.loadError')}</h3><p>{t('reports.loadErrorBody')}</p></div>
          ) : report.isPending || !html ? (
            <div className="rv-soon"><p>{t('reports.loading')}</p></div>
          ) : (
            <div className="rv-paper"><iframe ref={iframeRef} srcDoc={html} title={meta ? meta.name : 'report'} /></div>
          )}
          </div>
        </div>
      </div>

      {fs && html ? (
        <div className="rv-fs" ref={fsRef}>
          <div className="rv-fs-bar">
            <div className="rv-fs-title">{meta ? (fr ? meta.fr : meta.name) : ''} · {label}</div>
            <div className="rv-fs-actions">
              {canCsv ? <button type="button" className="btn" onClick={exportCsv}>{I.csv}CSV</button> : null}
              <button type="button" className="btn" onClick={print}>{I.print}{t('reports.print')}</button>
              <button type="button" className="btn btn-primary" onClick={() => void exportPdf()} disabled={busy}>{I.pdf}{busy ? '…' : t('reports.exportPdf')}</button>
              <button type="button" className="btn" onClick={closeFs}>{I.x}{t('reports.exitFs')}</button>
            </div>
          </div>
          <div className="rv-fs-body"><iframe ref={fsIframeRef} srcDoc={html} title="report-fullscreen" /></div>
        </div>
      ) : null}
    </>
  )
}
