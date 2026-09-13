'use client'

import { useRef } from 'react'
import { useTranslations } from 'next-intl'

/**
 * Digital receipt viewer: renders the API-rendered receipt HTML (the exact thing that prints in the
 * shop) inside an isolated iframe, with a print button. Store-agnostic — scoped under `.store` for the
 * theme tokens.
 */
export function ReceiptView({ html }: { html: string }) {
  const t = useTranslations('receipt')
  const frame = useRef<HTMLIFrameElement>(null)

  const print = () => {
    const w = frame.current?.contentWindow
    if (w) {
      w.focus()
      w.print()
    }
  }

  return (
    <div
      className="store"
      data-theme="light"
      style={{
        minHeight: '100vh',
        background: 'var(--bg, #f5f6f8)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 16px',
        gap: 16,
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text, #182030)' }}>
          {t('title')}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-2, #586274)', marginTop: 2 }}>
          {t('subtitle')}
        </div>
      </div>

      <iframe
        ref={frame}
        title={t('title')}
        srcDoc={html}
        style={{
          width: 360,
          maxWidth: '100%',
          height: 560,
          border: '1px solid var(--border, #e5e8ee)',
          borderRadius: 12,
          background: '#fff',
          boxShadow: '0 8px 30px rgba(16,24,40,0.10)',
        }}
      />

      <button type="button" className="btn" onClick={print}>
        {t('print')}
      </button>
    </div>
  )
}
