import { app, BrowserWindow, dialog, shell } from 'electron'
import { join } from 'path'
import { mkdir, writeFile } from 'fs/promises'

export type ShareChannel = 'whatsapp' | 'email'

export interface ShareDocumentInput {
  /** Full HTML document to render to PDF. */
  html: string
  /** Plain-text body for the WhatsApp/email composer. */
  message: string
  /** File name (without extension) for the saved PDF. */
  filename: string
  channel: ShareChannel
  /** Recipient phone (for WhatsApp) and/or email (for email). */
  phone?: string | null
  email?: string | null
  /** Email subject line. */
  subject?: string
}

/**
 * Renders shareable documents (RFQs, POs) to PDF and hands them off. Offline-first:
 * the desktop app generates the PDF locally (Electron printToPDF — same Chromium the
 * API will use) and opens the user's WhatsApp/email composer pre-filled. Composers
 * can't attach a file programmatically, so we reveal the saved PDF for the user to
 * attach. (The cloud build sends automatically via the API instead.)
 */
export class DocumentService {
  /** Render a full HTML document to a PDF buffer via an offscreen window. */
  async renderPdf(html: string): Promise<Buffer> {
    const win = new BrowserWindow({
      show: false,
      width: 800,
      height: 1130,
      webPreferences: { offscreen: true, sandbox: true, javascript: false },
    })
    try {
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
      const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } })
      return pdf
    } finally {
      win.destroy()
    }
  }

  /** Save a PDF buffer under the user's Downloads/BizTrack folder; returns the path. */
  async savePdf(filename: string, buffer: Buffer): Promise<string> {
    const dir = join(app.getPath('downloads'), 'BizTrack')
    await mkdir(dir, { recursive: true })
    const path = join(dir, `${sanitize(filename)}.pdf`)
    await writeFile(path, buffer)
    return path
  }

  /**
   * Silently print a receipt to the connected/default printer — no print dialog. Falls
   * back to saving the PDF (and revealing it) when there is no printer or the job fails,
   * so the cashier always ends up with a receipt. Mirrors desktop v1's silent print.
   */
  async printReceipt(html: string, opts: { filename: string; paperWidthMm?: number }): Promise<{ printed: boolean; pdfPath?: string }> {
    // A hidden (not offscreen) window — offscreen rendering can't drive webContents.print.
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
    try {
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
      const printers = await win.webContents.getPrintersAsync()
      if (printers.length === 0) return { printed: false, pdfPath: await this.saveAndReveal(html, opts.filename) }

      const printer = printers.find((p) => p.isDefault) ?? printers[0]!
      const heightPx = Number(await win.webContents.executeJavaScript('document.body.scrollHeight').catch(() => 0)) || 600
      const width = Math.round((opts.paperWidthMm ?? 58) * 1000) // mm → microns
      const height = Math.max(width, Math.round(heightPx * 264.583)) // px → microns @96dpi

      const ok = await new Promise<boolean>((resolve) => {
        win.webContents.print(
          { silent: true, deviceName: printer.name, printBackground: true, margins: { marginType: 'none' }, pageSize: { width, height } },
          (success) => resolve(success),
        )
      })
      if (!ok) return { printed: false, pdfPath: await this.saveAndReveal(html, opts.filename) }
      return { printed: true }
    } catch {
      return { printed: false, pdfPath: await this.saveAndReveal(html, opts.filename) }
    } finally {
      win.destroy()
    }
  }

  /** Render the HTML to a PDF and let the user pick where to save it (native dialog). */
  async downloadPdf(html: string, defaultName: string): Promise<{ saved: boolean; path?: string }> {
    const pdf = await this.renderPdf(html)
    const res = await dialog.showSaveDialog({
      defaultPath: `${sanitize(defaultName)}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (res.canceled || !res.filePath) return { saved: false }
    await writeFile(res.filePath, pdf)
    return { saved: true, path: res.filePath }
  }

  /** Render the HTML to a PDF, save it under Downloads/BizTrack, and reveal it. */
  private async saveAndReveal(html: string, filename: string): Promise<string> {
    const path = await this.savePdf(filename, await this.renderPdf(html))
    shell.showItemInFolder(path)
    return path
  }

  /** Render → save → open the composer pre-filled → reveal the PDF for attaching. */
  async share(input: ShareDocumentInput): Promise<{ pdfPath: string }> {
    const pdf = await this.renderPdf(input.html)
    const pdfPath = await this.savePdf(input.filename, pdf)

    if (input.channel === 'whatsapp') {
      const digits = (input.phone ?? '').replace(/\D/g, '')
      const url = `https://wa.me/${digits}?text=${encodeURIComponent(input.message)}`
      await shell.openExternal(url)
    } else {
      const to = encodeURIComponent(input.email ?? '')
      const subject = encodeURIComponent(input.subject ?? '')
      const body = encodeURIComponent(input.message)
      await shell.openExternal(`mailto:${to}?subject=${subject}&body=${body}`)
    }
    // Reveal the PDF so the user can attach it in the opened composer.
    shell.showItemInFolder(pdfPath)
    return { pdfPath }
  }
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'document'
}
