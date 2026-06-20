import { useRef, useState } from 'react'
import { Button } from '@biztrack/ui/biztrack'
import { dataClient } from '@/lib/data-client'
import { useT } from '@/i18n'
import { errorMessage } from '@/lib/error'

// Shared upload control matching the categories-page drop-zone (.imgdrop / .imgpreview).
// Used for category/product images (`image`) and document uploads such as supplier
// quotations (`file`). Uploads through `dataClient.uploads.file` and reports the stored
// URL via `onChange`. Keep this the single upload UI across the app.
export function FileUpload({
  value,
  onChange,
  folder,
  variant = 'image',
  accept,
  allowedTypes,
  label,
  hint,
  typeError,
  disabled,
}: {
  value: string | null
  onChange: (url: string | null) => void
  folder: string
  /** `image` shows a thumbnail preview; `file` shows a filename chip. */
  variant?: 'image' | 'file'
  /** HTML input `accept` attribute. Defaults by variant. */
  accept?: string
  /** Optional strict allow-list checked client-side before upload. */
  allowedTypes?: string[]
  /** Drop-zone call-to-action label. */
  label?: string
  /** Small helper text under the call-to-action. */
  hint?: string
  /** Message shown when the chosen file is not in `allowedTypes`. */
  typeError?: string
  disabled?: boolean
}) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isImage = variant === 'image'
  const acceptAttr = accept ?? (isImage ? 'image/*' : 'application/pdf,image/*')
  const cta = label ?? (isImage ? t('upload.ctaImage') : t('upload.cta'))

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file after a remove
    if (!file) return
    if (allowedTypes && !allowedTypes.includes(file.type)) {
      setError(typeError ?? t('upload.typeError'))
      return
    }
    setError(null)
    setUploading(true)
    try {
      const bytes = await file.arrayBuffer()
      const res = await dataClient.uploads.file({
        bytes,
        filename: file.name,
        contentType: file.type || (isImage ? 'application/octet-stream' : 'application/pdf'),
        folder,
      })
      onChange(res.url)
    } catch (err) {
      setError(errorMessage(err, t('upload.error')))
    } finally {
      setUploading(false)
    }
  }

  const fileName = value ? decodeURIComponent(value.split('/').pop() ?? value) : ''

  return (
    <div>
      <input ref={inputRef} type="file" accept={acceptAttr} style={{ display: 'none' }} onChange={onPick} />
      {value ? (
        <>
          {isImage ? (
            <div className="imgpreview">
              <img src={value} alt={cta} />
              {uploading ? <div className="imgpreview-overlay">{t('upload.uploading')}</div> : null}
            </div>
          ) : (
            <div className="filechip">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
              <a href={value} target="_blank" rel="noreferrer" className="filechip-name" title={fileName}>
                {uploading ? t('upload.uploading') : fileName || t('upload.view')}
              </a>
            </div>
          )}
          <div className="img-acts">
            <Button variant="soft" type="button" onClick={() => inputRef.current?.click()} disabled={uploading || disabled}>
              {t('upload.replace')}
            </Button>
            <Button
              variant="soft"
              type="button"
              onClick={() => {
                onChange(null)
                setError(null)
              }}
              disabled={uploading || disabled}
            >
              {t('upload.remove')}
            </Button>
          </div>
        </>
      ) : (
        <button type="button" className="imgdrop" onClick={() => inputRef.current?.click()} disabled={uploading || disabled}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M17 8l-5-5-5 5" />
            <path d="M12 3v12" />
          </svg>
          <div className="t">{uploading ? t('upload.uploading') : cta}</div>
          {hint ? <div className="s">{hint}</div> : null}
        </button>
      )}
      {error ? (
        <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 8 }} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
