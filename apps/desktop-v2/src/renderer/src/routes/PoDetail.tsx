import { useNavigate, useParams } from 'react-router-dom'
import { useT } from '@/i18n'
import { PoDetailBody } from '@/components/procurement/PoDetailBody'

/** Full-page purchase-order detail — used on mobile (list navigates here) and for direct
 * links. Tablet/desktop open the same content in a side drawer from the list. */
export function PoDetail() {
  const { id = '' } = useParams()
  const t = useT()
  const navigate = useNavigate()
  return (
    <div className="frame">
      <button type="button" className="back-btn" onClick={() => navigate('/purchasing/orders')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 18l-6-6 6-6" /></svg>
        {t('po.title')}
      </button>
      <PoDetailBody id={id} />
    </div>
  )
}
