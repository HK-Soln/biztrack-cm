import { Link } from 'react-router-dom'
import { REVIEW_FLAGS_PATH, useOpenReviewFlags } from '@/lib/useReviewFlags'
import { useT } from '@/i18n'

/** The open-flag count next to the sidebar entry. Renders nothing for any other entry. */
export function ReviewFlagsNavBadge({ to }: { to: string }) {
  const count = useOpenReviewFlags(to === REVIEW_FLAGS_PATH)
  if (to !== REVIEW_FLAGS_PATH || !count?.open) return null
  return <span className="badge-a">{count.open > 99 ? '99+' : count.open}</span>
}

/** A line on the activity page when something is waiting for review. */
export function ReviewFlagsBanner() {
  const t = useT()
  const count = useOpenReviewFlags()
  if (!count?.open) return null
  return (
    <div className={`banner${count.high ? ' warn' : ''}`} style={{ marginBottom: 14 }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
        <path d="M12 9v4M12 17h.01" />
        <path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      </svg>
      <span style={{ flex: 1 }}>
        {count.open === 1
          ? t('review.banner.one')
          : t('review.banner.many').replace('{n}', String(count.open))}
        {count.high ? ` · ${t('review.banner.urgent').replace('{n}', String(count.high))}` : ''}
      </span>
      <Link className="btn" to={REVIEW_FLAGS_PATH}>
        {t('review.banner.open')}
      </Link>
    </div>
  )
}
