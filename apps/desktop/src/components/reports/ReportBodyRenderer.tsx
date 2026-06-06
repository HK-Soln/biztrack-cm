'use client'

// ─────────────────────────────────────────────────────────────────────────────
// apps/desktop/src/components/reports/ReportBodyRenderer.tsx
//
// Renders the body content for any of the 16 report view-models using the
// shared report CSS classes from report-styles.css.
// The ReportWrapper (header + footer) is rendered separately; this component
// provides only the inner body that sits between them.
// ─────────────────────────────────────────────────────────────────────────────

// ── Local type re-declarations ────────────────────────────────────────────────
// These are deliberately kept minimal so this file has no import from page.tsx.
// They must stay structurally compatible with the types in page.tsx.

export type ReportStatLocal = {
  label: string
  value: string
  hint: string
  tone?: string
}

export type TrendPointLocal = {
  key: string
  label: string
  primary: number
  secondary: number
}

export type BarRowLocal = {
  label: string
  valueLabel: string
  percentage: number
  tone: string
  meta?: string
}

export type RankedRowLocal = {
  label: string
  valueLabel: string
  meta?: string
  tone?: string
}

export type PreviewTableLocal = {
  columns: string[]
  rows: string[][]
}

export type ExportModelLocal = {
  title: string
  description: string
  filenameBase: string
  summaryRows: Array<{ label: string; value: string }>
  table?: PreviewTableLocal
}

export type ReportViewModelLocal =
  | {
      kind: 'trend'
      title: string
      description: string
      stats: ReportStatLocal[]
      legend: { primary: string; secondary: string }
      points: TrendPointLocal[]
      primaryMaxLabel: string
      secondaryMaxLabel: string
      empty: string
      exportModel: ExportModelLocal
    }
  | {
      kind: 'bars'
      title: string
      description: string
      stats: ReportStatLocal[]
      bars: BarRowLocal[]
      empty: string
      exportModel: ExportModelLocal
    }
  | {
      kind: 'ranked'
      title: string
      description: string
      stats: ReportStatLocal[]
      rows: RankedRowLocal[]
      empty: string
      exportModel: ExportModelLocal
    }
  | {
      kind: 'table'
      title: string
      description: string
      stats: ReportStatLocal[]
      table: PreviewTableLocal
      empty: string
      exportModel: ExportModelLocal
    }
  | {
      kind: 'note'
      title: string
      description: string
      stats: ReportStatLocal[]
      note: string
      bullets: string[]
      exportModel: ExportModelLocal
    }

// ── KPI strip ─────────────────────────────────────────────────────────────────

function KpiStrip({ stats }: { stats: ReportStatLocal[] }) {
  return (
    <div className="report-kpi-strip">
      {stats.map((stat) => (
        <div key={stat.label} className="report-kpi-cell">
          <div className="report-kpi-label">{stat.label}</div>
          <div className="report-kpi-value">{stat.value}</div>
          <div className="report-kpi-sub">{stat.hint}</div>
        </div>
      ))}
    </div>
  )
}

// ── Generic table ─────────────────────────────────────────────────────────────

function ReportDataTable({ table }: { table: PreviewTableLocal }) {
  if (table.rows.length === 0) {
    return (
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
        No data available for this period.
      </p>
    )
  }

  return (
    <table className="report-table">
      <thead>
        <tr>
          {table.columns.map((col, index) => (
            <th key={`th-${index}-${col}`}>{col}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row, rowIndex) => (
          <tr key={`row-${rowIndex}`}>
            {row.map((cell, cellIndex) => (
              <td key={`cell-${rowIndex}-${cellIndex}`}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Bar rows ──────────────────────────────────────────────────────────────────

function BarRows({ bars }: { bars: BarRowLocal[] }) {
  return (
    <table className="report-table">
      <thead>
        <tr>
          <th>Label</th>
          <th className="r">Value</th>
          <th className="r">Share</th>
          <th>Note</th>
        </tr>
      </thead>
      <tbody>
        {bars.map((bar, index) => (
          <tr key={`bar-${index}-${bar.label}`}>
            <td>{bar.label}</td>
            <td className="r">{bar.valueLabel}</td>
            <td className="r">{bar.percentage}%</td>
            <td>{bar.meta ?? '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Ranked rows ───────────────────────────────────────────────────────────────

function RankedRows({ rows }: { rows: RankedRowLocal[] }) {
  return (
    <table className="report-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Item</th>
          <th className="r">Value</th>
          <th>Note</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`ranked-${index}-${row.label}`}>
            <td style={{ width: 32 }}>{index + 1}</td>
            <td>{row.label}</td>
            <td className="r">{row.valueLabel}</td>
            <td>{row.meta ?? '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Trend points ──────────────────────────────────────────────────────────────

function TrendTable({
  points,
  legend,
}: {
  points: TrendPointLocal[]
  legend: { primary: string; secondary: string }
}) {
  return (
    <table className="report-table">
      <thead>
        <tr>
          <th>Period</th>
          <th className="r">{legend.primary}</th>
          <th className="r">{legend.secondary}</th>
        </tr>
      </thead>
      <tbody>
        {points.map((point) => (
          <tr key={point.key}>
            <td>{point.label}</td>
            <td className="r">{point.primary.toLocaleString()}</td>
            <td className="r">{point.secondary.toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Note body ─────────────────────────────────────────────────────────────────

function NoteBody({ note, bullets }: { note: string; bullets: string[] }) {
  return (
    <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--color-text-primary)' }}>
      <p style={{ marginBottom: '0.75rem' }}>{note}</p>
      {bullets.length > 0 && (
        <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
          {bullets.map((bullet, index) => (
            <li key={`bullet-${index}`} style={{ marginBottom: '0.375rem', fontSize: 12 }}>
              {bullet}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Public component ──────────────────────────────────────────────────────────

interface ReportBodyRendererProps {
  viewModel: ReportViewModelLocal
}

export function ReportBodyRenderer({ viewModel }: ReportBodyRendererProps) {
  return (
    <>
      <KpiStrip stats={viewModel.stats} />

      {viewModel.kind === 'trend' && (
        <>
          {viewModel.points.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
              {viewModel.empty}
            </p>
          ) : (
            <TrendTable points={viewModel.points} legend={viewModel.legend} />
          )}
        </>
      )}

      {viewModel.kind === 'bars' && (
        <>
          {viewModel.bars.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
              {viewModel.empty}
            </p>
          ) : (
            <BarRows bars={viewModel.bars} />
          )}
        </>
      )}

      {viewModel.kind === 'ranked' && (
        <>
          {viewModel.rows.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
              {viewModel.empty}
            </p>
          ) : (
            <RankedRows rows={viewModel.rows} />
          )}
        </>
      )}

      {viewModel.kind === 'table' && (
        <>
          {viewModel.exportModel.table ? (
            <ReportDataTable table={viewModel.exportModel.table} />
          ) : viewModel.table.rows.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
              {viewModel.empty}
            </p>
          ) : (
            <ReportDataTable table={viewModel.table} />
          )}
        </>
      )}

      {viewModel.kind === 'note' && (
        <>
          <NoteBody note={viewModel.note} bullets={viewModel.bullets} />
          {viewModel.exportModel.table && (
            <>
              <div className="report-section-hdr">Detail</div>
              <ReportDataTable table={viewModel.exportModel.table} />
            </>
          )}
        </>
      )}
    </>
  )
}
