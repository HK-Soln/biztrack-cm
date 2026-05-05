'use client'

import { useTranslations } from 'next-intl'
import { ContactPickerDialog } from '@/components/contacts/ContactPickerDialog'
import {
  createCustomerContactLocal,
  listCustomerContactsLocal,
  type LocalContactRecord,
} from '@/services/contacts.local'

type CustomerContactDialogProps = {
  businessId: string | null | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedCustomerId?: string | null
  createdById?: string | null
  onSelect: (customer: LocalContactRecord) => void
}

export function CustomerContactDialog({
  businessId,
  open,
  onOpenChange,
  selectedCustomerId,
  createdById,
  onSelect,
}: CustomerContactDialogProps) {
  const t = useTranslations('app.sell')

  return (
    <ContactPickerDialog
      businessId={businessId}
      open={open}
      onOpenChange={onOpenChange}
      selectedContactId={selectedCustomerId}
      createdById={createdById}
      onSelect={onSelect}
      listContacts={listCustomerContactsLocal}
      createContact={createCustomerContactLocal}
      copy={{
        title: t('customer_dialog_title'),
        description: t('customer_dialog_desc'),
        searchPlaceholder: t('search_customer'),
        noResults: t('no_customers_found'),
        noPhone: t('no_phone_number'),
        addNew: t('add_new'),
        backToList: t('back_to_list'),
        fullName: t('full_name'),
        phone: t('phone'),
        alternatePhone: t('alternate_phone'),
        address: t('address'),
        notes: t('notes'),
        save: t('save'),
        saving: t('processing'),
        cancel: t('cancel'),
        saved: t('customer_saved'),
        loadError: t('customer_load_error'),
        phoneRequired: t('phone_required'),
        phoneInvalid: t('phone_invalid'),
        nameRequired: t('name_required'),
        contactExists: t('contact_exists'),
      }}
    />
  )
}
