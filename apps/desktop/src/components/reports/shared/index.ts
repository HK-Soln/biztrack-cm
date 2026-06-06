// ─────────────────────────────────────────────────────────────────────────────
// apps/desktop/src/components/reports/shared/index.ts
// Barrel export — import everything from this single path.
// ─────────────────────────────────────────────────────────────────────────────
export { ReportWrapper }          from './ReportWrapper'
export { ReportHeader }           from './ReportHeader'
export { ReportFooter }           from './ReportFooter'
export type { ReportMeta, BusinessInfo, ReportCategory } from './ReportTypes'
export { REPORT_META_FACTORIES, generateReportId }       from './ReportTypes'
