'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import type { PublicFacets, PublicProductsQuery } from '@biztrack/types'
import { listProducts } from '@/lib/api'
import { queryKeys } from '@/lib/query'
import { ProductCard } from './ProductCard'

const PARAM_KEYS = ['categoryIds', 'brandIds', 'modelIds', 'attributeOptionIds'] as const
type SelKey = (typeof PARAM_KEYS)[number]

type FacetItem = { id: string; label: string; colorHex?: string | null }
type Category = { id: string; name: string }

const IcChevron = (
  <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="m6 9 6 6 6-6" />
  </svg>
)
const IcX = (
  <svg
    viewBox="0 0 24 24"
    width={13}
    height={13}
    fill="none"
    stroke="currentColor"
    strokeWidth={2.4}
  >
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)
const IcFilter = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </svg>
)
const IcLeft = (
  <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="m15 6-6 6 6 6" />
  </svg>
)
const IcRight = (
  <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="m9 6 6 6-6 6" />
  </svg>
)
const IcBox = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M3 8 12 3l9 5v8l-9 5-9-5V8Z" />
    <path d="M3 8l9 5 9-5M12 13v8" />
  </svg>
)

/** Windowed page list: first, a window around current, last — with gaps as null. */
function pageItems(page: number, total: number): Array<number | null> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const set = new Set([1, total, page, page - 1, page + 1])
  const sorted = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b)
  const out: Array<number | null> = []
  let prev = 0
  for (const n of sorted) {
    if (n - prev > 1) out.push(null)
    out.push(n)
    prev = n
  }
  return out
}

