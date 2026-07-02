import { useMemo } from 'react'
import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'
import type { PermissionCatalogItem } from '@shared/ipc'

// Group keys come from the server catalogue (sales/expenses/contacts/inventory/debts/
// reports/admin). The permission labels themselves are server-defined (currently FR) —
// shown as provided.
const GROUP_LABEL: Record<string, MessageKey> = {
  sales: 'roles.grp.sales',
  expenses: 'roles.grp.expenses',
  contacts: 'roles.grp.contacts',
  inventory: 'roles.grp.inventory',
  debts: 'roles.grp.debts',
  reports: 'roles.grp.reports',
  admin: 'roles.grp.admin',
}

function groupCatalogue(items: PermissionCatalogItem[]): Array<[string, PermissionCatalogItem[]]> {
  const map = new Map<string, PermissionCatalogItem[]>()
  for (const it of items) {
    const arr = map.get(it.group) ?? []
    arr.push(it)
    map.set(it.group, arr)
  }
  return [...map.entries()]
}

export function PermissionEditor({
  catalogue,
  value,
  onToggle,
  disabled,
}: {
  catalogue: PermissionCatalogItem[]
  value: Set<string>
  onToggle?: (key: string) => void
  disabled?: boolean
}) {
  const t = useT()
  const groups = useMemo(() => groupCatalogue(catalogue), [catalogue])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {groups.map(([g, items]) => (
        <div key={g}>
          <div className="perm-grp-h">{GROUP_LABEL[g] ? t(GROUP_LABEL[g]) : g}</div>
          {items.map((p) => {
            const on = value.has(p.key)
            return (
              <div className="set-line" key={p.key}>
                <div><div className="nm">{p.label}</div><div className="ds">{p.description}</div></div>
                <button
                  type="button"
                  className={`switch${on ? ' on' : ''}`}
                  aria-pressed={on}
                  disabled={disabled || !onToggle}
                  onClick={() => onToggle?.(p.key)}
                />
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
