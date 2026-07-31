'use client'

import { useId, useRef, useState } from 'react'

export interface ImageGalleryItem {
  id?: string
  url: string
  altText?: string | null
}

export interface ImageGalleryLabels {
  /** Drop-zone call to action. */
  cta?: string
  /** Small helper text under the CTA. */
  hint?: string
  /** Shown while an upload is in flight. */
  uploading?: string
  /** Remove-image button tooltip. */
  remove?: string
  /** Set-as-primary button tooltip. */
  setMain?: string
  /** Badge on the first (primary) image. */
  main?: string
  /** Message when a dropped/selected file is the wrong type. */
  typeError?: string
}

export interface ImageGalleryProps {
  items: ImageGalleryItem[]
  onChange: (items: ImageGalleryItem[]) => void
  /** Uploads one file and resolves to its stored URL. */
  onUpload: (file: File) => Promise<string>
  /** Fired when upload activity starts/stops (to disable a surrounding Save button). */
  onUploadingChange?: (uploading: boolean) => void
  accept?: string
  /** Strict allow-list checked before upload. */
  allowedTypes?: string[]
  disabled?: boolean
  labels?: ImageGalleryLabels
}

const DEFAULT_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'
const DEFAULT_LABELS: Required<ImageGalleryLabels> = {
  cta: 'Add photos',
  hint: 'Click or drop images here · drag to reorder · first is the cover',
  uploading: 'Uploading…',
  remove: 'Remove',
  setMain: 'Set as cover',
  main: 'Cover',
  typeError: 'That file type is not supported.',
}

/**
 * A visible image gallery input: a drop zone (click or drag files) plus a thumbnail grid with
 * drag-to-reorder, remove, and set-cover. The first image is the cover/primary. Presentational —
 * the host provides `onUpload` (returns the stored URL) so this stays free of app/data deps and
 * can be reused across the desktop and web apps. Sized to its container, so it works in modals.
 */
export function ImageGallery({
  items,
  onChange,
  onUpload,
  onUploadingChange,
  accept = DEFAULT_ACCEPT,
  allowedTypes,
  disabled = false,
  labels,
}: ImageGalleryProps) {
  const l = { ...DEFAULT_LABELS, ...labels }
  const inputRef = useRef<HTMLInputElement>(null)
  const gridName = useId()
  const [uploading, setUploading] = useState(false)
  const [dragFiles, setDragFiles] = useState(false)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const setBusy = (b: boolean) => {
    setUploading(b)
    onUploadingChange?.(b)
  }

  async function ingest(files: File[]) {
    const list = files.filter((f) => f.type.startsWith('image/'))
    const valid = allowedTypes ? list.filter((f) => allowedTypes.includes(f.type)) : list
    if (valid.length === 0) {
      if (files.length > 0) setError(l.typeError)
      return
    }
    setError(null)
    setBusy(true)
    try {
      const added: ImageGalleryItem[] = []
      for (const file of valid) {
        const url = await onUpload(file)
        added.push({ url })
      }
      onChange([...items, ...added])
    } catch {
      setError(l.typeError)
    } finally {
      setBusy(false)
    }
  }

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    void ingest(files)
  }

  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i))
  const setMain = (i: number) => {
    const next = [...items]
    const [picked] = next.splice(i, 1)
    if (picked) onChange([picked, ...next])
  }

  // HTML5 drag-to-reorder within the grid.
  const onThumbDrop = (to: number) => {
    if (dragFrom === null || dragFrom === to) return
    const next = [...items]
    const [moved] = next.splice(dragFrom, 1)
    if (moved) next.splice(to, 0, moved)
    onChange(next)
  }

  return (
    <div className="img-gal">
      <button
        type="button"
        className={`img-gal-drop${dragFiles ? ' drag' : ''}${disabled ? ' disabled' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          if (disabled) return
          e.preventDefault()
          if (dragFrom === null) setDragFiles(true)
        }}
        onDragLeave={() => setDragFiles(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragFiles(false)
          if (disabled || dragFrom !== null) return
          void ingest(Array.from(e.dataTransfer.files ?? []))
        }}
        aria-label={l.cta}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path d="M12 16V4m0 0 4 4m-4-4L8 8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
        </svg>
        <span className="t">{uploading ? l.uploading : l.cta}</span>
        <span className="s">{l.hint}</span>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          hidden
          disabled={disabled}
          onChange={onPick}
        />
      </button>

      {items.length > 0 ? (
        <div className="img-gal-grid">
          {items.map((img, i) => (
            <div
              key={img.id ?? `${gridName}-${i}`}
              className={`img-gal-thumb${dragFrom === i ? ' dragging' : ''}${dragOver === i ? ' over' : ''}`}
              draggable={!disabled}
              onDragStart={(e) => {
                setDragFrom(i)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                if (dragFrom === null) return
                e.preventDefault()
                setDragOver(i)
              }}
              onDrop={(e) => {
                e.preventDefault()
                onThumbDrop(i)
                setDragFrom(null)
                setDragOver(null)
              }}
              onDragEnd={() => {
                setDragFrom(null)
                setDragOver(null)
              }}
            >
              <img src={img.url} alt={img.altText ?? ''} draggable={false} />
              <div className="img-gal-acts">
                {i !== 0 ? (
                  <button
                    type="button"
                    title={l.setMain}
                    aria-label={l.setMain}
                    onClick={() => setMain(i)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="m12 3 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.3 6.8 19l1-5.8L3.6 9.1l5.8-.8L12 3Z" />
                    </svg>
                  </button>
                ) : null}
                <button
                  type="button"
                  title={l.remove}
                  aria-label={l.remove}
                  onClick={() => remove(i)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                    <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              {i === 0 ? <span className="img-gal-main">{l.main}</span> : null}
            </div>
          ))}
        </div>
      ) : null}

      {error ? (
        <p className="img-gal-err" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
