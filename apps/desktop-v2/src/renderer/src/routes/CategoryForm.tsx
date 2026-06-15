import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Select } from '@biztrack/ui/biztrack'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'
import type { CategoryInput, LocalCategory } from '@shared/ipc'

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const LEVEL_KEY: MessageKey[] = ['cat.levelDept', 'cat.levelCat', 'cat.levelSub']

// Full-page add/edit category form (matches design-form-category): Details + live
// slug + parent picker on the left; Placement (level + breadcrumb), Image, and
// Settings on the right. Variant attributes + image upload are shown as deferred
// (they need the Attributes module / media handling).
export function CategoryForm() {
  const t = useT()
  const navigate = useNavigate()
  const { id } = useParams()
  const editing = Boolean(id)
  const qc = useQueryClient()

  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => dataClient.categories.list(),
    enabled: isElectron,
  })

  const current = id ? (categories.find((c) => c.id === id) ?? null) : null

  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [isActive, setIsActive] = useState(true)
  const [nameError, setNameError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  // Populate once when editing (after the list resolves).
  useEffect(() => {
    if (!editing || loaded) return
    if (current) {
      setName(current.name)
      setParentId(current.parentId ?? '')
      setSortOrder(String(current.sortOrder))
      setIsActive(current.isActive)
      setLoaded(true)
    }
  }, [editing, loaded, current])

  // Valid parents: depth < 3, and not the category itself or its descendants.
  const descendantIds = useMemo(() => collectDescendants(categories, id ?? null), [categories, id])
  const parentOptions = useMemo(
    () => categories.filter((c) => c.depth < 3 && c.id !== id && !descendantIds.has(c.id)),
    [categories, id, descendantIds],
  )

  const parent = categories.find((c) => c.id === parentId) ?? null
  const depth = (parent?.depth ?? 0) + 1
  const path = parent ? ancestorPath(categories, parent.id) : []
  const slug = [...path.map((p) => slugify(p.name)), slugify(name) || '…'].join('/')

  const save = useMutation({
    mutationFn: (input: CategoryInput) =>
      editing && id ? dataClient.categories.update(id, input) : dataClient.categories.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.categories })
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
      parentId: parentId || null,
      sortOrder: Number(sortOrder) || 0,
      isActive,
      color: current?.color ?? null,
    })
  }

  return (
    <div className="frame">
      <div className="detail-top">
        <button type="button" className="back-btn" onClick={() => navigate('/products/categories')}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="m7 3-5 5 5 5" />
            <path d="M2 8h12" />
          </svg>
          {t('cat.back')}
        </button>
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
                <div className="ff" style={{ maxWidth: 180 }}>
                  <label className="lbl2">{t('cat.sortOrder')}</label>
                  <Input value={sortOrder} inputMode="numeric" onChange={(e) => setSortOrder(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="card">
              <div className="fsec-h">
                <span className="n">2</span>
                {t('cat.attrTitle')}
              </div>
              <div className="form-note">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 11v5M12 8h.01" />
                </svg>
                <span>{t('cat.attrNote')}</span>
              </div>
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
              <div className="imgdrop">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="m21 15-5-5L5 21" />
                </svg>
                <div className="t">{t('cat.image')}</div>
                <div className="s">{t('cat.imageSoon')}</div>
              </div>
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

function collectDescendants(all: LocalCategory[], rootId: string | null): Set<string> {
  const out = new Set<string>()
  if (!rootId) return out
  const childrenOf = (pid: string) => all.filter((c) => c.parentId === pid)
  const stack = [rootId]
  while (stack.length) {
    const next = stack.pop()!
    for (const child of childrenOf(next)) {
      if (!out.has(child.id)) {
        out.add(child.id)
        stack.push(child.id)
      }
    }
  }
  return out
}
