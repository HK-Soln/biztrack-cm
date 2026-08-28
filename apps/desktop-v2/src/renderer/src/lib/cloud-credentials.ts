import type { MemberAuthCredential, IssueCardRequest, IssueCardResponse } from '@shared/ipc'
import { cget, cpost } from './cloud-http'

/** Authorization cards in the cloud/browser build (BIZ-3.3) — owner-only, straight to the API. */
export const cloudCredentials = {
  list: (): Promise<MemberAuthCredential[]> => cget('/credentials'),
  issueCard: (input: IssueCardRequest): Promise<IssueCardResponse> =>
    cpost('/credentials/cards', input),
  revoke: (id: string): Promise<MemberAuthCredential> => cpost(`/credentials/${id}/revoke`, {}),
}
