// ─────────────────────────────────────────────────────────────────────────────
// apps/desktop/src/components/reports/shared/ReportWrapper.tsx
//
// The outer shell every report is wrapped in.
// Usage:
//   <ReportWrapper business={bizInfo} meta={reportMeta} onExportPdf={handleExport}>
//     <ProfitAndLossBody data={data} />
//   </ReportWrapper>
// ─────────────────────────────────────────────────────────────────────────────

'use client'

import { ReactNode } from 'react'
import { ReportHeader } from './ReportHeader'
import { ReportFooter } from './ReportFooter'
import { BusinessInfo, ReportMeta } from './ReportTypes'

interface ReportWrapperProps {
  business: BusinessInfo
  meta: ReportMeta
  children: ReactNode
  /** Called when the user clicks Export PDF */
  onExportPdf?: () => void
  /** Called when the user clicks Export Excel */
  onExportExcel?: () => void
  /** Called when the user clicks Share via WhatsApp */
  onShareWhatsApp?: () => void
  /** Show export action bar above the report. Default: true */
  showActions?: boolean
}

export function ReportWrapper({
  business,
  meta,
  children,
  onExportPdf,
  onExportExcel,
  onShareWhatsApp,
  showActions = true,
}: ReportWrapperProps) {
  return (
    <div className="report-wrapper">

      {/* ── Export actions — above the document ── */}
      {showActions && (
        <div className="report-actions" aria-label="Report export options">
          {onExportPdf && (
            <button className="report-action-btn" onClick={onExportPdf}>
              <i className="ti ti-download" aria-hidden="true" />
              Export PDF
            </button>
          )}
          {onExportExcel && (
            <button className="report-action-btn" onClick={onExportExcel}>
              <i className="ti ti-table-export" aria-hidden="true" />
              Export Excel
            </button>
          )}
          {onShareWhatsApp && (
            <button className="report-action-btn report-action-btn--primary" onClick={onShareWhatsApp}>
              <i className="ti ti-brand-whatsapp" aria-hidden="true" />
              Share via WhatsApp
            </button>
          )}
        </div>
      )}

      {/* ── The printable document ── */}
      <div className="report-document" id="report-document">
        <ReportHeader business={business} meta={meta} />

        {/*
          The dynamic body.
          Each of the 16 reports renders its own body here.
          The body must NOT include its own header or footer —
          those are handled exclusively by this wrapper.
        */}
        <div className="report-body">
          {children}
        </div>

        <ReportFooter business={business} meta={meta} />
      </div>

    </div>
  )
}
