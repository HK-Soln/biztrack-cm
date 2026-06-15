import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Modal, Pagination, Select } from '@biztrack/ui/biztrack'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { usePaged } from '@/lib/usePaged'
import { useT } from '@/i18n'
import { useBreakpoint } from '@/lib/useBreakpoint'
import type { LocalProduct } from '@shared/ipc'

const XAF = new Intl.NumberFormat('fr-CM', { maximumFractionDigits: 0 })
function formatXAF(n: number): string {
  return `${XAF.format(n)} FCFA`
}

function margin(p: LocalProduct): string {
  if (p.costPrice == null || p.costPrice <= 0 || p.sellingPrice <= 0) return '—'
  const pct = ((p.sellingPrice - p.costPrice) / p.sellingPrice) * 100
  return `${pct.toFixed(1)}%`
}

export function Products() {
  const t = useT()
  const bp = useBreakpoint()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [categoryId, setCategoryId] = useState('')
  const {
    items: products,
    total,
    page,
    limit,
    totalPages,
    isPending,
    search,
    setSearch,
    setPage,
  } = usePaged<LocalProduct>(queryKeys.products, (q) => dataClient.products.list(q), {
    enabled: isElectron,
    extra: categoryId ? { categoryId } : {},
  })

  const { data: categories = [] } = useQuery({
    queryKey: [...queryKeys.categories, 'all'],
    queryFn: () => dataClient.categories.listAll(),
    enabled: isElectron,
  })

  const [deleteTarget, setDeleteTarget] = useState<LocalProduct | null>(null)
  const removeM = useMutation({
    mutationFn: (id: string) => dataClient.products.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.products }),
  })

  const edit = (id: string) => navigate(`/products/${id}`)
  const confirmDelete = async () => {
    if (!deleteTarget) return
    await removeM.mutateAsync(deleteTarget.id)
    setDeleteTarget(null)
  }

  const actions = (p: LocalProduct) => (
    <span className="acts">
      <button title={t('prod.edit')} onClick={() => edit(p.id)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
          <path d="M14 6l4 4" />
        </svg>
      </button>
      <button title={t('prod.delete')} onClick={() => setDeleteTarget(p)} style={{ color: 'var(--danger)' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
        </svg>
      </button>
    </span>
  )

  return (
    <div className="frame">
      <div className="page-head">
        <div>
          <h1>{t('prod.title')}</h1>
          <p>{t('prod.subtitle')}</p>
        </div>
        <Button variant="primary" onClick={() => navigate('/products/new')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 5v14M5 12h14" />
          </svg>
          {t('prod.new')}
        </Button>
      </div>

      <div className="toolbar">
        <Input
          value={search}
          placeholder={t('prod.search')}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <Select
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value)
            setPage(1)
          }}
        >
          <option value="">{t('prod.allCategories')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>{t('prod.all')}</h3>
          <div className="spacer" style={{ flex: 1 }} />
          <span className="chip-tag">{t('prod.count').replace('{n}', String(total))}</span>
        </div>

        {isPending ? (
          <div className="cat-empty">{t('prod.loading')}</div>
        ) : products.length === 0 ? (
          <div className="cat-empty">{t('prod.empty')}</div>
        ) : bp === 'mobile' ? (
          <div className="u-cards">
            {products.map((p) => (
              <div key={p.id} className="u-card">
                <span className="u-abbr">{p.name.slice(0, 2).toUpperCase()}</span>
                <div className="u-main">
                  <div className="u-nm">{p.name}</div>
                  <div className="u-sub">
                    {p.categoryName ? <span className="chip-tag">{p.categoryName}</span> : null}
                    <span className="mono">{formatXAF(p.sellingPrice)}</span>
                  </div>
                </div>
                {actions(p)}
              </div>
            ))}
          </div>
        ) : (
          <table className="utbl">
            <thead>
              <tr>
                <th>{t('prod.colProduct')}</th>
                <th>{t('prod.colCategory')}</th>
                <th>{t('prod.colBrand')}</th>
                <th className="right">{t('prod.colCost')}</th>
                <th className="right">{t('prod.colPrice')}</th>
                <th className="right">{t('prod.colMargin')}</th>
                <th>{t('prod.colStatus')}</th>
                <th className="right">{t('prod.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="u-cell">
                      <span className="u-abbr">
                        {p.imageUrl ? <img src={p.imageUrl} alt="" className="ava-img" /> : p.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <div className="u-nm">{p.name}</div>
                        <div className="sub" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                          {p.sku ? `SKU · ${p.sku}` : t('prod.noSku')}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{p.categoryName ? <span className="chip-tag">{p.categoryName}</span> : '—'}</td>
                  <td className="mono">{p.brandName ?? '—'}</td>
                  <td className="right mono">{p.costPrice != null ? formatXAF(p.costPrice) : '—'}</td>
                  <td className="right mono">{formatXAF(p.sellingPrice)}</td>
                  <td className="right mono">{margin(p)}</td>
                  <td>
                    {p.isActive ? (
                      <span className="st st-brand">{t('prod.active')}</span>
                    ) : (
                      <span className="st st-neutral">{t('prod.inactive')}</span>
                    )}
                  </td>
                  <td className="right">{actions(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPage={setPage}
          prevLabel={t('common.prev')}
          nextLabel={t('common.next')}
        />
      </div>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t('prod.deleteTitle')}
        footer={
          <>
            <Button variant="soft" onClick={() => setDeleteTarget(null)} disabled={removeM.isPending}>
              {t('prod.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={removeM.isPending}
              style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
              onClick={() => void confirmDelete()}
            >
              {t('prod.delete')}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
          {t('prod.deleteBody').replace('{name}', deleteTarget?.name ?? '')}
        </p>
      </Modal>
    </div>
  )
}
