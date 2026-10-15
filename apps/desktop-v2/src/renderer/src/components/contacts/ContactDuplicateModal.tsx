import { Button, Modal } from '@biztrack/ui/biztrack'
import type { ContactDuplicateDetails } from '@biztrack/types'
import { useT } from '@/i18n'

/**
 * A new contact's phone or email is already on another contact (CONTACT_DUPLICATE, ruling
 * R16): the person merges into that contact, creates this one anyway, or cancels.
 */
export function ContactDuplicateModal({
  duplicate,
  pending,
  onChoose,
  onCancel,
}: {
  duplicate: ContactDuplicateDetails | null
  /** The choice being saved, while it is. */
  pending: 'MERGE' | 'CREATE' | null
  onChoose: (choice: 'MERGE' | 'CREATE') => void
  onCancel: () => void
}) {
  const t = useT()
  const name = duplicate?.name ?? ''
  const both = !!duplicate?.matchedOn.includes('phone') && !!duplicate?.matchedOn.includes('email')
  const body = both
    ? 'ct.duplicateBodyBoth'
    : duplicate?.matchedOn.includes('email')
      ? 'ct.duplicateBodyEmail'
      : 'ct.duplicateBodyPhone'
  return (
    <Modal
      open={!!duplicate}
      onClose={onCancel}
      title={t('ct.duplicateTitle')}
      footer={
        <>
          <Button variant="soft" onClick={onCancel} disabled={!!pending}>
            {t('ct.cancel')}
          </Button>
          <Button
            variant="soft"
            loading={pending === 'CREATE'}
            disabled={!!pending}
            onClick={() => onChoose('CREATE')}
          >
            {t('ct.duplicateCreate')}
          </Button>
          <Button
            variant="primary"
            loading={pending === 'MERGE'}
            disabled={!!pending}
            onClick={() => onChoose('MERGE')}
          >
            {t('ct.duplicateMerge')}
          </Button>
        </>
      }
    >
      <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
        {t(body).replace('{name}', name)}
      </p>
      <p style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.6, marginTop: 8 }}>
        {t('ct.duplicateHint').replace('{name}', name)}
      </p>
    </Modal>
  )
}
