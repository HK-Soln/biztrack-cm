import { app, BrowserWindow, dialog, shell, type WebContentsPrintOptions } from 'electron'
import { join } from 'path'
import { mkdir, writeFile, unlink } from 'fs/promises'
import { print as sumatraPrint } from 'pdf-to-printer'

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
      const pdf = await win.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      })
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
  /** List installed printers so the renderer can offer a picker (device-local selection). */
  async listPrinters(): Promise<
    Array<{ name: string; displayName: string; isDefault: boolean; description: string }>
  > {
    const win = this.createPrintWindow()
    try {
      const printers = await win.webContents.getPrintersAsync()
      return printers.map((p) => ({
        name: p.name,
        displayName: p.displayName || p.name,
        isDefault: p.isDefault,
        description: p.description || '',
      }))
    } catch {
      return []
    } finally {
      if (!win.isDestroyed()) win.close()
    }
  }

  async printReceipt(
    html: string,
    opts: { filename: string; paperWidthMm?: number; printerName?: string | null; copies?: number },
  ): Promise<{ printed: boolean; pdfPath?: string; reason?: string; deviceName?: string }> {
    const widthMm = opts.paperWidthMm ?? 58
    const copies = Math.max(1, Math.min(9, opts.copies ?? 1))

    // Resolve the target device once (probe window closed straight after).
    const deviceName = await this.resolvePrinter(opts.printerName)
    if (deviceName === null) {
      return { printed: false, pdfPath: await this.saveFallback(html, opts.filename, widthMm) }
    }

    // Windows: render the receipt to a PDF (Chromium printToPDF — the render path that produces
    // correct content, unlike a silently-captured hidden window which came out blank), then print
    // that PDF straight to the installed printer queue with SumatraPDF (pdf-to-printer). Silent, no
    // dialog, uses the existing Windows driver, and keeps the exact receipt design.
    if (process.platform === 'win32') {
      try {
        await this.printPdfToPrinter(html, widthMm, deviceName, copies)
        return { printed: true, deviceName }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        console.error(`[printReceipt] SumatraPDF print failed (device="${deviceName}"): ${reason}`)
        return {
          printed: false,
          pdfPath: await this.saveFallback(html, opts.filename, widthMm),
          reason,
          deviceName,
        }
      }
    }

    // Other platforms: the silent hidden-window path (macOS/Linux print fine this way).
    try {
      const a = await this.attemptSilentPrint(html, widthMm, deviceName, copies, true)
      if (a.ok) return { printed: true }
      const b = await this.attemptSilentPrint(html, widthMm, deviceName, copies, false)
      if (b.ok) return { printed: true }
      return {
        printed: false,
        pdfPath: await this.saveFallback(html, opts.filename, widthMm),
        reason: a.reason,
        deviceName,
      }
    } catch (err) {
      console.error('[printReceipt] error', err)
      return { printed: false, pdfPath: await this.saveFallback(html, opts.filename, widthMm) }
    }
  }

  /**
   * Print the receipt straight to a Windows printer queue via SumatraPDF (bundled by
   * pdf-to-printer): render the HTML to a roll-sized PDF, drop it in a temp file, and hand it to
   * SumatraPDF at 1:1 scale, monochrome, for the thermal head. Throws on failure so the caller
   * can fall back to saving the PDF. The temp file is cleaned up either way.
   */
  private async printPdfToPrinter(
    html: string,
    widthMm: number,
    deviceName: string,
    copies: number,
  ): Promise<void> {
    const pdf = await this.renderReceiptPdf(html, widthMm)
    const tmp = join(app.getPath('temp'), `biztrack-receipt-${Date.now()}.pdf`)
    await writeFile(tmp, pdf)
    console.log(
      `[printReceipt] SumatraPDF → "${deviceName}" x${copies} (${pdf.length} B PDF at ${tmp})`,
    )
    try {
      await sumatraPrint(tmp, {
        printer: deviceName,
        scale: 'noscale', // the PDF page is already the roll width; don't let SumatraPDF resize it
        monochrome: true,
        copies,
      })
      console.log('[printReceipt] SumatraPDF print() resolved — job handed to the spooler')
    } finally {
      await unlink(tmp).catch(() => undefined)
    }
  }

  /** Resolve the device system-name to print to, or null when there are no printers at all. */
  private async resolvePrinter(printerName?: string | null): Promise<string | null> {
    const win = this.createPrintWindow()
    try {
      const printers = await win.webContents.getPrintersAsync()
      if (printers.length === 0) return null
      // The device-selected printer wins when it's actually present; otherwise the OS default.
      const chosen = printerName ? printers.find((p) => p.name === printerName) : undefined
      const deviceName = (chosen ?? printers.find((p) => p.isDefault) ?? printers[0]!).name
      console.log(
        `[printReceipt] ${printers.length} printer(s); target="${deviceName}"${printerName && !chosen ? ` (requested "${printerName}" not found)` : ''}`,
      )
      return deviceName
    } finally {
      if (!win.isDestroyed()) win.close()
    }
  }

  /**
   * One silent print job on its OWN window: load the HTML, paint it off-screen, then print.
   * `withPageSize` toggles the custom micron roll size (attempt 1) vs. letting the driver's
   * own configured paper apply (attempt 2). The window is always closed afterwards.
   */
  private async attemptSilentPrint(
    html: string,
    widthMm: number,
    deviceName: string,
    copies: number,
    withPageSize: boolean,
  ): Promise<{ ok: boolean; reason?: string }> {
    const win = this.createPrintWindow()
    try {
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
      // Show the window OFF-SCREEN *first* so it actually composites, THEN wait for the content
      // (including the logo/QR images) to finish painting. Printing before the paint completes is
      // why the printer fed a blank page — the captured frame was still empty.
      await this.preparePrintWindow(win)
      await this.waitForContentReady(win)
      const pageSize = withPageSize ? await this.getHtmlReceiptPageSize(win, widthMm) : undefined
      return await this.printWebContents(win, {
        silent: true,
        deviceName,
        copies,
        printBackground: true,
        margins: { marginType: 'none' },
        ...(pageSize ? { pageSize } : {}),
      })
    } finally {
      if (!win.isDestroyed()) win.close()
    }
  }

  /**
   * Wait until the shown window has actually painted the receipt: document `complete`, every
   * image (logo/QR data-URIs) loaded, then two animation frames so the compositor has a real
   * frame to capture. Without this the silent print grabs a blank frame and feeds empty paper.
   */
  private async waitForContentReady(win: BrowserWindow): Promise<void> {
    if (win.isDestroyed()) return
    await win.webContents
      .executeJavaScript(
        `new Promise((resolve)=>{
          const paint=()=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true)));
          const ready=()=>{
            const imgs=Array.from(document.images||[]).filter((i)=>!i.complete);
            if(imgs.length===0)return paint();
            let left=imgs.length;const tick=()=>{if(--left<=0)paint()};
            imgs.forEach((i)=>{i.addEventListener('load',tick,{once:true});i.addEventListener('error',tick,{once:true})});
            setTimeout(paint,1500);
          };
          document.readyState==='complete'?ready():window.addEventListener('load',ready,{once:true});
        })`,
      )
      .catch(() => undefined)
    // A final settle so the painted frame is on the compositor before we capture it.
    await new Promise<void>((resolve) => setTimeout(resolve, 120))
  }

  /** Hidden, off-screen-capable window for silent printing (mirrors v1 createPrintWindow). */
  private createPrintWindow(): BrowserWindow {
    const parent =
      BrowserWindow.getFocusedWindow() ??
      BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
    return new BrowserWindow({
      show: false,
      skipTaskbar: true,
      paintWhenInitiallyHidden: true,
      backgroundColor: '#ffffff',
      width: 420,
      height: 760,
      autoHideMenuBar: true,
      ...(parent ? { parent } : {}),
      webPreferences: {
        backgroundThrottling: false,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
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
  private async getHtmlReceiptPageSize(
    win: BrowserWindow,
    widthMm: number,
  ): Promise<{ width: number; height: number }> {
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

  /**
   * Run webContents.print and report only a CONFIRMED result. `ok` is true only when the
   * driver's callback fires success — we must NOT assume success on timeout, or a silent job
   * a thermal driver quietly dropped would be reported as printed while nothing came out.
   * `reason` carries the driver's failure text (or 'timeout'/the thrown message) so the
   * caller can surface why a connected printer didn't print.
   */
  private printWebContents(
    win: BrowserWindow,
    options: WebContentsPrintOptions,
  ): Promise<{ ok: boolean; reason?: string }> {
    return new Promise((resolve) => {
      let settled = false
      const safety = setTimeout(() => {
        if (settled) return
        settled = true
        resolve({ ok: false, reason: 'timeout: the print callback did not fire within 20s' })
      }, 20_000)
      try {
        win.webContents.print(options, (success, failureReason) => {
          if (settled) return
          settled = true
          clearTimeout(safety)
          resolve({
            ok: success,
            reason: success ? undefined : failureReason || 'unknown driver error',
          })
        })
      } catch (err) {
        if (settled) return
        settled = true
        clearTimeout(safety)
        resolve({ ok: false, reason: err instanceof Error ? err.message : 'print threw' })
      }
    })
  }

  /** Render the receipt to a PDF, save it under Downloads/BizTrack, and reveal it. */
  private async saveFallback(html: string, filename: string, widthMm: number): Promise<string> {
    return this.savePdfReveal(filename, await this.renderReceiptPdf(html, widthMm))
  }

  /** Render a receipt HTML to a PDF sized to the thermal roll (width x measured content). */
  private async renderReceiptPdf(html: string, widthMm: number): Promise<Buffer> {
    const win = new BrowserWindow({
      show: false,
      paintWhenInitiallyHidden: true,
      webPreferences: { offscreen: true, sandbox: true },
    })
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
            .executeJavaScript(
              'Math.ceil(Math.max(document.documentElement.scrollHeight,document.body.scrollHeight))',
            )
            .catch(() => 0),
        ) || 600
      // webContents.printToPDF pageSize is in INCHES (unlike webContents.print, which is microns).
      // Passing microns here produced a ~58000-inch page whose MediaBox SumatraPDF/the thermal
      // driver silently refused — the receipt "printed" (job accepted) but no paper came out.
      const width = widthMm / 25.4 // mm -> inches
      const height = px / 96 + 0.16 // CSS px (96dpi) -> inches + ~4mm bottom pad
      return await win.webContents.printToPDF({
        printBackground: true,
        pageSize: { width, height },
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      })
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
