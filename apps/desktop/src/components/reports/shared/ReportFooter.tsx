// ─────────────────────────────────────────────────────────────────────────────
// apps/desktop/src/components/reports/shared/ReportFooter.tsx
//
// OHADA-compliant report footer. Used by all 16 report templates.
// ─────────────────────────────────────────────────────────────────────────────

import { BusinessInfo, ReportMeta } from './ReportTypes'

interface ReportFooterProps {
  business: BusinessInfo
  meta: ReportMeta
}

export function ReportFooter({ business, meta }: ReportFooterProps) {
  const currentPage = meta.currentPage ?? 1
  const totalPages  = meta.totalPages  ?? 1

  return (
    <div className="report-footer">

      {/* ── Notes block ── */}
      <div className="rf-notes">
        <p className="rf-notes-heading">Notes &amp; assumptions</p>
        <ol className="rf-notes-list">
          {meta.notes.map((note, i) => (
            <li key={i} className="rf-note-item">{note}</li>
          ))}
        </ol>
      </div>

      {/* ── Identity bar: business LEFT, page number CENTRE, report ID RIGHT ── */}
      <div className="rf-bar">
        <div className="rf-bar-left">
          <strong>{business.name}</strong>
          <br />
          RCCM: {business.rccm} · NIU: {business.niu}
        </div>

        <div className="rf-bar-centre">
          <span className="rf-page-pill" aria-label={`Page ${currentPage} of ${totalPages}`}>
            Page {currentPage} of {totalPages}
          </span>
        </div>

        <div className="rf-bar-right">
          <strong>{meta.reportId}</strong>
          <br />
          BizTrack CM · {new Date(meta.generatedAt).getFullYear()}
        </div>
      </div>

      {/* ── Compliance strip ── */}
      <div className="rf-compliance">
        <span className="rf-compliance-text">
          Confidential — internal use only ·
          This report does not constitute statutory accounts.
          Consult a qualified accountant (Expert-Comptable) for DGI filing and statutory purposes.
        </span>
        <span className="rf-compliance-ref">{meta.syscohadaRef}</span>
      </div>

    </div>
  )
}
