// Shared print stylesheet for documents (purchase orders, RFQs). Kept as a plain
// string so it can be inlined into the <style> of the rendered HTML — both
// Electron printToPDF and headless-chromium page.pdf() consume the same markup.

export const DOCUMENT_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1a1a2e; font-size: 12px; line-height: 1.5;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .doc { max-width: 760px; margin: 0 auto; padding: 36px 40px; }
  .doc-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 28px; }
  .biz { display: flex; gap: 12px; align-items: flex-start; }
  .biz-logo { width: 52px; height: 52px; border-radius: 10px; object-fit: cover; }
  .biz-name { font-size: 16px; font-weight: 700; }
  .biz-meta { color: #5b5b73; font-size: 11px; margin-top: 2px; white-space: pre-line; }
  .doc-title { text-align: right; }
  .doc-title h1 { font-size: 20px; letter-spacing: 1px; margin: 0; text-transform: uppercase; color: #2d2d52; }
  .doc-no { font-size: 12px; color: #5b5b73; margin-top: 4px; }
  .doc-status { display: inline-block; margin-top: 8px; padding: 3px 10px; border-radius: 999px;
    font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px;
    background: #eef0f6; color: #3a3a66; }
  .meta-grid { display: flex; gap: 32px; margin-bottom: 22px; }
  .meta-block { flex: 1; }
  .meta-label { font-size: 10px; text-transform: uppercase; letter-spacing: .6px; color: #9a9ab0; margin-bottom: 4px; }
  .meta-strong { font-weight: 650; }
  .meta-line { color: #5b5b73; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; }
  thead th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .5px;
    color: #9a9ab0; border-bottom: 1.5px solid #e6e6ef; padding: 8px 10px; }
  thead th.num, tbody td.num { text-align: right; }
  tbody td { padding: 9px 10px; border-bottom: 1px solid #f0f0f6; vertical-align: top; }
  tbody td .sku { display: block; color: #9a9ab0; font-size: 10px; margin-top: 1px; }
  .totals { margin-left: auto; width: 280px; }
  .totals .row { display: flex; justify-content: space-between; padding: 5px 10px; font-size: 12px; }
  .totals .row.grand { border-top: 1.5px solid #e6e6ef; margin-top: 4px; font-size: 14px; font-weight: 700; color: #2d2d52; }
  .note { margin-top: 22px; padding: 12px 14px; background: #f7f8fc; border-radius: 8px; color: #45455f; font-size: 11px; }
  .note .note-label { font-size: 10px; text-transform: uppercase; letter-spacing: .6px; color: #9a9ab0; margin-bottom: 4px; }
  .foot { margin-top: 32px; padding-top: 14px; border-top: 1px solid #f0f0f6; color: #9a9ab0; font-size: 10px; text-align: center; }
`
