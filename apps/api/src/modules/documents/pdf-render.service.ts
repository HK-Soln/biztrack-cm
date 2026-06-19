import { Inject, Injectable } from '@nestjs/common'
import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'
import type { Logger } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'

/**
 * Renders a self-contained HTML document to a PDF buffer via headless Chromium —
 * the same Chromium engine the desktop app uses (Electron printToPDF), so the shared
 * @biztrack/templates output is identical. Uses @sparticuz/chromium so it works in
 * a slim container; CHROMIUM_PATH overrides the executable when a system Chrome exists.
 */
@Injectable()
export class PdfRenderService {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {
    this.logger.setContext('PdfRenderService')
  }

  async render(html: string): Promise<Buffer> {
    const executablePath = process.env.CHROMIUM_PATH || (await chromium.executablePath())
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    })
    try {
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'networkidle0' })
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
