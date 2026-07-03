import { useCallback } from 'react'
import { CommandSelect } from '@biztrack/ui/biztrack'
import { dataClient } from '@/lib/data-client'
import { useT } from '@/i18n'

/**
 * Searchable role picker — a popover command-select whose options are loaded from the
 * backend (`GET /roles?search=`, debounced) rather than a fixed in-memory list. The
 * collapsed display uses `label` (resolved by the parent from the current value).
 */
export function RoleSelect({
  value,
  label,
  onChange,
  clearLabel,
  placeholder,
  disabled,
  invalid,
}: {
  value: string | null
  label?: string | null
  onChange: (value: string | null, label?: string) => void
  clearLabel?: string
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
}) {
  const t = useT()
  const loadOptions = useCallback(
    async (search: string) => {
      const res = await dataClient.roles.list({ search: search || undefined, limit: 50 })
      return res.roles.map((r) => ({
        value: r.id,
        label: r.name,
        sublabel: r.isSystem ? t('roles.systemRole') : t('roles.customRole'),
      }))
    },
    [t],
  )
  return (
    <CommandSelect
      value={value}
      valueLabel={label}
      onChange={(v, opt) => onChange(v, opt?.label)}
      loadOptions={loadOptions}
      clearLabel={clearLabel}
      placeholder={placeholder ?? t('roles.selectRole')}
      searchPlaceholder={t('roles.searchRoles')}
      emptyText={t('roles.noRoles')}
      loadingText={t('roles.loadingRoles')}
      disabled={disabled}
      invalid={invalid}
    />
  )
}
