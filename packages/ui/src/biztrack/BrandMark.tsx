'use client'

export interface BrandMarkProps {
  /** Rendered width/height in px (the mark is square). Defaults to 22. */
  size?: number
  className?: string
  /** When set, the mark is exposed to assistive tech with this label; otherwise it's decorative. */
  title?: string
}

/**
 * BizTrack "Waypoint" brand mark — an ascending trail of waypoints climbing to a bright, live
 * node: tracked, real-time business growth. The trail inherits `currentColor` (white on the
 * ink-blue chip it sits in), and the node core uses the success token so the "live" accent
 * matches the rest of the UI. Sits inside the existing `.logo` / `.auth-logo .mk` / `.rcpt .logo`
 * chips, which supply the rounded ink-blue background.
 */
export function BrandMark({ size = 22, className, title }: BrandMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M10 37 L37 13"
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeDasharray="0.1 7.4"
        opacity={0.45}
      />
      <circle cx="10" cy="37" r="3" fill="currentColor" opacity={0.55} />
      <circle cx="20.5" cy="27.5" r="3.2" fill="currentColor" opacity={0.72} />
      <circle cx="30" cy="20" r="3.4" fill="currentColor" />
      <circle cx="38" cy="12" r="6" fill="currentColor" />
      <circle cx="38" cy="12" r="2.5" fill="var(--success, #2f7d4f)" />
    </svg>
  )
}