/** One collapsible facet group with show-more + search-within for long lists. */
function FilterSection({
  title,
  items,
  selectedIds,
  onToggle,
}: {
  title: string
  items: FacetItem[]
  selectedIds: string[]
  onToggle: (id: string) => void
}) {
  const t = useTranslations('shop')
  const [open, setOpen] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [term, setTerm] = useState('')
  const LIMIT = 8

  const filtered = term
    ? items.filter((i) => i.label.toLowerCase().includes(term.toLowerCase()))
    : items
  const visible = expanded || filtered.length <= LIMIT ? filtered : filtered.slice(0, LIMIT)

  return (
    <div className="fgroup">
      <h4 className="fhead" onClick={() => setOpen((o) => !o)}>
        {title}
        <span className={`fchev${open ? ' up' : ''}`}>{IcChevron}</span>
      </h4>
      {open ? (
        <>
          {items.length > 12 ? (
            <input
              className="fsearch"
              placeholder={t('searchIn')}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          ) : null}
          {visible.map((i) => (
            <label className="fopt" key={i.id}>
              <input
                type="checkbox"
                checked={selectedIds.includes(i.id)}
                onChange={() => onToggle(i.id)}
              />
              {i.colorHex ? <span className="fswatch" style={{ background: i.colorHex }} /> : null}
              {i.label}
            </label>
          ))}
          {!expanded && filtered.length > LIMIT ? (
            <button type="button" className="fmore" onClick={() => setExpanded(true)}>
              {t('showMore', { count: filtered.length - LIMIT })}
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

export function ShopBrowser({
  slug,
  base,
  categories,
  facets,
  query,
}: {
  slug: string
  base: string
  categories: Category[]
  facets: PublicFacets
  query: PublicProductsQuery
}) {
  const t = useTranslations('shop')
  const router = useRouter()
  const [panelOpen, setPanelOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.products(slug, query),
    queryFn: () => listProducts(slug, query),
  })

  const products = data?.data ?? []
  const total = data?.total ?? 0
  const page = query.page ?? 1
  const totalPages = data?.totalPages ?? 1

  const selected: Record<SelKey, string[]> = {
    categoryIds: query.categoryIds ?? [],
    brandIds: query.brandIds ?? [],
    modelIds: query.modelIds ?? [],
    attributeOptionIds: query.attributeOptionIds ?? [],
  }

  const buildHref = (sel: Record<SelKey, string[]>, toPage: number) => {
    const p = new URLSearchParams()
    if (query.search) p.set('search', query.search)
    for (const key of PARAM_KEYS) if (sel[key].length) p.set(key, sel[key].join(','))
    if (toPage > 1) p.set('page', String(toPage))
    const qs = p.toString()
    return `${base}/products${qs ? `?${qs}` : ''}`
  }

  const toggle = (key: SelKey, id: string) => {
    const set = new Set(selected[key])
    if (set.has(id)) set.delete(id)
    else set.add(id)
    router.push(buildHref({ ...selected, [key]: [...set] }, 1))
  }

  const clearAll = () => {
    router.push(
      buildHref({ categoryIds: [], brandIds: [], modelIds: [], attributeOptionIds: [] }, 1),
    )
  }

  // Models narrow to the selected brand(s) when any brand is picked.
  const models = selected.brandIds.length
    ? facets.models.filter((m) => selected.brandIds.includes(m.brandId))
    : facets.models

  const sections: Array<{ key: SelKey; title: string; items: FacetItem[] }> = [
    {
      key: 'categoryIds' as SelKey,
      title: t('categories'),
      items: categories.map((c) => ({ id: c.id, label: c.name })),
    },
    {
      key: 'brandIds' as SelKey,
      title: t('brands'),
      items: facets.brands.map((b) => ({ id: b.id, label: b.name })),
    },
    {
      key: 'modelIds' as SelKey,
      title: t('models'),
      items: models.map((m) => ({ id: m.id, label: m.name })),
    },
    ...facets.attributeGroups.map((g) => ({
      key: 'attributeOptionIds' as SelKey,
      title: g.name,
      items: g.options.map((o) => ({ id: o.id, label: o.value, colorHex: o.colorHex })),
    })),
  ].filter((s) => s.items.length > 0)

  // Applied-filter chips (label lookup across every facet source).
  const labels = new Map<string, string>()
  categories.forEach((c) => labels.set(c.id, c.name))
  facets.brands.forEach((b) => labels.set(b.id, b.name))
  facets.models.forEach((m) => labels.set(m.id, m.name))
  facets.attributeGroups.forEach((g) => g.options.forEach((o) => labels.set(o.id, o.value)))
  const chips = PARAM_KEYS.flatMap((key) => selected[key].map((id) => ({ key, id })))

  const pageHref = (p: number) => buildHref(selected, p)

  return (
    <>
      {chips.length ? (
        <div className="afilters">
          <span className="afl">{t('appliedFilters')}</span>
          {chips.map((c) => (
            <button
              type="button"
              className="achip"
              key={`${c.key}-${c.id}`}
              onClick={() => toggle(c.key, c.id)}
            >
              {labels.get(c.id) ?? c.id}
              {IcX}
            </button>
          ))}
          <button type="button" className="aclear" onClick={clearAll}>
            {t('clearAll')}
          </button>
        </div>
      ) : null}

      <div className="shop">
        <aside className={`filters${panelOpen ? ' open' : ''}`}>
          {sections.map((s, i) => (
            <FilterSection
              key={`${s.key}-${i}`}
              title={s.title}
              items={s.items}
              selectedIds={selected[s.key]}
              onToggle={(id) => toggle(s.key, id)}
            />
          ))}
        </aside>

        <div>
          <div className="shop-bar">
            <button type="button" className="btn filt-btn" onClick={() => setPanelOpen((o) => !o)}>
              {IcFilter}
              {t('filters')}
            </button>
            <span className="rc">{t('resultCount', { count: total })}</span>
          </div>

          {!isLoading && products.length === 0 ? (
            <div className="empty">
              <div className="ei">{IcBox}</div>
              <h3>{t('emptyTitle')}</h3>
              <p>{t('emptyDesc')}</p>
            </div>
          ) : (
            <div className="p-grid wide">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} slug={slug} base={base} />
              ))}
            </div>
          )}

          {totalPages > 1 ? (
            <div className="pager">
              {page > 1 ? (
                <Link href={pageHref(page - 1)} aria-label={t('prev')}>
                  {IcLeft}
                </Link>
              ) : (
                <button disabled aria-label={t('prev')}>
                  {IcLeft}
                </button>
              )}
              {pageItems(page, totalPages).map((n, i) =>
                n === null ? (
                  <span key={`g-${i}`} style={{ color: 'var(--text-muted)', padding: '0 4px' }}>
                    …
                  </span>
                ) : n === page ? (
                  <button key={n} className="on" aria-current="page">
                    {n}
                  </button>
                ) : (
                  <Link key={n} href={pageHref(n)}>
                    {n}
                  </Link>
                ),
              )}
              {page < totalPages ? (
                <Link href={pageHref(page + 1)} aria-label={t('next')}>
                  {IcRight}
                </Link>
              ) : (
                <button disabled aria-label={t('next')}>
                  {IcRight}
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}
