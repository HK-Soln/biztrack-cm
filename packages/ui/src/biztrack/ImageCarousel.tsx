'use client'

import { useCallback, useEffect } from 'react'

export interface ImageCarouselItem {
  url: string
  altText?: string | null
}

export interface ImageCarouselProps {
  images: ImageCarouselItem[]
  /** Index of the visible image. */
  index: number
  onIndexChange: (index: number) => void
  open: boolean
  onClose: () => void
  closeLabel?: string
  prevLabel?: string
  nextLabel?: string
}

/**
 * Full-screen image lightbox with prev/next, a counter, a thumbnail strip and keyboard control
 * (←/→ to move, Esc to close). Presentational and app-agnostic; the host owns open/index state.
 * Wraps around at the ends so navigation never dead-ends.
 */
export function ImageCarousel({
  images,
  index,
  onIndexChange,
  open,
  onClose,
  closeLabel = 'Close',
  prevLabel = 'Previous',
  nextLabel = 'Next',
}: ImageCarouselProps) {
  const count = images.length
  const go = useCallback(
    (delta: number) => {
      if (count === 0) return
      onIndexChange((index + delta + count) % count)
    },
    [count, index, onIndexChange],
  )

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, go])

  if (!open || count === 0) return null
  const safeIndex = Math.min(Math.max(index, 0), count - 1)
  const current = images[safeIndex]!

  return (
    <div className="img-carousel-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <button
        type="button"
        className="img-carousel-close"
        onClick={onClose}
        aria-label={closeLabel}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
          <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
        </svg>
      </button>

      <div className="img-carousel-stage" onClick={(e) => e.stopPropagation()}>
        {count > 1 ? (
          <button
            type="button"
            className="img-carousel-nav prev"
            onClick={() => go(-1)}
            aria-label={prevLabel}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
              <path d="m15 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : null}

        <img className="img-carousel-img" src={current.url} alt={current.altText ?? ''} />

        {count > 1 ? (
          <button
            type="button"
            className="img-carousel-nav next"
            onClick={() => go(1)}
            aria-label={nextLabel}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
              <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : null}
      </div>

      <div className="img-carousel-foot" onClick={(e) => e.stopPropagation()}>
        <span className="img-carousel-count">
          {safeIndex + 1} / {count}
        </span>
        {count > 1 ? (
          <div className="img-carousel-strip">
            {images.map((img, i) => (
              <button
                type="button"
                key={`${img.url}-${i}`}
                className={`img-carousel-thumb${i === safeIndex ? ' active' : ''}`}
                onClick={() => onIndexChange(i)}
                aria-label={`${i + 1}`}
                aria-current={i === safeIndex ? 'true' : undefined}
              >
                <img src={img.url} alt="" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
