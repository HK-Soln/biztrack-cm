import { app, BrowserWindow, dialog, shell, type WebContentsPrintOptions } from 'electron'
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
   * Silently print a receipt to the default printer — no print dialog, no visible window.
   * Mirrors desktop v1's proven HTML print path: a hidden window is shown OFF-SCREEN
   * (`showInactive` at -10000,0) so it actually rasterizes — a `show:false` window alone
   * renders blank to the printer. Falls back to saving + revealing the PDF when there is
   * no printer or the job fails, so the cashier always ends up with a receipt.
   */
  async printReceipt(html: string, opts: { filename: string; paperWidthMm?: number }): Promise<{ printed: boolean; pdfPath?: string }> {
    const widthMm = opts.paperWidthMm ?? 58
    const win = this.createPrintWindow()

    try {
      const printers = await win.webContents.getPrintersAsync()
      if (printers.length === 0) return { printed: false, pdfPath: await this.saveFallback(html, opts.filename, widthMm) }
      const deviceName = (printers.find((p) => p.isDefault) ?? printers[0]!).name

      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
      const pageSize = await this.getHtmlReceiptPageSize(win, widthMm)
      await this.preparePrintWindow(win)

      const ok = await this.printWebContents(win, {
        silent: true,
        deviceName,
        printBackground: true,
        margins: { marginType: 'none' },
        pageSize,
      })
      if (!ok) return { printed: false, pdfPath: await this.saveFallback(html, opts.filename, widthMm) }
      return { printed: true }
    } catch (err) {
      console.error('[printReceipt] error', err)
      return { printed: false, pdfPath: await this.saveFallback(html, opts.filename, widthMm) }
    } finally {
      if (!win.isDestroyed()) win.close()
    }
  }

  /** Hidden, off-screen-capable window for silent printing (mirrors v1 createPrintWindow). */
  private createPrintWindow(): BrowserWindow {
    const parent =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
    return new BrowserWindow({
      show: false,
      skipTaskbar: true,
      paintWhenInitiallyHidden: true,
      backgroundColor: '#ffffff',
      width: 420,
      height: 760,
      autoHideMenuBar: true,
      ...(parent ? { parent } : {}),
      webPreferences: { backgroundThrottling: false, contextIsolation: true, nodeIntegration: false, sandbox: true },
    })
  }

  /**
   * Show the print window OFF-SCREEN so it paints (silent printing of a never-shown window
   * produces a blank page), then give it a beat to render. Mirrors v1 preparePrintWindow.
   */
  private async preparePrintWindow(win: BrowserWindow): Promise<void> {
    if (win.isDestroyed()) return
    win.setSkipTaskbar(true)
    if (!win.isVisible()) {
      win.setPosition(-10_000, 0, false)
      win.showInactive()
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 300))
  }

  /** Measure rendered content height → page size in microns (mirrors v1 getHtmlReceiptPageSize). */
  private async getHtmlReceiptPageSize(win: BrowserWindow, widthMm: number): Promise<{ width: number; height: number }> {
    await win.webContents
      .executeJavaScript(
        `new Promise((res)=>{const s=()=>requestAnimationFrame(()=>requestAnimationFrame(()=>res(true)));document.readyState==='complete'?s():window.addEventListener('load',s,{once:true})})`,
      )
      .catch(() => undefined)
    const contentHeight =
      Number(
        await win.webContents
          .executeJavaScript(
            'Math.ceil(Math.max(document.documentElement?.scrollHeight??0,document.body?.scrollHeight??0,document.documentElement?.offsetHeight??0,document.body?.offsetHeight??0))',
          )
          .catch(() => 0),
      ) || 0
    const heightMicrons =
      contentHeight > 0 ? Math.round((contentHeight / 96) * 25_400) + 8_000 : 160 * 1_000 // measured + 8mm pad, else 160mm
    return { width: Math.round(widthMm * 1_000), height: Math.max(heightMicrons, 50 * 1_000) }
  }

  /** Run webContents.print with a 10s safety timeout that assumes hand-off (mirrors v1). */
  private printWebContents(win: BrowserWindow, options: WebContentsPrintOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let settled = false
      const safety = setTimeout(() => {
        if (settled) return
        settled = true
        console.warn('[printReceipt] callback did not fire within 10s; assuming the job was handed off')
        resolve(true)
      }, 10_000)
      win.webContents.print(options, (success, failureReason) => {
        if (settled) return
        settled = true
        clearTimeout(safety)
        if (!success) console.error('[printReceipt] print failed:', failureReason)
        resolve(success)
      })
    })
  }

  /** Render the receipt to a PDF, save it under Downloads/BizTrack, and reveal it. */
  private async saveFallback(html: string, filename: string, widthMm: number): Promise<string> {
    return this.savePdfReveal(filename, await this.renderReceiptPdf(html, widthMm))
  }

  /** Render a receipt HTML to a PDF sized to the thermal roll (width x measured content). */
  private async renderReceiptPdf(html: string, widthMm: number): Promise<Buffer> {
    const win = new BrowserWindow({ show: false, paintWhenInitiallyHidden: true, webPreferences: { offscreen: true, sandbox: true } })
    try {
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
      await win.webContents
        .executeJavaScript(
          `new Promise((res)=>{const s=()=>requestAnimationFrame(()=>requestAnimationFrame(()=>res(true)));document.readyState==='complete'?s():window.addEventListener('load',s,{once:true})})`,
        )
        .catch(() => undefined)
      const px =
        Number(
          await win.webContents
            .executeJavaScript('Math.ceil(Math.max(document.documentElement.scrollHeight,document.body.scrollHeight))')
            .catch(() => 0),
        ) || 600
      const width = Math.round(widthMm * 1000) // mm to microns
      const height = Math.max(Math.round((px / 96) * 25_400) + 4_000, 30_000) // px to microns + 4mm pad
      return await win.webContents.printToPDF({ printBackground: true, pageSize: { width, height }, margins: { top: 0, bottom: 0, left: 0, right: 0 } })
    } finally {
      win.destroy()
    }
  }

  private async savePdfReveal(filename: string, buffer: Buffer): Promise<string> {
    const path = await this.savePdf(filename, buffer)
    shell.showItemInFolder(path)
    return path
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
