import { useQuery } from '@tanstack/react-query'
import { dataClient } from '@/lib/data-client'

/**
 * Whether the signed-in user's role can act as a manager (`can_authorize`, or a role-less
 * OWNER/MANAGER). Gates cash-oversight UI — per-cashier drawer accuracy, the daily close —
 * that a regular cashier shouldn't see. Reads the local roles table so it works offline; the
 * cloud/browser build has no till and returns false.
 */
export function useCanManage(): boolean {
  const q = useQuery({
    queryKey: ['pin', 'can-manage'],
    queryFn: () => dataClient.pin.canManage(),
    staleTime: 5 * 60_000,
  })
  return q.data ?? false
}
