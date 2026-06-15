import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Modal } from '@biztrack/ui/biztrack'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { useT } from '@/i18n'
import { useBreakpoint } from '@/lib/useBreakpoint'
import type { LocalCategory } from '@shared/ipc'

function avatarStyle(c: Pick<LocalCategory, 'color'>) {
  return c.color ? { background: c.color } : undefined
}

export function Categories() {
  const t = useT()
  const bp = useBreakpoint()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: categories = [], isPending } = useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => dataClient.categories.list(),
    enabled: isElectron,
  })

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
      className={`cat-row${selectedId === c.id ? ' sel' : ''}${c.depth > 1 ? ' child' : ''}`}
      onClick={() => (bp === 'mobile' ? edit(c.id) : setSelectedId(c.id))}
    >
      <span className="ava" style={avatarStyle(c)}>
        {c.name.trim().charAt(0) || 'C'}
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
    <div className="cat-list">
      {categories.map((c) => (
        <Row key={c.id} c={c} />
      ))}
    </div>
  )

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
      ) : categories.length === 0 ? (
        <div className="card">
          <div className="cat-empty">{t('cat.empty')}</div>
        </div>
      ) : bp === 'mobile' ? (
        list
      ) : (
        <div className="md">
          {list}
          <div className="card cat-detail">
            {selected ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                  <span className="av" style={avatarStyle(selected)}>
                    {selected.name.trim().charAt(0) || 'C'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h1 style={{ fontSize: 20, fontWeight: 700 }}>{selected.name}</h1>
                    <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>
                      {t('cat.level')} {selected.depth}
                    </p>
                  </div>
                  <Button variant="soft" onClick={() => edit(selected.id)}>
                    {t('cat.edit')}
                  </Button>
                  <Button variant="soft" onClick={() => setDeleteTarget(selected)} style={{ color: 'var(--danger)' }}>
                    {t('cat.delete')}
                  </Button>
                </div>
                <div className="cat-empty">{t('cat.noProducts')}</div>
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
