import { existsSync } from 'node:fs'
import { Inject, Injectable } from '@nestjs/common'
import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'

// Minimal hardening flags for a system Chrome/Edge (dev + non-serverless hosts).
// @sparticuz/chromium supplies its own (more aggressive) args for the bundled binary.
const SYSTEM_CHROME_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']

// Common install locations to auto-detect a Chrome/Edge binary when CHROMIUM_PATH
// is not set and we're not on a Linux container with the bundled chromium.
function systemChromeCandidates(): string[] {
  if (process.platform === 'win32') {
    // eslint-disable-next-line turbo/no-undeclared-env-vars -- per-machine Windows path; must not be declared in turbo.json (would break cache sharing)
    const localAppData = process.env.LOCALAPPDATA ?? ''
    return [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      localAppData ? `${localAppData}\\Google\\Chrome\\Application\\chrome.exe` : '',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ].filter(Boolean)
  }
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ]
  }
  return ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']
}

/**
 * Renders a self-contained HTML document to a PDF buffer via headless Chromium —
 * the same Chromium engine the desktop app uses (Electron printToPDF), so the shared
 * @biztrack/templates output is identical.
 *
 * Executable resolution order:
 *  1. CHROMIUM_PATH env (explicit override — wins everywhere).
 *  2. Linux: the bundled @sparticuz/chromium (slim container/serverless), then any
 *     system chromium as a fallback.
 *  3. Dev (Windows/macOS): an auto-detected system Chrome/Edge install.
 * Throws a clear, actionable error if nothing usable is found.
 */
@Injectable()
export class PdfRenderService {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {
    this.logger.setContext('PdfRenderService')
  }

  private async resolveExecutable(): Promise<{ executablePath: string; args: string[] }> {
    const override = process.env.CHROMIUM_PATH
    if (override) {
      if (!existsSync(override)) {
        throw new Error(`CHROMIUM_PATH is set but the file does not exist: ${override}`)
      }
      return { executablePath: override, args: SYSTEM_CHROME_ARGS }
    }

    if (process.platform === 'linux') {
      const bundled = await chromium.executablePath()
      if (bundled && existsSync(bundled)) {
        return { executablePath: bundled, args: chromium.args }
      }
      this.logger.warn('Bundled @sparticuz/chromium binary not found; falling back to a system Chrome/Edge.')
    }

    const found = systemChromeCandidates().find((p) => existsSync(p))
    if (found) {
      return { executablePath: found, args: SYSTEM_CHROME_ARGS }
    }

    throw new Error(
      'No Chromium/Chrome executable found for PDF rendering. Install Google Chrome (or Microsoft Edge), or set the CHROMIUM_PATH env var to a Chrome/Edge binary.',
    )
  }

  /**
   * Render self-contained HTML to a PDF buffer.
   * @param opts.blockNetwork abort every sub-resource fetch (img/link/iframe). Use for
   *   CLIENT-supplied HTML so an embedded URL can't be used for SSRF; our templates are
   *   fully inline so they render unchanged.
   */
  async render(html: string, opts?: { blockNetwork?: boolean }): Promise<Buffer> {
    const { executablePath, args } = await this.resolveExecutable()
    const browser = await puppeteer.launch({ args, executablePath, headless: true })
    try {
      const page = await browser.newPage()
      if (opts?.blockNetwork) {
        await page.setRequestInterception(true)
        page.on('request', (req) => {
          const url = req.url()
          if (url.startsWith('data:') || url.startsWith('blob:')) void req.continue()
          else void req.abort()
        })
      }
      await page.setContent(html, { waitUntil: opts?.blockNetwork ? 'load' : 'networkidle0' })
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0', bottom: '0', left: '0', right: '0' },
      })
      return Buffer.from(pdf)
    } finally {
      await browser.close()
    }
  }
}
