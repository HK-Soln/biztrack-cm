import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BackButton,
  Button,
  CategoryTreePicker,
  Input,
  Modal,
  Pagination,
} from '@biztrack/ui/biztrack'
import { FileUpload } from '@/components/FileUpload'
import { dataClient } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { usePaged } from '@/lib/usePaged'
import { useT } from '@/i18n'
import { useBreakpoint } from '@/lib/useBreakpoint'
import type { BrandInput, LocalBrand, LocalCategory } from '@shared/ipc'

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '—'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
}

export function Brands() {
  const t = useT()
  const bp = useBreakpoint()
  const qc = useQueryClient()

  const {
    items: brands,
    total,
    page,
    limit,
    totalPages,
    isPending,
    search,
    setSearch,
    setPage,
  } = usePaged<LocalBrand>(queryKeys.brands, (q) => dataClient.brands.list(q), { enabled: true })
  const { data: categories = [] } = useQuery({
    queryKey: [...queryKeys.categories, 'all'],
    queryFn: () => dataClient.categories.listAll(),
    enabled: true,
  })
  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [brandModal, setBrandModal] = useState<{ brand?: LocalBrand } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LocalBrand | null>(null)
  const [newModel, setNewModel] = useState('')

  useEffect(() => {
    if (brands.length === 0) {
      if (selectedId !== null) setSelectedId(null)
      return
    }
    if (!selectedId || !brands.some((b) => b.id === selectedId)) {
      if (bp !== 'mobile') setSelectedId(brands[0]!.id)
    }
  }, [brands, selectedId, bp])

  const selected = brands.find((b) => b.id === selectedId) ?? null
  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.brands })

  const removeBrand = useMutation({
    mutationFn: (id: string) => dataClient.brands.remove(id),
    onSuccess: invalidate,
  })
  const addModel = useMutation({
    mutationFn: ({ brandId, name }: { brandId: string; name: string }) =>
      dataClient.brands.addModel(brandId, { name }),
    onSuccess: invalidate,
  })
  const removeModel = useMutation({
    mutationFn: (modelId: string) => dataClient.brands.removeModel(modelId),
    onSuccess: invalidate,
  })
  const [editingModel, setEditingModel] = useState<{ id: string; name: string } | null>(null)
  const updateModel = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      dataClient.brands.updateModel(id, { name }),
    onSuccess: () => {
      invalidate()
      setEditingModel(null)
    },
  })
  const saveModelEdit = () => {
    const name = editingModel?.name.trim()
    if (!editingModel || !name) return
    updateModel.mutate({ id: editingModel.id, name })
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    await removeBrand.mutateAsync(deleteTarget.id)
    if (selectedId === deleteTarget.id) setSelectedId(null)
    setDeleteTarget(null)
  }

  const submitModel = () => {
    const name = newModel.trim()
    if (!name || !selected) return
    addModel.mutate({ brandId: selected.id, name })
    setNewModel('')
  }

  const brandList = (
    <div className="panel">
      <div className="panel-head">
        <h3>{t('brand.all')}</h3>
        <span className="chip-tag">{total}</span>
        <div className="spacer" style={{ flex: 1 }} />
        <Input
          value={search}
          placeholder={t('brand.search')}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 200, height: 34 }}
        />
      </div>
      <div className="slist">
        {brands.map((b) => (
          <button
            key={b.id}
            type="button"
            className={`it${b.id === selectedId ? ' sel' : ''}`}
            onClick={() => setSelectedId(b.id)}
          >
            <span className="ic">
              {b.logoUrl ? <img src={b.logoUrl} alt="" className="ava-img" /> : initials(b.name)}
            </span>
            <span className="tx">
              <span className="nm" title={b.name}>
                {b.name}
              </span>
              <span className="sub">
                {b.categoryIds.length} {t('brand.catsWord')} · {b.models.length}{' '}
                {t('brand.modelsWord')}
              </span>
            </span>
          </button>
        ))}
        {brands.length === 0 ? <div className="cat-empty">{t('brand.empty')}</div> : null}
      </div>
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
  )

  const detail = selected ? (
    <div className="mddetail">
      {bp === 'mobile' ? (
        <BackButton onClick={() => setSelectedId(null)} style={{ marginBottom: 12 }}>
          {t('brand.back')}
        </BackButton>
      ) : null}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="dhero-in">
          <span className="av">
            {selected.logoUrl ? (
              <img src={selected.logoUrl} alt="" className="ava-img" />
            ) : (
              initials(selected.name)
            )}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="eyebrow">{t('brand.eyebrow')}</div>
            <h1 style={{ fontSize: 21, fontWeight: 700 }}>{selected.name}</h1>
          </div>
          <Button variant="soft" onClick={() => setBrandModal({ brand: selected })}>
            {t('brand.edit')}
          </Button>
          <Button
            variant="soft"
            onClick={() => setDeleteTarget(selected)}
            style={{ color: 'var(--danger)' }}
          >
            {t('brand.delete')}
          </Button>
        </div>
        {selected.description ? (
          <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, marginTop: 12 }}>
            {selected.description}
          </p>
        ) : null}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-h">
          <div>
            <h3>{t('brand.categories')}</h3>
            <p>{t('brand.categoriesHint')}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {selected.categoryIds.length === 0 ? (
            <span className="cat-empty" style={{ padding: 0 }}>
              {t('brand.noCategories')}
            </span>
          ) : (
            selected.categoryIds.map((cid) => (
              <span key={cid} className="chip-tag">
                {categoryName.get(cid) ?? '—'}
              </span>
            ))
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <div>
            <h3>
              {t('brand.models')} · {selected.models.length}
            </h3>
            <p>{t('brand.modelsHint')}</p>
          </div>
        </div>
        <div className="opt-list">
          {selected.models.map((m) =>
            editingModel?.id === m.id ? (
              <div key={m.id} className="opt-edit">
                <Input
                  autoFocus
                  value={editingModel.name}
                  onChange={(e) => setEditingModel({ id: m.id, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      saveModelEdit()
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      setEditingModel(null)
                    }
                  }}
                  style={{ flex: 1, height: 32 }}
                />
                <button
                  type="button"
                  className="opt-ok"
                  title={t('brand.save')}
                  disabled={updateModel.isPending || !editingModel.name.trim()}
                  onClick={saveModelEdit}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path d="m5 12 5 5L20 7" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="opt-del"
                  title={t('brand.cancel')}
                  onClick={() => setEditingModel(null)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </div>
            ) : (
              <div key={m.id} className="opt-edit">
                <button
                  type="button"
                  className="ov"
                  title={m.name}
                  onClick={() => setEditingModel({ id: m.id, name: m.name })}
                >
                  {m.name}
                </button>
                <button
                  type="button"
                  className="opt-del"
                  title={t('brand.removeModel')}
                  onClick={() => removeModel.mutate(m.id)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </div>
            ),
          )}
          {selected.models.length === 0 ? (
            <div className="cat-empty">{t('brand.noModels')}</div>
          ) : null}
        </div>
        <div className="opt-add">
          <Input
            value={newModel}
            placeholder={t('brand.modelPh')}
            onChange={(e) => setNewModel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submitModel()
              }
            }}
          />
          <Button
            variant="primary"
            onClick={submitModel}
            disabled={addModel.isPending || !newModel.trim()}
          >
            {t('brand.add')}
          </Button>
        </div>
      </div>
    </div>
  ) : (
    <div className="card mddetail">
      <div className="cat-empty">{t('brand.selectHint')}</div>
    </div>
  )

  const modals = (
    <>
      {brandModal ? (
        <BrandModal
          brand={brandModal.brand}
          categories={categories}
          onClose={() => setBrandModal(null)}
          onSaved={(id) => {
            invalidate()
            setBrandModal(null)
            if (!brandModal.brand) setSelectedId(id)
          }}
        />
      ) : null}

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t('brand.deleteTitle')}
        footer={
          <>
            <Button
              variant="soft"
              onClick={() => setDeleteTarget(null)}
              disabled={removeBrand.isPending}
            >
              {t('brand.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={removeBrand.isPending}
              style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
              onClick={() => void confirmDelete()}
            >
              {t('brand.delete')}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
          {t('brand.deleteBody').replace('{name}', deleteTarget?.name ?? '')}
        </p>
      </Modal>
    </>
  )

  // --- mobile: master-detail (list → tap → detail with back) + FAB ---------
  if (bp === 'mobile') {
    return (
      <>
        {selected ? (
          detail
        ) : (
          <>
            <header className="m-head">
              <div className="m-tt">
                <div className="m-title">{t('brand.title')}</div>
                <div className="m-sub">{t('brand.subtitle')}</div>
              </div>
            </header>

            <div className="msearch" style={{ marginBottom: 13 }}>
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <circle cx="9" cy="9" r="6" />
                <path d="m14 14 3 3" />
              </svg>
              <input
                value={search}
                placeholder={t('brand.search')}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="mlist">
              {isPending && brands.length === 0 ? (
                <div className="mrow" style={{ cursor: 'default' }}>
                  <div className="mt">
                    <div className="sub">{t('brand.loading')}</div>
                  </div>
                </div>
              ) : null}
              {!isPending && brands.length === 0 ? (
                <div className="mrow" style={{ cursor: 'default' }}>
                  <div className="mt">
                    <div className="sub">{t('brand.empty')}</div>
                  </div>
                </div>
              ) : null}
              {brands.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="mrow"
                  onClick={() => setSelectedId(b.id)}
                >
                  <div className="th">
                    {b.logoUrl ? <img src={b.logoUrl} alt="" /> : initials(b.name)}
                  </div>
                  <div className="mt">
                    <div className="nm">{b.name}</div>
                    <div className="sub">
                      {b.categoryIds.length} {t('brand.catsWord')} · {b.models.length}{' '}
                      {t('brand.modelsWord')}
                    </div>
                  </div>
                  <svg
                    className="chev"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                </button>
              ))}
            </div>

            {totalPages > 1 ? (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14 }}>
                <button
                  type="button"
                  className="mbtn"
                  style={{ width: 'auto', padding: '0 18px' }}
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  {t('common.prev')}
                </button>
                <button
                  type="button"
                  className="mbtn"
                  style={{ width: 'auto', padding: '0 18px' }}
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  {t('common.next')}
                </button>
              </div>
            ) : null}

            <div style={{ height: 76 }} />
            <button
              type="button"
              className="mfab"
              onClick={() => setBrandModal({})}
              aria-label={t('brand.new')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </>
        )}
        {modals}
      </>
    )
  }

  return (
    <div className="frame">
      <div className="page-head">
        <div>
          <h1>{t('brand.title')}</h1>
          <p>{t('brand.subtitle')}</p>
        </div>
        <Button variant="primary" onClick={() => setBrandModal({})}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 5v14M5 12h14" />
          </svg>
          {t('brand.new')}
        </Button>
      </div>

      {isPending ? (
        <div className="cat-empty">{t('brand.loading')}</div>
      ) : (
        <div className="mdlayout wide">
          {brandList}
          {detail}
        </div>
      )}

      {modals}
    </div>
  )
}

