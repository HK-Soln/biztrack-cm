/**
 * Self-contained CSS for PDF export.
 * Inlined into the HTML document sent to ipc.documents.exportPdf so the
 * Electron PDF renderer does not need to load any external stylesheets.
 * CSS variables are defined in :root so they resolve correctly in the
 * standalone HTML document.
 */
export const REPORT_PDF_CSS = `
* { box-sizing: border-box; }
body { margin: 0; color-scheme: light; font-family: Arial, sans-serif; }

:root {
  --color-text-primary: #1F1E1C;
  --color-text-secondary: #8C8980;
  --color-background-primary: #FFFFFF;
  --color-background-secondary: #F8F7F4;
  --color-background-tertiary: #EFEDE8;
  --color-border-primary: #D9D6CF;
  --color-border-secondary: #D9D6CF;
  --color-border-tertiary: #ECE8DF;
}

.report-wrapper {
  font-family: Arial, sans-serif;
  color: var(--color-text-primary);
  max-width: 800px;
  margin: 0 auto;
}

.report-actions { display: none !important; }

.report-document {
  background: var(--color-background-primary);
  border: none;
  border-radius: 0;
  overflow: hidden;
}

/* HEADER */
.rh-top {
  background: #0F6E56;
  padding: 1.375rem 1.75rem 1.25rem;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 1.5rem;
  align-items: start;
}
.rh-biz-name { font-size: 18px; font-weight: 500; color: #ffffff; margin: 0 0 3px; letter-spacing: -0.01em; }
.rh-biz-legal { font-size: 11px; color: #9FE1CB; margin: 0 0 8px; }
.rh-biz-meta { display: flex; flex-wrap: wrap; gap: 5px 14px; }
.rh-biz-tag { font-size: 10px; color: rgba(255,255,255,0.72); display: flex; align-items: center; gap: 4px; }
.rh-report { text-align: right; }
.rh-report-category { font-size: 9px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.14em; color: #9FE1CB; margin: 0 0 4px; }
.rh-report-title { font-size: 15px; font-weight: 500; color: #ffffff; margin: 0 0 5px; line-height: 1.2; }
.rh-report-period { font-size: 11px; color: rgba(255,255,255,0.78); margin: 0 0 3px; }
.rh-report-gen { font-size: 10px; color: rgba(255,255,255,0.48); margin: 0; }

.rh-strip { display: grid; grid-template-columns: repeat(4,1fr); border-top: 0.5px solid rgba(159,225,203,0.2); }
.rh-strip-cell { padding: 0.5rem 1rem; border-right: 0.5px solid var(--color-border-tertiary); display: flex; flex-direction: column; gap: 3px; }
.rh-strip-cell--last { border-right: none; }
.rh-strip-label { font-size: 9px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.12em; color: var(--color-text-secondary); }
.rh-strip-value { font-size: 11px; font-weight: 500; color: var(--color-text-primary); }

.rh-ohada { background: var(--color-background-secondary); border-top: 0.5px solid var(--color-border-tertiary); padding: 0.375rem 1rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
.rh-ohada-text { font-size: 10px; color: var(--color-text-secondary); display: flex; align-items: center; gap: 5px; }
.rh-ohada-brand { font-size: 10px; font-weight: 500; color: var(--color-text-primary); display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.rh-ohada-dot { width: 6px; height: 6px; border-radius: 50%; background: #1D9E75; display: inline-block; flex-shrink: 0; }

/* BODY */
.report-body { padding: 1.5rem 1.75rem; border-top: 0.5px solid var(--color-border-tertiary); border-bottom: 0.5px solid var(--color-border-tertiary); }

.report-section-hdr { font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.13em; color: #0F6E56; padding: 0.5rem 0; border-bottom: 1.5px solid #0F6E56; margin-bottom: 0.875rem; margin-top: 1.5rem; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.report-section-hdr:first-child { margin-top: 0; }

.report-kpi-strip { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin-bottom: 1.5rem; }
.report-kpi-cell { background: var(--color-background-secondary); border: 0.5px solid var(--color-border-tertiary); border-radius: 8px; padding: 0.75rem 1rem; }
.report-kpi-label { font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.1em; color: var(--color-text-secondary); margin-bottom: 4px; }
.report-kpi-value { font-size: 18px; font-weight: 500; font-family: 'Courier New', monospace; color: var(--color-text-primary); }
.report-kpi-sub { font-size: 10px; color: var(--color-text-secondary); margin-top: 2px; }

.report-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 1.5rem; table-layout: fixed; }
.report-table thead tr { background: var(--color-background-secondary); border-bottom: 1.5px solid var(--color-border-secondary); }
.report-table th { font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-text-secondary); padding: 0.5rem 0.75rem; text-align: left; white-space: nowrap; }
.report-table th.r { text-align: right; }
.report-table td { padding: 0.5rem 0.75rem; border-bottom: 0.5px solid var(--color-border-tertiary); color: var(--color-text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.report-table td.r { text-align: right; font-family: 'Courier New', monospace; }
.report-table tr:last-child td { border-bottom: none; }
.report-table tfoot td { background: var(--color-background-secondary); border-top: 1.5px solid var(--color-border-secondary); font-weight: 500; padding: 0.5rem 0.75rem; }
.report-table tfoot td.r { text-align: right; font-family: 'Courier New', monospace; }

.report-line-row { display: grid; grid-template-columns: 1fr 140px 120px; align-items: center; padding: 0.35rem 0; border-bottom: 0.5px solid var(--color-border-tertiary); }
.report-line-row:last-child { border-bottom: none; }
.report-line-indent { padding-left: 1.25rem; }
.report-line-label { font-size: 13px; color: var(--color-text-primary); }
.report-line-note { font-size: 11px; color: var(--color-text-secondary); margin-left: 6px; }
.report-line-val { font-size: 13px; font-weight: 500; text-align: right; font-family: 'Courier New', monospace; }
.report-line-val--pos { color: #085041; }
.report-line-val--neg { color: #A32D2D; }
.report-line-val--muted { color: var(--color-text-secondary); font-weight: 400; }

.report-subtotal-row { display: grid; grid-template-columns: 1fr 140px 120px; align-items: center; padding: 0.45rem 0; border-top: 1px solid var(--color-border-secondary); margin-top: 0.15rem; }
.report-subtotal-label { font-size: 13px; font-weight: 500; color: var(--color-text-primary); }
.report-total-row { display: grid; grid-template-columns: 1fr 140px 120px; align-items: center; padding: 0.625rem 0.5rem; border-top: 2.5px solid var(--color-text-primary); border-bottom: 2.5px solid var(--color-text-primary); margin-top: 0.5rem; background: var(--color-background-secondary); }
.report-total-label { font-size: 14px; font-weight: 500; color: var(--color-text-primary); }
.report-total-val { font-size: 15px; font-weight: 500; text-align: right; font-family: 'Courier New', monospace; padding-right: 0.25rem; }

/* FOOTER */
.rf-notes { padding: 0.875rem 1.75rem; border-bottom: 0.5px solid var(--color-border-tertiary); }
.rf-notes-heading { font-size: 9px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.12em; color: #0F6E56; margin: 0 0 0.375rem; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.rf-notes-list { list-style: none; padding: 0; margin: 0; counter-reset: note-counter; }
.rf-note-item { font-size: 10px; color: var(--color-text-secondary); margin-bottom: 3px; padding-left: 1.25rem; position: relative; line-height: 1.5; counter-increment: note-counter; }
.rf-note-item::before { content: counter(note-counter) '.'; position: absolute; left: 0; color: var(--color-text-secondary); font-size: 10px; }

.rf-bar { background: #0F6E56; padding: 0.625rem 1.75rem; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 1rem; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.rf-bar-left { font-size: 10px; color: rgba(255,255,255,0.65); line-height: 1.5; }
.rf-bar-left strong { color: #9FE1CB; font-weight: 500; }
.rf-bar-centre { text-align: center; }
.rf-page-pill { font-size: 11px; font-weight: 500; color: #ffffff; background: rgba(255,255,255,0.15); padding: 0.25rem 0.875rem; border-radius: 20px; white-space: nowrap; }
.rf-bar-right { text-align: right; font-size: 10px; color: rgba(255,255,255,0.65); line-height: 1.5; }
.rf-bar-right strong { color: #9FE1CB; font-weight: 500; }

.rf-compliance { background: #1A5C45; padding: 0.375rem 1.75rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.rf-compliance-text { font-size: 9px; color: rgba(255,255,255,0.5); }
.rf-compliance-ref { font-size: 9px; color: rgba(255,255,255,0.4); font-family: 'Courier New', monospace; white-space: nowrap; }

/* Page break hints */
.report-header, .report-footer, .report-kpi-strip { page-break-inside: avoid; }
`
