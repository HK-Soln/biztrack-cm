import { useNavigate, useParams } from 'react-router-dom'
import { useT } from '@/i18n'
import { RfqDetailBody } from '@/components/procurement/RfqDetailBody'

/** Full-page RFQ detail — used on mobile (list navigates here) and for direct links.
 * Tablet/desktop open the same content in a side drawer from the list. */
export function RfqDetail() {
  const { id = '' } = useParams()
  const t = useT()
  const navigate = useNavigate()
  return (
    <div className="frame">
      <button type="button" className="back-btn" onClick={() => navigate('/purchasing/rfqs')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 18l-6-6 6-6" /></svg>
        {t('rfq.title')}
      </button>
      <RfqDetailBody id={id} />
    </div>
  )
}
