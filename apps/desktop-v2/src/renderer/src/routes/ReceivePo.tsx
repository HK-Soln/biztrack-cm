import { Navigate, useParams } from 'react-router-dom'

/**
 * Receiving against a purchase order is now handled by the unified Receive Stock wizard.
 * This route just forwards to it with the PO pre-selected.
 */
export function ReceivePo() {
  const { id = '' } = useParams()
  return <Navigate to={`/inventory/restock?po=${encodeURIComponent(id)}`} replace />
}
