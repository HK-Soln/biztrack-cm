import { useState } from 'react'
import { Button } from '@biztrack/ui/biztrack'
import { copyText } from '@/lib/clipboard'
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
    // Only flip to "Copied" when the write actually landed; the field stays selectable as a last resort.
    if (!(await copyText(url))) return
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
