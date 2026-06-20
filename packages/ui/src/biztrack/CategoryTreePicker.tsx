import { useMemo, useState } from 'react'
import { clsx } from 'clsx'

// Searchable, collapsible hierarchical multi-select for category trees. Selection is
// per-node and independent (no parent→child cascade) — a brand may attach a category at
// any level, and the service expands a linked branch to its terminal leaves later.
// Pairs with the `.ctree*` rules in @biztrack/ui/styles.css.
export interface CategoryTreeNode {
  id: string
  name: string
  parentId: string | null
}

export interface CategoryTreePickerProps {
  nodes: CategoryTreeNode[]
  value: string[]
  onChange: (next: string[]) => void
  searchPlaceholder?: string
  emptyLabel?: string
  noMatchLabel?: string
}

interface Row {
  node: CategoryTreeNode
  depth: number
  hasChildren: boolean
}

export function CategoryTreePicker({
  nodes,
  value,
  onChange,
  searchPlaceholder = 'Search categories…',
  emptyLabel = 'No categories yet.',
  noMatchLabel = 'No categories match your search.',
}: CategoryTreePickerProps) {
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const selected = useMemo(() => new Set(value), [value])

  const { childrenOf, roots } = useMemo(() => {
    const known = new Set(nodes.map((n) => n.id))
    const byParent = new Map<string, CategoryTreeNode[]>()
    const top: CategoryTreeNode[] = []
    for (const n of nodes) {
      if (n.parentId && known.has(n.parentId)) {
        const list = byParent.get(n.parentId) ?? []
        list.push(n)
        byParent.set(n.parentId, list)
      } else {
        top.push(n)
      }
    }
    return { childrenOf: byParent, roots: top }
  }, [nodes])

  // When searching, keep matching nodes plus their ancestors visible (and force-expand).
  const { visible, forceOpen } = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return { visible: null as Set<string> | null, forceOpen: new Set<string>() }
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const vis = new Set<string>()
    const open = new Set<string>()
    for (const n of nodes) {
      if (!n.name.toLowerCase().includes(q)) continue
      vis.add(n.id)
      let p = n.parentId ? byId.get(n.parentId) ?? null : null
      while (p && !vis.has(p.id)) {
        vis.add(p.id)
        open.add(p.id)
        p = p.parentId ? byId.get(p.parentId) ?? null : null
      }
    }
    return { visible: vis, forceOpen: open }
  }, [query, nodes])

  const toggleSelect = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange([...next])
  }
  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const rows = useMemo(() => {
    const out: Row[] = []
    const walk = (list: CategoryTreeNode[], depth: number) => {
      const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name))
      for (const node of sorted) {
        if (visible && !visible.has(node.id)) continue
        const kids = childrenOf.get(node.id) ?? []
        const visibleKids = visible ? kids.filter((k) => visible.has(k.id)) : kids
        const hasChildren = visibleKids.length > 0
        out.push({ node, depth, hasChildren })
        const open = forceOpen.has(node.id) || !collapsed.has(node.id)
        if (hasChildren && open) walk(kids, depth + 1)
      }
    }
    walk(roots, 0)
    return out
  }, [roots, childrenOf, collapsed, visible, forceOpen])

  return (
    <div className="ctree">
      <input
        className="ctree-search"
        type="search"
        value={query}
        placeholder={searchPlaceholder}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="ctree-body">
        {nodes.length === 0 ? (
          <div className="ctree-empty">{emptyLabel}</div>
        ) : rows.length === 0 ? (
          <div className="ctree-empty">{noMatchLabel}</div>
        ) : (
          rows.map(({ node, depth, hasChildren }) => {
            const open = forceOpen.has(node.id) || !collapsed.has(node.id)
            const on = selected.has(node.id)
            return (
              <div
                key={node.id}
                className={clsx('ctree-row', on && 'on')}
                style={{ paddingLeft: 8 + depth * 18 }}
              >
                {hasChildren ? (
                  <button
                    type="button"
                    className={clsx('ctree-toggle', open && 'open')}
                    aria-label={open ? 'Collapse' : 'Expand'}
                    onClick={() => toggleCollapse(node.id)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                ) : (
                  <span className="ctree-toggle ph" aria-hidden />
                )}
                <button type="button" className="ctree-label" aria-pressed={on} onClick={() => toggleSelect(node.id)}>
                  <span className={clsx('ctree-cb', on && 'on')} aria-hidden>
                    {on ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                        <path d="m5 12 5 5L20 7" />
                      </svg>
                    ) : null}
                  </span>
                  <span className="ctree-name">{node.name}</span>
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
