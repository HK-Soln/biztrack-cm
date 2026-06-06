// ─────────────────────────────────────────────────────────────────────────────
// apps/desktop/src/components/reports/shared/ReportHeader.tsx
//
// OHADA-compliant report header. Used by all 16 report templates.
// Receives BusinessInfo (static, fetched once) and ReportMeta (per-report).
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react'
import { BusinessInfo, ReportMeta } from './ReportTypes'

interface ReportHeaderProps {
  business: BusinessInfo
  meta: ReportMeta
}

function formatGenerated(date: Date): string {
  const d = date.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    timeZone: 'Africa/Douala',
  })
  const t = date.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Africa/Douala',
  })
  return `Generated: ${d} · ${t} WAT`
}

function legalLine(business: BusinessInfo): string {
  const forms: Record<string, string> = {
    SARL: 'Société à Responsabilité Limitée',
    SA:   'Société Anonyme',
    SNC:  'Société en Nom Collectif',
    'Entreprise individuelle': 'Entreprise individuelle',
  }
  const longForm = forms[business.legalForm] ?? business.legalForm
  if (business.capital) return `${longForm} au capital de ${business.capital}`
  return longForm
}

export function ReportHeader({ business, meta }: ReportHeaderProps) {
  return (
    <div className="report-header">

      {/* ── Top bar: business info LEFT, report identity RIGHT ── */}
      <div className="rh-top">
        <div className="rh-biz">
          <p className="rh-biz-name">{business.name}</p>
          <p className="rh-biz-legal">{legalLine(business)}</p>
          <div className="rh-biz-meta">
            <span className="rh-biz-tag">
              <i className="ti ti-building" aria-hidden="true" />
              RCCM: {business.rccm}
            </span>
            <span className="rh-biz-tag">
              <i className="ti ti-file-invoice" aria-hidden="true" />
              NIU: {business.niu}
            </span>
            <span className="rh-biz-tag">
              <i className="ti ti-map-pin" aria-hidden="true" />
              {business.address}
            </span>
            <span className="rh-biz-tag">
              <i className="ti ti-phone" aria-hidden="true" />
              {business.phone}
            </span>
          </div>
        </div>

        <div className="rh-report">
          <p className="rh-report-category">{meta.category}</p>
          {/*
            Title can contain \n for a two-line display.
            e.g. 'Profit & Loss\nStatement'
          */}
          <h2 className="rh-report-title">
            {meta.title.split('\n').map((line, i) => (
              <React.Fragment key={i}>
                {line}
                {i < meta.title.split('\n').length - 1 && <br />}
              </React.Fragment>
            ))}
          </h2>
          <p className="rh-report-period">{meta.period}</p>
          <p className="rh-report-gen">{formatGenerated(meta.generatedAt)}</p>
        </div>
      </div>

      {/* ── Metadata strip: 4 cells ── */}
      <div className="rh-strip">
        <div className="rh-strip-cell">
          <span className="rh-strip-label">Currency</span>
          <span className="rh-strip-value">XAF (FCFA)</span>
        </div>
        <div className="rh-strip-cell">
          <span className="rh-strip-label">Fiscal period</span>
          <span className="rh-strip-value">{meta.periodShort}</span>
        </div>
        <div className="rh-strip-cell">
          <span className="rh-strip-label">{meta.stripLabel3}</span>
          <span className="rh-strip-value">{meta.stripValue3}</span>
        </div>
        <div className="rh-strip-cell rh-strip-cell--last">
          <span className="rh-strip-label">{meta.stripLabel4}</span>
          <span className="rh-strip-value">{meta.stripValue4}</span>
        </div>
      </div>

      {/* ── OHADA compliance badge ── */}
      <div className="rh-ohada">
        <span className="rh-ohada-text">
          <i className="ti ti-certificate" aria-hidden="true" />
          Prepared in accordance with SYSCOHADA Révisé (OHADA Uniform Act on Accounting Law,
          Acte Uniforme relatif au Droit Comptable et à l&apos;Information Financière)
        </span>
        <span className="rh-ohada-brand">
          <span className="rh-ohada-dot" aria-hidden="true" />
          BizTrack CM · biztrack.cm
        </span>
      </div>

    </div>
  )
}
