import { useMemo, useState } from 'react'
import { Button, ScanInput } from '@biztrack/ui/biztrack'
import { useT } from '@/i18n'
import { validateSerial } from '@/lib/serial'
import type { SerialType } from '@shared/ipc'

/**
 * In-memory serial-number collector used by the create wizard — both for a serialized-only
 * product and (reused) for the per-variant serial list of a serialized variant product.
 * No images: serialized units are identical, differentiated only by their number. Clashes with
 * already-stored units are enforced server-side at save; here we dedupe within the draft only.
 */
export function WizardSerials({
  serialType,
  serials,
  onChange,
  compact = false,
}: {
  serialType: SerialType
  serials: string[]
  onChange: (next: string[]) => void
  /** Tighter spacing when embedded inside a variant editor modal. */
  compact?: boolean
}) {
  const t = useT()
  const typeLabel = t(`prodf.serial_${serialType}` as Parameters<typeof t>[0])

  const [serial, setSerial] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkText, setBulkText] = useState('')

  const seen = useMemo(() => new Set(serials.map((s) => s.toLowerCase())), [serials])

  const addOne = (raw: string) => {
    const v = raw.trim()
    if (!v) return
    if (!validateSerial(v, serialType)) return setErr(t('psu.invalid').replace('{type}', typeLabel))
    if (seen.has(v.toLowerCase())) return setErr(t('psu.dupSerial').replace('{serial}', v))
    onChange([...serials, v])
    setSerial('')
    setErr(null)
  }

  // Split on newlines / commas / semicolons / whitespace; classify each entry so the user sees
  // valid / duplicate / invalid before committing. "dup" = repeat within the batch or already added.
  const bulkTokens = useMemo(() => {
    const batch = new Set<string>()
    return bulkText
      .split(/[\n,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((value) => {
        const key = value.toLowerCase()
        const status: 'ok' | 'dup' | 'invalid' = !validateSerial(value, serialType)
          ? 'invalid'
          : seen.has(key) || batch.has(key)
            ? 'dup'
            : 'ok'
        batch.add(key)
        return { value, status }
      })
  }, [bulkText, serialType, seen])
  const validTokens = bulkTokens.filter((tk) => tk.status === 'ok')

  const commitBulk = () => {
    if (validTokens.length === 0) return
    onChange([...serials, ...validTokens.map((tk) => tk.value)])
    setBulkText('')
    setBulkMode(false)
    setErr(null)
  }

  return (
    <div>
      <div className="seg-pick" style={{ marginBottom: compact ? 8 : 12 }}>
        <button
          type="button"
          aria-pressed={!bulkMode}
          onClick={() => {
            setBulkMode(false)
            setErr(null)
          }}
        >
          {t('psu.modeOne')}
        </button>
        <button type="button" aria-pressed={bulkMode} onClick={() => setBulkMode(true)}>
          {t('psu.modeBulk')}
        </button>
      </div>

      {!bulkMode ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <ScanInput
              value={serial}
              placeholder={t(`prodf.serialPh_${serialType}` as Parameters<typeof t>[0])}
              inputMode={serialType === 'IMEI' ? 'numeric' : 'text'}
              onChange={(e) => {
                setSerial(e.target.value)
                setErr(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addOne(serial)
                }
              }}
              onScan={addOne}
              scanTitle={t('scan.title')}
              cameraTitle={t('scan.camTitle')}
              cameraHint={t('scan.camHint')}
              cameraError={t('scan.camError')}
            />
          </div>
          <Button variant="soft" onClick={() => addOne(serial)}>
            + {t('psu.add')}
          </Button>
        </div>
      ) : (
        <div>
          <p style={{ fontSize: 11.5, color: 'var(--text-2)', marginBottom: 8 }}>
            {t('psu.bulkHint')}
          </p>
          <textarea
            className="ta"
            rows={compact ? 4 : 6}
            value={bulkText}
            placeholder={t('psu.bulkPh')}
            onChange={(e) => setBulkText(e.target.value)}
            style={{
              width: '100%',
              resize: 'vertical',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 13,
            }}
          />
          {bulkTokens.length > 0 ? (
            <div
              style={{
                display: 'flex',
                gap: 6,
                flexWrap: 'wrap',
                alignItems: 'center',
                marginTop: 8,
              }}
            >
              <span
                className="chip-tag"
                style={{ background: 'var(--success-soft)', color: 'var(--success)' }}
              >
                {t('psu.bulkValid').replace('{n}', String(validTokens.length))}
              </span>
              {bulkTokens.some((tk) => tk.status === 'dup') ? (
                <span
                  className="chip-tag"
                  style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}
                >
                  {t('psu.bulkDup').replace(
                    '{n}',
                    String(bulkTokens.filter((tk) => tk.status === 'dup').length),
                  )}
                </span>
              ) : null}
              {bulkTokens.some((tk) => tk.status === 'invalid') ? (
                <span
                  className="chip-tag"
                  style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
                >
                  {t('psu.bulkInvalid').replace(
                    '{n}',
                    String(bulkTokens.filter((tk) => tk.status === 'invalid').length),
                  )}
                </span>
              ) : null}
            </div>
          ) : null}
          <div style={{ marginTop: 10 }}>
            <Button variant="soft" onClick={commitBulk} disabled={validTokens.length === 0}>
              {t('psu.bulkAdd').replace('{n}', String(validTokens.length))}
            </Button>
          </div>
        </div>
      )}

      {err ? (
        <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 8 }} role="alert">
          {err}
        </p>
      ) : null}

      {serials.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginBottom: 6 }}>
            {t('pwiz.serialCount').replace('{n}', String(serials.length))}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {serials.map((s, i) => (
              <span
                key={`${s}-${i}`}
                className="serial-pill"
                style={{ display: 'inline-flex', gap: 6 }}
              >
                {s}
                <button
                  type="button"
                  aria-label={t('prodf.galleryRemove')}
                  onClick={() => onChange(serials.filter((_, idx) => idx !== i))}
                  style={{ display: 'inline-flex', color: 'var(--danger)' }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="12"
                    height="12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
