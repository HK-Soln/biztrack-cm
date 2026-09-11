import { useState } from 'react'
import { Button } from '@biztrack/ui/biztrack'
import { useT } from '@/i18n'

/**
 * A read-only URL field with a Copy button — the reliable copy affordance (navigator.clipboard can
 * silently fail in the Electron renderer without a user gesture, so we fall back to execCommand and the
 * field lets the user select/copy manually as a last resort).
 */
export function CopyLinkRow({ url }: { url: string }) {
  const t = useT()
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = url
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
      } catch {
        /* last resort: the field is selectable for a manual copy */
      }
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
      <input
        className="input"
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        style={{ flex: 1, fontSize: 12.5 }}
      />
      <Button type="button" variant="soft" onClick={copy}>
        {copied ? t('paymentLink.copied') : t('paymentLink.copy')}
      </Button>
    </div>
  )
}
