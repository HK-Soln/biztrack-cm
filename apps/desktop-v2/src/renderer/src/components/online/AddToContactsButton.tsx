import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from '@biztrack/ui/biztrack'
import type { ContactDuplicateDetails, OnlineCustomer } from '@biztrack/types'
import { dataClient } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { errorMessage } from '@/lib/error'
import { readContactDuplicate } from '@/lib/contact-duplicate'
import { ContactDuplicateModal } from '@/components/contacts/ContactDuplicateModal'
import { useT } from '@/i18n'

/**
 * An online customer's contact link (ruling R20): "View contact" once the shop has added
 * them, else "Add to contacts", which goes through the contact rules and asks to merge or
 * create anyway when their phone or email is already on a contact.
 */
export function AddToContactsButton({ customer }: { customer: OnlineCustomer }) {
  const t = useT()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [duplicate, setDuplicate] = useState<ContactDuplicateDetails | null>(null)

  const add = useMutation({
    mutationFn: (onDuplicate?: 'MERGE' | 'CREATE') =>
      dataClient.online.addCustomerToContacts(customer.id, { onDuplicate }),
    onSuccess: (updated) => {
      setDuplicate(null)
      void qc.invalidateQueries({ queryKey: ['online'] })
      void qc.invalidateQueries({ queryKey: queryKeys.contacts })
      toast.success(t('online.addedToContacts').replace('{name}', updated.contactName ?? ''))
    },
    onError: (e) => {
      const match = readContactDuplicate(e)
      if (match) {
        setDuplicate(match)
        return
      }
      setDuplicate(null)
      toast.error(errorMessage(e, t('ct.saveError')))
    },
  })

  if (customer.contactId) {
    return (
      <button
        type="button"
        className="btn btn-ghost"
        style={{ padding: '6px 12px', fontSize: 12 }}
        onClick={(e) => {
          e.stopPropagation()
          navigate(`/contacts/${customer.contactId}`)
        }}
      >
        {t('online.viewContact')}
      </button>
    )
  }
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ padding: '6px 12px', fontSize: 12 }}
        disabled={add.isPending}
        onClick={(e) => {
          e.stopPropagation()
          add.mutate(undefined)
        }}
      >
        {t('online.addToContacts')}
      </button>
      <ContactDuplicateModal
        duplicate={duplicate}
        pending={add.isPending ? (add.variables ?? null) : null}
        onChoose={(choice) => add.mutate(choice)}
        onCancel={() => setDuplicate(null)}
      />
    </>
  )
}
