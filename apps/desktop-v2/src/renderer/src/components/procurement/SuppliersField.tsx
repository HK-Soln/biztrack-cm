import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, CommandSelect, Modal } from '@biztrack/ui/biztrack'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { useT } from '@/i18n'

/**
 * Reusable multi-supplier picker (RFQ). Adding is a searchable CommandSelect; chosen
 * suppliers collapse to an "N suppliers" summary that opens a review/remove dialog —
 * so asking many suppliers stays compact.
 */
export function SuppliersField({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const t = useT()
  const [open, setOpen] = useState(false)

  const { data: suppliers = [] } = useQuery({
    queryKey: [...queryKeys.contacts, 'suppliers'],
    queryFn: () => dataClient.contacts.listAllSuppliers(),
    enabled: isElectron,
  })
  const byId = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers])

  const loadOptions = useCallback(
    async (search: string) => {
      const q = search.trim().toLowerCase()
      return suppliers
        .filter((s) => !value.includes(s.id) && (!q || s.name.toLowerCase().includes(q) || (s.phone ?? '').includes(q)))
        .slice(0, 30)
        .map((s) => ({ value: s.id, label: s.name, sublabel: s.phone ?? undefined }))
    },
    [suppliers, value],
  )

  const add = (id: string | null) => {
    if (id && !value.includes(id)) onChange([...value, id])
  }
  const remove = (id: string) => onChange(value.filter((x) => x !== id))

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
        <CommandSelect
          value={null}
          onChange={(id) => add(id)}
          loadOptions={loadOptions}
          placeholder={t('field.addSupplier')}
          searchPlaceholder={t('field.searchSuppliers')}
          emptyText={t('field.noSuppliersFound')}
        />
      </div>
      <button type="button" className="count-chip" disabled={value.length === 0} onClick={() => setOpen(true)}>
        <span className="n">{value.length}</span>
        {t('field.suppliersAdded')}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={t('field.suppliersTitle')} footer={<Button variant="primary" onClick={() => setOpen(false)}>{t('field.done')}</Button>}>
        {value.length === 0 ? (
          <div className="hint" style={{ padding: 16, textAlign: 'center' }}>{t('field.noSuppliers')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {value.map((id) => (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ flex: 1 }}>{byId.get(id)?.name ?? id}{byId.get(id)?.phone ? <span style={{ color: 'var(--text-2)' }}> · {byId.get(id)!.phone}</span> : null}</span>
                <button type="button" title={t('field.remove')} onClick={() => remove(id)} style={{ color: 'var(--danger)', background: 'none', border: 0, cursor: 'pointer' }}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
