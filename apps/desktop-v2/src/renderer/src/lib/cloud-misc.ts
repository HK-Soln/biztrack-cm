import type {
  AuditListQuery,
  LocalAuditLog,
  ChargeType,
  DocumentSendInput,
  DocumentDownloadInput,
  DocumentDownloadResult,
  ShareHtmlPdfInput,
  PaginatedResult,
} from '@shared/ipc'
import { cget, cpost, getAccessToken, CLOUD_API_BASE_URL } from './cloud-http'

function qs(query?: Record<string, unknown>): string {
  if (!query) return ''
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

// ---- audit ----------------------------------------------------------------
export const cloudAudit = {
  list: (query?: AuditListQuery): Promise<PaginatedResult<LocalAuditLog>> =>
    cget<PaginatedResult<LocalAuditLog>>(`/audit${qs(query as Record<string, unknown>)}`),
}

// ---- charges --------------------------------------------------------------
export const cloudCharges = {
  listActive: (): Promise<ChargeType[]> => cget<ChargeType[]>('/charges'),
}

// ---- documents (browser-native rendering / server PDF + send) -------------
/** Open a print window with the given HTML so the browser can save it as a PDF. */
export function printHtml(html: string): void {
  const w = window.open('', '_blank', 'noopener,width=900,height=1200')
  if (!w) return
  w.document.open()
  w.document.write(html)
  w.document.close()
  // Give the new document a tick to lay out before invoking the print dialog.
  w.onload = () => {
    w.focus()
    w.print()
  }
}

/** POST self-contained HTML to the server's renderer and download the resulting PDF. */
export async function downloadPdfFromHtml(html: string, filename: string): Promise<void> {
  const res = await fetch(`${CLOUD_API_BASE_URL}/documents/pdf`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAccessToken() ?? ''}`,
      'X-Device-Type': 'WEB',
    },
    credentials: 'include',
    body: JSON.stringify({ html, filename }),
  })
  if (!res.ok) throw new Error(`Failed to render PDF (${res.status})`)
  downloadBlob(await res.blob(), `${filename}.pdf`)
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export const cloudDocuments = {
  /** Server-rendered PDF for an RFQ/PO → browser download. */
  downloadPdf: async (input: DocumentDownloadInput): Promise<DocumentDownloadResult> => {
    const path =
      input.kind === 'rfq'
        ? `/rfqs/${input.id}/document${input.supplierId ? `?supplierId=${input.supplierId}` : ''}`
        : `/purchase-orders/${input.id}/document`
    // The document routes stream a PDF (not the JSON envelope) — fetch the raw blob.
    const res = await fetch(`${CLOUD_API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${getAccessToken() ?? ''}`, 'X-Device-Type': 'WEB' },
      credentials: 'include',
    })
    if (!res.ok) throw new Error(`Failed to download document (${res.status})`)
    downloadBlob(await res.blob(), `${input.kind}-${input.id}.pdf`)
    return { saved: true }
  },

  /** Send an RFQ/PO to its supplier via the server (email/whatsapp). */
  send: async (input: DocumentSendInput): Promise<void> => {
    if (input.kind === 'rfq') {
      await cpost(`/rfqs/${input.id}/send`, {
        channels: [input.channel],
        ...(input.supplierId ? { supplierIds: [input.supplierId] } : {}),
        ...(input.recipient ? { recipient: input.recipient } : {}),
      })
    } else {
      await cpost(`/purchase-orders/${input.id}/send`, {
        channels: [input.channel],
        ...(input.recipient ? { recipient: input.recipient } : {}),
      })
    }
  },

  /** Compile the HTML to a real PDF on the server, then download it. */
  downloadHtmlPdf: async (html: string, filename: string): Promise<DocumentDownloadResult> => {
    await downloadPdfFromHtml(html, filename)
    return { saved: true }
  },

  /**
   * Browser fallback for sharing a generated document. Web cannot attach a rendered PDF
   * to a wa.me/mailto link, so open the document in a print window (to save/attach
   * manually) AND open the chosen channel pre-filled with the message.
   */
  shareHtmlPdf: async (input: ShareHtmlPdfInput): Promise<void> => {
    printHtml(input.html)
    if (input.channel === 'whatsapp') {
      const phone = (input.phone ?? '').replace(/[^\d]/g, '')
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(input.message)}`
      window.open(url, '_blank', 'noopener')
    } else {
      const subject = encodeURIComponent(input.subject ?? input.filename)
      const body = encodeURIComponent(input.message)
      window.open(`mailto:${input.email ?? ''}?subject=${subject}&body=${body}`, '_blank', 'noopener')
    }
  },
}