function BrandModal({
  brand,
  categories,
  onClose,
  onSaved,
}: {
  brand?: LocalBrand
  categories: LocalCategory[]
  onClose: () => void
  onSaved: (id: string) => void
}) {
  const t = useT()
  const editing = Boolean(brand)
  const [name, setName] = useState(brand?.name ?? '')
  const [description, setDescription] = useState(brand?.description ?? '')
  const [catIds, setCatIds] = useState<string[]>(brand?.categoryIds ?? [])
  const [logoUrl, setLogoUrl] = useState<string | null>(brand?.logoUrl ?? null)
  const [error, setError] = useState<string | null>(null)

  // Brands attach categories at any level — the tree below shows the full hierarchy;
  // a linked branch is expanded to its terminal leaves when picking a product category.
  const treeNodes = useMemo(
    () => categories.map((c) => ({ id: c.id, name: c.name, parentId: c.parentId })),
    [categories],
  )

  const save = useMutation({
    mutationFn: () => {
      const input: BrandInput = {
        name: name.trim(),
        description: description.trim() || null,
        logoUrl,
        categoryIds: catIds,
      }
      return editing && brand
        ? dataClient.brands.update(brand.id, input)
        : dataClient.brands.create(input)
    },
    onSuccess: (b) => onSaved(b.id),
    onError: () => setError(t('brand.saveError')),
  })

  const submit = () => {
    if (!name.trim()) {
      setError(t('brand.nameRequired'))
      return
    }
    setError(null)
    save.mutate()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? t('brand.editTitle') : t('brand.new')}
      footer={
        <>
          <Button variant="soft" onClick={onClose} disabled={save.isPending}>
            {t('brand.cancel')}
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            {editing ? t('brand.save') : t('brand.create')}
          </Button>
        </>
      }
    >
      <div className="ff" style={{ marginBottom: 12 }}>
        <label className="lbl2">{t('brand.logo')}</label>
        <FileUpload
          value={logoUrl}
          onChange={setLogoUrl}
          folder="brands"
          variant="image"
          allowedTypes={ALLOWED_IMAGE_TYPES}
          label={t('brand.logoUpload')}
          typeError={t('brand.logoTypeError')}
        />
      </div>
      <div className="ff" style={{ marginBottom: 12 }}>
        <label className="lbl2">
          {t('brand.name')} <span className="req">*</span>
        </label>
        <Input
          value={name}
          error={!!error && !name.trim()}
          placeholder={t('brand.namePh')}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
        />
      </div>
      <div className="ff" style={{ marginBottom: 12 }}>
        <label className="lbl2">
          {t('brand.description')} <span className="opt">{t('brand.optional')}</span>
        </label>
        <textarea
          className="input"
          rows={2}
          style={{ resize: 'vertical', paddingTop: 10 }}
          placeholder={t('brand.descriptionPh')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="ff">
        <label className="lbl2">
          {t('brand.categories')} <span className="opt">{t('brand.optional')}</span>
          {catIds.length > 0 ? (
            <span className="chip-tag" style={{ marginLeft: 8 }}>
              {catIds.length}
            </span>
          ) : null}
        </label>
        <div className="hint" style={{ marginBottom: 8 }}>
          {t('brand.categoriesPickHint')}
        </div>
        {categories.length === 0 ? (
          <div className="form-note">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5M12 8h.01" />
            </svg>
            <span>{t('brand.catEmpty')}</span>
          </div>
        ) : (
          <CategoryTreePicker
            nodes={treeNodes}
            value={catIds}
            onChange={(next) => {
              setCatIds(next)
              setError(null)
            }}
            searchPlaceholder={t('brand.catSearch')}
            emptyLabel={t('brand.catEmpty')}
            noMatchLabel={t('brand.catNoMatch')}
          />
        )}
      </div>
      {error ? (
        <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }} role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  )
}
