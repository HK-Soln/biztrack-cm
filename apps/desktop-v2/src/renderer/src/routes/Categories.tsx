import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Modal, Pagination } from '@biztrack/ui/biztrack'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { usePaged } from '@/lib/usePaged'
import { useCurrency } from '@/lib/currency'
import { useT } from '@/i18n'
import { useBreakpoint } from '@/lib/useBreakpoint'
import type { LocalCategory } from '@shared/ipc'

const PRODUCTS_PAGE_SIZE = 10

/**
 * Products directly in the selected category. Paginated with a "Load more" button that
 * APPENDS the next page to the list (infinite query) rather than replacing it.
 */
function CategoryProducts({ categoryId }: { categoryId: string }) {
  const t = useT()
  const money = useCurrency()
  const navigate = useNavigate()

  const { data, isPending, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: [...queryKeys.products, 'by-category', categoryId],
    queryFn: ({ pageParam }) =>
      dataClient.products.list({ categoryId, page: pageParam, limit: PRODUCTS_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    enabled: !!categoryId,
  })

  const products = data?.pages.flatMap((p) => p.data) ?? []
  const total = data?.pages[0]?.total ?? 0

  if (isPending) return <div className="cat-empty">{t('cat.loadingProducts')}</div>
  if (products.length === 0) return <div className="cat-empty">{t('cat.noProducts')}</div>

  return (
    <div>
      <div className="minihead" style={{ marginBottom: 8 }}>
        <span>{t('cat.products')}</span>
        <span className="chip-tag">{total}</span>
      </div>
      <div className="catprod-list">
        {products.map((p) => (
          <button
            key={p.id}
            type="button"
            className="catprod-row"
            onClick={() => navigate(`/products/${p.id}`)}
          >
            <span className="ava sm">
              {p.imageUrl ? <img src={p.imageUrl} alt="" className="ava-img" /> : p.name.trim().charAt(0) || 'P'}
            </span>
            <span className="meta">
              <span className="nm">{p.name}</span>
              <span className="sub">{p.sku || (p.brandName ?? t('cat.noSku'))}</span>
            </span>
            <span className="catprod-price">{money.format(p.effectiveSellingPrice)}</span>
            <span className="catprod-stock">
              {p.trackInventory ? `${p.currentStock} ${t('cat.inStockUnit')}` : t('cat.service')}
            </span>
          </button>
        ))}
      </div>
      {hasNextPage ? (
        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <Button variant="soft" onClick={() => void fetchNextPage()} loading={isFetchingNextPage}>
            {t('cat.loadMore')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function avatarStyle(c: Pick<LocalCategory, 'color'>) {
  return c.color ? { background: c.color } : undefined
}

export function Categories() {
  const t = useT()
  const bp = useBreakpoint()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const {
    items: categories,
    total,
    page,
    limit,
    totalPages,
    isPending,
    search,
    setSearch,
    setPage,
  } = usePaged<LocalCategory>(queryKeys.categories, (q) => dataClient.categories.list(q), { enabled: true })

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LocalCategory | null>(null)

  const removeM = useMutation({
    mutationFn: (id: string) => dataClient.categories.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.categories }),
  })

  const selected = categories.find((c) => c.id === selectedId) ?? null
  const edit = (id: string) => navigate(`/products/categories/${id}`)

  const confirmDelete = async () => {
    if (!deleteTarget) return
    await removeM.mutateAsync(deleteTarget.id)
    if (selectedId === deleteTarget.id) setSelectedId(null)
    setDeleteTarget(null)
  }

  const Row = ({ c }: { c: LocalCategory }) => (
    <button
      type="button"
      className={`cat-row${selectedId === c.id ? ' sel' : ''}`}
      onClick={() => (bp === 'mobile' ? edit(c.id) : setSelectedId(c.id))}
    >
      <span className="ava" style={avatarStyle(c)}>
        {c.imageUrl ? (
          <img src={c.imageUrl} alt="" className="ava-img" />
        ) : (
          c.name.trim().charAt(0) || 'C'
        )}
      </span>
      <span className="meta">
        <span className="nm">{c.name}</span>
        <span className="sub">
          {t('cat.level')} {c.depth}
        </span>
      </span>
    </button>
  )

  const list = (
    <div className="cat-listcol">
      <div className="cat-search" style={{ position: 'relative' }}>
        <Input
          value={search}
          placeholder={t('cat.search')}
          onChange={(e) => setSearch(e.target.value)}
          style={{ height: 36, paddingRight: search ? 34 : undefined }}
        />
        {search ? (
          <button type="button" className="cat-search-clear" title={t('cat.clearSearch')} onClick={() => setSearch('')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        ) : null}
      </div>
      <div className="cat-list">
        {categories.length === 0 ? (
          <div className="cat-empty">
            {search ? t('cat.noResults').replace('{q}', search) : t('cat.empty')}
            {search ? (
              <div style={{ marginTop: 12 }}>
                <Button variant="soft" onClick={() => setSearch('')}>{t('cat.clearSearch')}</Button>
              </div>
            ) : null}
          </div>
        ) : (
          categories.map((c) => <Row key={c.id} c={c} />)
        )}
      </div>
      {categories.length > 0 ? (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPage={setPage}
          prevLabel={t('common.prev')}
          nextLabel={t('common.next')}
        />
      ) : null}
    </div>
  )

  // --- mobile: full-bleed header + tree list (tap → edit page) + FAB -------
  if (bp === 'mobile') {
    return (
      <>
        <header className="m-head">
          <div className="m-tt">
            <div className="m-title">{t('cat.title')}</div>
            <div className="m-sub">{t('cat.subtitle')}</div>
          </div>
        </header>
        {isPending ? <div className="cat-empty">{t('cat.loading')}</div> : list}
        <div style={{ height: 76 }} />
        <button type="button" className="mfab" onClick={() => navigate('/products/categories/new')} aria-label={t('cat.new')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </>
    )
  }

  return (
    <div className="frame">
      <div className="page-head">
        <div>
          <h1>{t('cat.title')}</h1>
          <p>{t('cat.subtitle')}</p>
        </div>
        <Button variant="primary" onClick={() => navigate('/products/categories/new')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 5v14M5 12h14" />
          </svg>
          {t('cat.new')}
        </Button>
      </div>

      {isPending ? (
        <div className="cat-empty">{t('cat.loading')}</div>
      ) : (
        <div className="md">
          {list}
          <div className="card cat-detail">
            {selected ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                  <span className="av" style={avatarStyle(selected)}>
                    {selected.imageUrl ? (
                      <img src={selected.imageUrl} alt="" className="ava-img" />
                    ) : (
                      selected.name.trim().charAt(0) || 'C'
                    )}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h1 style={{ fontSize: 20, fontWeight: 700 }}>{selected.name}</h1>
                    <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>
                      {t('cat.level')} {selected.depth}
                      {selected.showOnline ? ` · ${t('cat.showOnline')}` : ''}
                    </p>
                  </div>
                  <Button variant="soft" onClick={() => edit(selected.id)}>
                    {t('cat.edit')}
                  </Button>
                  <Button variant="soft" onClick={() => setDeleteTarget(selected)} style={{ color: 'var(--danger)' }}>
                    {t('cat.delete')}
                  </Button>
                </div>
                {selected.description ? (
                  <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 14 }}>
                    {selected.description}
                  </p>
                ) : null}
                <CategoryProducts key={selected.id} categoryId={selected.id} />
              </>
            ) : (
              <div className="cat-empty">{t('cat.selectHint')}</div>
            )}
          </div>
        </div>
      )}

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t('cat.deleteTitle')}
        footer={
          <>
            <Button variant="soft" onClick={() => setDeleteTarget(null)} disabled={removeM.isPending}>
              {t('cat.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={removeM.isPending}
              style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
              onClick={() => void confirmDelete()}
            >
              {t('cat.delete')}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
          {t('cat.deleteBody').replace('{name}', deleteTarget?.name ?? '')}
        </p>
      </Modal>
    </div>
  )
}
