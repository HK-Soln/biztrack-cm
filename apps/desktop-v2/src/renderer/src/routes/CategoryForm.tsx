import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BackButton, Button, Input, Select } from '@biztrack/ui/biztrack'
import { FileUpload } from '@/components/FileUpload'
import { dataClient } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'
import type { CategoryInput, LocalAttributeGroup, LocalCategory } from '@shared/ipc'

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const LEVEL_KEY: MessageKey[] = ['cat.levelDept', 'cat.levelCat', 'cat.levelSub']

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

// Full-page add/edit category form (matches design-form-category): Details (name +
// live slug + parent + description) and variant attributes on the left; Placement
// (level + breadcrumb), Image upload, and Settings (active / show-online) on the
// right. Variant attributes attach/reorder/require apply to leaf categories.
export function CategoryForm() {
  const t = useT()
  const navigate = useNavigate()
  const { id } = useParams()
  const editing = Boolean(id)
  const qc = useQueryClient()

  const { data: categories = [] } = useQuery({
    queryKey: [...queryKeys.categories, 'all'],
    queryFn: () => dataClient.categories.listAll(),
    enabled: true,
  })

  const current = id ? (categories.find((c) => c.id === id) ?? null) : null

  // Variant attributes apply only to leaf categories (no sub-categories). A brand-new
  // category is a leaf; an existing one is a leaf when nothing is parented under it.
  const isLeaf = !categories.some((c) => c.parentId === id)

  const { data: allGroups = [] } = useQuery({
    queryKey: [...queryKeys.attributeGroups, 'all'],
    queryFn: () => dataClient.attributes.listAllGroups(),
    enabled: true,
  })
  const linksQuery = useQuery({
    queryKey: queryKeys.categoryAttributeLinks(id ?? 'new'),
    queryFn: () => dataClient.attributes.listCategoryLinks(id!),
    enabled: editing,
  })
  const existingLinks = useMemo(() => linksQuery.data ?? [], [linksQuery.data])
  // For a new category there are no links to load; for an existing one we must wait
  // until the links query resolves before we can safely persist (see save below).
  const linksReady = !editing || linksQuery.isSuccess

  // Ordered list of attached groups (the category's variant dimensions).
  const [attached, setAttached] = useState<Array<{ attributeGroupId: string; isRequired: boolean }>>([])
  const [attachLoaded, setAttachLoaded] = useState(false)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [parentId, setParentId] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [isActive, setIsActive] = useState(true)
  const [showOnline, setShowOnline] = useState(true)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  // Populate once when editing (after the list resolves).
  useEffect(() => {
    if (!editing || loaded) return
    if (current) {
      setName(current.name)
      setDescription(current.description ?? '')
      setParentId(current.parentId ?? '')
      setSortOrder(String(current.sortOrder))
      setIsActive(current.isActive)
      setShowOnline(current.showOnline)
      setImageUrl(current.imageUrl)
      setLoaded(true)
    }
  }, [editing, loaded, current])

  // Seed attached groups from the category's existing links — once the query resolves
  // (even if empty, so attachLoaded reliably means "we know the current links").
  useEffect(() => {
    if (!editing || attachLoaded || !linksQuery.isSuccess) return
    setAttached(
      [...existingLinks]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((l) => ({ attributeGroupId: l.attributeGroupId, isRequired: l.isRequired })),
    )
    setAttachLoaded(true)
  }, [editing, attachLoaded, linksQuery.isSuccess, existingLinks])

  const attachedIds = new Set(attached.map((a) => a.attributeGroupId))
  const groupsById = new Map(allGroups.map((g) => [g.id, g]))
  // Attached groups first (in their order), then the rest available to attach.
  const orderedGroups = [
    ...attached.map((a) => groupsById.get(a.attributeGroupId)).filter((g): g is LocalAttributeGroup => !!g),
    ...allGroups.filter((g) => !attachedIds.has(g.id)),
  ]

  const toggleAttach = (groupId: string) =>
    setAttached((prev) =>
      prev.some((a) => a.attributeGroupId === groupId)
        ? prev.filter((a) => a.attributeGroupId !== groupId)
        : [...prev, { attributeGroupId: groupId, isRequired: true }],
    )
  const toggleRequired = (groupId: string) =>
    setAttached((prev) =>
      prev.map((a) => (a.attributeGroupId === groupId ? { ...a, isRequired: !a.isRequired } : a)),
    )
  const moveAttached = (groupId: string, dir: -1 | 1) =>
    setAttached((prev) => {
      const i = prev.findIndex((a) => a.attributeGroupId === groupId)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j]!, next[i]!]
      return next
    })

  // Parent eligibility (depth<3, no products, no variant options, not self/descendant)
  // is computed by the service so the same rule holds everywhere.
  const { data: parentOptions = [] } = useQuery({
    queryKey: [...queryKeys.categories, 'parent-options', id ?? 'new'],
    queryFn: () => dataClient.categories.listParentOptions({ excludeId: id }),
    enabled: true,
  })

  const parent = categories.find((c) => c.id === parentId) ?? null
  const depth = (parent?.depth ?? 0) + 1
  const path = parent ? ancestorPath(categories, parent.id) : []
  const slug = [...path.map((p) => slugify(p.name)), slugify(name) || '…'].join('/')

  const save = useMutation({
    mutationFn: async (input: CategoryInput) => {
      const saved =
        editing && id ? await dataClient.categories.update(id, input) : await dataClient.categories.create(input)
      // Persist variant-attribute links only for leaf categories — and only once the
      // existing links have loaded, so a save before the seed can't wipe them.
      if (isLeaf && linksReady) {
        await dataClient.attributes.setCategoryLinks(
          saved.id,
          attached.map((a, i) => ({ attributeGroupId: a.attributeGroupId, isRequired: a.isRequired, sortOrder: i })),
        )
      }
      return saved
    },
    onSuccess: (saved) => {
      void qc.invalidateQueries({ queryKey: queryKeys.categories })
      void qc.invalidateQueries({ queryKey: queryKeys.categoryAttributeLinks(saved.id) })
      navigate('/products/categories')
    },
    onError: () => setFormError(t('cat.error')),
  })

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!name.trim()) {
      setNameError(t('cat.nameRequired'))
      return
    }
    setFormError(null)
    save.mutate({
      name: name.trim(),
      description: description.trim() || null,
      parentId: parentId || null,
      sortOrder: Number(sortOrder) || 0,
      isActive,
      showOnline,
      imageUrl,
      color: current?.color ?? null,
    })
  }

  return (
    <div className="frame">
      <div className="detail-top">
        <BackButton onClick={() => navigate('/products/categories')}>{t('cat.back')}</BackButton>
        <div className="acts2">
          <Button variant="soft" onClick={() => navigate('/products/categories')} disabled={save.isPending}>
            {t('cat.cancel')}
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={() => submit()}>
            {editing ? t('cat.save') : t('cat.create')}
          </Button>
        </div>
      </div>

      <div className="page-head">
        <div>
          <h1>{editing ? t('cat.editTitle') : t('cat.addTitle')}</h1>
          <p>{t('cat.addSubtitle')}</p>
        </div>
      </div>

      <form className="formpage" onSubmit={submit}>
        <div className="fp-grid">
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="fsec-h">
                <span className="n">1</span>
                {t('cat.details')}
              </div>
              <div className="fform">
                <div className={`ff${nameError ? ' invalid' : ''}`}>
                  <label className="lbl2">
                    {t('cat.name')} <span className="req">*</span>
                  </label>
                  <Input
                    value={name}
                    error={!!nameError}
                    placeholder={t('cat.namePh')}
                    onChange={(e) => {
                      setName(e.target.value)
                      setNameError(null)
                    }}
                  />
                  {nameError ? (
                    <div className="msg err">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 8v5M12 16h.01" />
                      </svg>
                      <span>{nameError}</span>
                    </div>
                  ) : (
                    <div className="hint">
                      {t('cat.slug')} · <span style={{ color: 'var(--brand-int)' }}>{slug}</span>
                    </div>
                  )}
                </div>
                <div className="ff">
                  <label className="lbl2">{t('cat.parent')}</label>
                  <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
                    <option value="">{t('cat.parentNone')}</option>
                    {parentOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="ff">
                  <label className="lbl2">
                    {t('cat.description')} <span className="opt">{t('cat.optional')}</span>
                  </label>
                  <textarea
                    className="input"
                    rows={2}
                    style={{ resize: 'vertical', paddingTop: 10 }}
                    placeholder={t('cat.descriptionPh')}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div className="ff" style={{ maxWidth: 180 }}>
                  <label className="lbl2">{t('cat.sortOrder')}</label>
                  <Input value={sortOrder} inputMode="numeric" onChange={(e) => setSortOrder(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="card">
              <div className="fsec-h" style={{ justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span className="n">2</span>
                  {t('cat.attrTitle')}
                </span>
                {isLeaf ? (
                  <span className="chip-tag">{t('cat.attrAttached').replace('{n}', String(attached.length))}</span>
                ) : null}
              </div>

              {!isLeaf ? (
                <div className="form-note">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 11v5M12 8h.01" />
                  </svg>
                  <span>{t('cat.attrLeafOnly')}</span>
                </div>
              ) : allGroups.length === 0 ? (
                <div className="form-note">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 11v5M12 8h.01" />
                  </svg>
                  <span>{t('cat.attrEmpty')}</span>
                </div>
              ) : (
                <>
                  <div className="form-note" style={{ marginBottom: 4 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 11v5M12 8h.01" />
                    </svg>
                    <span>{t('cat.attrNote')}</span>
                  </div>
                  <div className="attr-rows">
                    {orderedGroups.map((g) => {
                      const att = attached.find((a) => a.attributeGroupId === g.id)
                      const on = !!att
                      const pos = attached.findIndex((a) => a.attributeGroupId === g.id)
                      return (
                        <div key={g.id} className={`attr-row${on ? ' on' : ''}`}>
                          <button
                            type="button"
                            className={`switch${on ? ' on' : ''}`}
                            aria-pressed={on}
                            onClick={() => toggleAttach(g.id)}
                          />
                          <div className="attr-main">
                            <div className="attr-name">
                              {g.name} <span className="attr-type">{t(`attr.${g.displayType.toLowerCase()}` as MessageKey)}</span>
                            </div>
                            <div className="attr-preview">
                              {g.displayType === 'SWATCHES'
                                ? g.options.slice(0, 6).map((o) => (
                                    <span key={o.id} className="attr-sw" style={{ background: o.colorHex ?? '#ccc' }} />
                                  ))
                                : g.options.slice(0, 5).map((o) => (
                                    <span key={o.id} className="attr-cp">
                                      {o.value}
                                    </span>
                                  ))}
                              {g.options.length === 0 ? <span className="muted">—</span> : null}
                            </div>
                          </div>
                          {on ? (
                            <div className="attr-ctl">
                              <button
                                type="button"
                                className={`reqpill${att!.isRequired ? ' on' : ''}`}
                                onClick={() => toggleRequired(g.id)}
                              >
                                {att!.isRequired ? t('cat.attrRequired') : t('cat.attrOptional')}
                              </button>
                              <div className="attr-reorder">
                                <button type="button" disabled={pos === 0} onClick={() => moveAttached(g.id, -1)} aria-label="up">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                    <path d="m6 15 6-6 6 6" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  disabled={pos === attached.length - 1}
                                  onClick={() => moveAttached(g.id, 1)}
                                  aria-label="down"
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                    <path d="m6 9 6 6 6-6" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

              <button type="button" className="ab" style={{ marginTop: 10 }} onClick={() => navigate('/products/attributes')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 5v14M5 12h14" />
                </svg>
                {t('cat.attrManage')}
              </button>
            </div>
          </div>

          <div className="fp-side">
            <div className="card">
              <div className="fsec-h" style={{ marginBottom: 11 }}>
                {t('cat.placement')}
              </div>
              <div className="level-pill" style={{ marginBottom: 12 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ width: 14, height: 14 }}>
                  <path d="M3 21h18M5 21V7l7-4 7 4v14" />
                </svg>
                <span>{t(LEVEL_KEY[Math.min(depth, 3) - 1] ?? 'cat.levelDept')}</span>
              </div>
              <div className="crumb">
                {path.map((p) => (
                  <span key={p.id}>
                    <span className="muted">{p.name}</span>
                    <span className="sep"> › </span>
                  </span>
                ))}
                <span className="cur">{name.trim() || t('cat.name')}</span>
              </div>
            </div>

            <div className="card">
              <div className="fsec-h" style={{ marginBottom: 10 }}>
                {t('cat.image')}
              </div>
              <FileUpload
                value={imageUrl}
                onChange={setImageUrl}
                folder="categories"
                variant="image"
                allowedTypes={ALLOWED_IMAGE_TYPES}
                label={t('cat.imageUpload')}
                hint={t('cat.imageHint')}
                typeError={t('cat.imageTypeError')}
              />
            </div>

            <div className="card">
              <div className="set-line">
                <div className="t">
                  <div className="nm">{t('cat.active')}</div>
                  <div className="ds">{t('cat.activeHint')}</div>
                </div>
                <button
                  type="button"
                  className={`switch${isActive ? ' on' : ''}`}
                  aria-pressed={isActive}
                  onClick={() => setIsActive((v) => !v)}
                />
              </div>
              <div className="set-line" style={{ borderBottom: 0 }}>
                <div className="t">
                  <div className="nm">{t('cat.showOnline')}</div>
                  <div className="ds">{t('cat.showOnlineHint')}</div>
                </div>
                <button
                  type="button"
                  className={`switch${showOnline ? ' on' : ''}`}
                  aria-pressed={showOnline}
                  onClick={() => setShowOnline((v) => !v)}
                />
              </div>
            </div>

            {formError ? (
              <p style={{ color: 'var(--danger)', fontSize: 12.5 }} role="alert">
                {formError}
              </p>
            ) : null}

            <div className="fp-actions">
              <Button variant="soft" type="button" onClick={() => navigate('/products/categories')} disabled={save.isPending}>
                {t('cat.cancel')}
              </Button>
              <Button variant="primary" type="submit" loading={save.isPending}>
                {editing ? t('cat.save') : t('cat.create')}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}

function ancestorPath(all: LocalCategory[], id: string): LocalCategory[] {
  const byId = new Map(all.map((c) => [c.id, c]))
  const path: LocalCategory[] = []
  let cur = byId.get(id) ?? null
  const guard = new Set<string>()
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id)
    path.unshift(cur)
    cur = cur.parentId ? (byId.get(cur.parentId) ?? null) : null
  }
  return path
}
