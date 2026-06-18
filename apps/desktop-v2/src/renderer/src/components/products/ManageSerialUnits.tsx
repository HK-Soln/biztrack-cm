import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Modal, Select } from '@biztrack/ui/biztrack'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { useBreakpoint } from '@/lib/useBreakpoint'
import { useT } from '@/i18n'
import { validateSerial } from '@/lib/serial'
import type { LocalProduct, LocalSerialUnit } from '@shared/ipc'

/**
 * Manage a serialised product's individual units (movement-based stock):
 *  - add a unit       → stock-in
 *  - retire a unit    → stock-out (with a reason)
 *  - edit the number  → correction (no movement)
 * Responsive: table on desktop/tablet, stacked cards on mobile.
 */
export function ManageSerialUnits({ product }: { product: LocalProduct }) {
  const t = useT()
  const qc = useQueryClient()
  const bp = useBreakpoint()
  const id = product.id
  const type = product.serialType ?? 'SERIAL_NUMBER'
  const typeLabel = t(`prodf.serial_${type}` as Parameters<typeof t>[0])

  const { data: serials = [] } = useQuery({
    queryKey: [...queryKeys.products, 'serials', id],
    queryFn: () => dataClient.products.listSerialUnits(id),
    enabled: isElectron,
  })
  const { data: variants = [] } = useQuery({
    queryKey: [...queryKeys.products, 'variants', id],
    queryFn: () => dataClient.products.listVariants(id),
    enabled: isElectron,
  })
  const hasVariants = variants.length > 0
  const variantName = (vid: string | null) => (vid ? (variants.find((v) => v.id === vid)?.name ?? null) : null)
  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.products })

  const [serial, setSerial] = useState('')
  const [variantId, setVariantId] = useState('')
  const [addErr, setAddErr] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')
  const [editErr, setEditErr] = useState<string | null>(null)
  const [retire, setRetire] = useState<LocalSerialUnit | null>(null)
  const [reason, setReason] = useState('')

  const addM = useMutation({
    mutationFn: (input: { serialNumber: string; variantId: string | null }) =>
      dataClient.products.addSerialUnits(id, [{ serialNumber: input.serialNumber, serialType: type, variantId: input.variantId }]),
    onSuccess: () => {
      setSerial('')
      setVariantId('')
      setAddErr(null)
      invalidate()
    },
    onError: (e) => setAddErr(e instanceof Error ? e.message : t('psu.addError')),
  })
  const renameM = useMutation({
    mutationFn: (input: { unitId: string; serialNumber: string }) =>
      dataClient.products.updateSerialNumber(id, input.unitId, input.serialNumber),
    onSuccess: () => {
      setEditId(null)
      setEditErr(null)
      invalidate()
    },
    onError: (e) => setEditErr(e instanceof Error ? e.message : t('psu.editError')),
  })
  const retireM = useMutation({
    mutationFn: (input: { unitId: string; reason: string }) => dataClient.products.retireSerialUnit(id, input.unitId, input.reason),
    onSuccess: () => {
      setRetire(null)
      setReason('')
      invalidate()
    },
  })

  const submitAdd = () => {
    const v = serial.trim()
    if (!v) return
    if (!validateSerial(v, type)) return setAddErr(t('psu.invalid').replace('{type}', typeLabel))
    if (hasVariants && !variantId) return setAddErr(t('psu.variantRequired'))
    addM.mutate({ serialNumber: v, variantId: hasVariants ? variantId : null })
  }
  const startEdit = (u: LocalSerialUnit) => {
    setEditId(u.id)
    setEditVal(u.serialNumber)
    setEditErr(null)
  }
  const saveEdit = (u: LocalSerialUnit) => {
    const v = editVal.trim()
    if (!v || v === u.serialNumber) return setEditId(null)
    if (!validateSerial(v, type)) return setEditErr(t('psu.invalid').replace('{type}', typeLabel))
    renameM.mutate({ unitId: u.id, serialNumber: v })
  }

  const statusPill = (status: string) =>
    status === 'RESERVED' ? (
      <span className="st st-low"><span className="d" />{t('psu.reserved')}</span>
    ) : (
      <span className="st st-ok"><span className="d" />{t('psu.inStock')}</span>
    )

  const editingCell = (u: LocalSerialUnit) => (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      <Input
        autoFocus
        value={editVal}
        onChange={(e) => {
          setEditVal(e.target.value)
          setEditErr(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') saveEdit(u)
          if (e.key === 'Escape') setEditId(null)
        }}
        style={{ height: 32, maxWidth: 200 }}
      />
      <span className="acts" style={{ display: 'inline-flex', gap: 4 }}>
        <button type="button" title={t('psu.save')} aria-label={t('psu.save')} onClick={() => saveEdit(u)} disabled={renameM.isPending} style={{ color: 'var(--success)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}><path d="M20 6 9 17l-5-5" /></svg>
        </button>
        <button type="button" title={t('psu.cancel')} aria-label={t('psu.cancel')} onClick={() => setEditId(null)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </span>
    </span>
  )

  const editIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="M14 6l4 4" /></svg>
  )
  const retireIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
  )

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-h">
        <div>
          <h3>{t('psu.title')}</h3>
          <p style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 2 }}>{t('psu.sub')}</p>
        </div>
        <span className="chip-tag">{t('psu.count').replace('{n}', String(serials.length))}</span>
      </div>

      {/* Add unit (a stock-in). */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <Input
            value={serial}
            placeholder={t(`prodf.serialPh_${type}` as Parameters<typeof t>[0])}
            inputMode={type === 'IMEI' ? 'numeric' : 'text'}
            onChange={(e) => {
              setSerial(e.target.value)
              setAddErr(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitAdd()
            }}
          />
        </div>
        {hasVariants ? (
          <div style={{ flex: '0 1 180px' }}>
            <Select value={variantId} onChange={(e) => setVariantId(e.target.value)}>
              <option value="">{t('psu.variantPick')}</option>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </Select>
          </div>
        ) : null}
        <Button variant="primary" onClick={submitAdd} loading={addM.isPending}>
          + {t('psu.add')}
        </Button>
      </div>
      {addErr ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: -6, marginBottom: 12 }} role="alert">{addErr}</p> : null}

      {serials.length === 0 ? (
        <div className="hint">{t('psu.empty')}</div>
      ) : bp === 'mobile' ? (
        // Mobile: stacked cards.
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {serials.map((u) => (
            <div key={u.id} className="card" style={{ background: 'var(--inset)', padding: 12 }}>
              {editId === u.id ? (
                editingCell(u)
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span className="serial-pill" style={{ cursor: 'pointer' }} onClick={() => startEdit(u)}>{u.serialNumber}</span>
                  {statusPill(u.status)}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{variantName(u.variantId) ?? '—'}</span>
                <span className="acts" style={{ display: 'inline-flex', gap: 4 }}>
                  <button type="button" title={t('psu.edit')} onClick={() => startEdit(u)}>{editIcon}</button>
                  {u.status === 'IN_STOCK' ? (
                    <button type="button" title={t('psu.retire')} onClick={() => setRetire(u)} style={{ color: 'var(--danger)' }}>{retireIcon}</button>
                  ) : null}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Desktop / tablet: table.
        <table className="ltbl">
          <thead>
            <tr>
              <th>{t('psu.colSerial')}</th>
              {hasVariants ? <th>{t('psu.colVariant')}</th> : null}
              <th>{t('psu.colStatus')}</th>
              <th className="right">{t('psu.colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {serials.map((u) => (
              <tr key={u.id}>
                <td>{editId === u.id ? editingCell(u) : <span className="serial-pill" style={{ cursor: 'pointer' }} onClick={() => startEdit(u)}>{u.serialNumber}</span>}</td>
                {hasVariants ? <td>{variantName(u.variantId) ?? '—'}</td> : null}
                <td>{statusPill(u.status)}</td>
                <td className="right">
                  <span className="acts" style={{ display: 'inline-flex', gap: 4, justifyContent: 'flex-end' }}>
                    <button type="button" title={t('psu.edit')} onClick={() => startEdit(u)}>{editIcon}</button>
                    {u.status === 'IN_STOCK' ? (
                      <button type="button" title={t('psu.retire')} onClick={() => setRetire(u)} style={{ color: 'var(--danger)' }}>{retireIcon}</button>
                    ) : null}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editErr ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 8 }} role="alert">{editErr}</p> : null}

      <Modal
        open={!!retire}
        onClose={() => setRetire(null)}
        title={t('psu.retireTitle')}
        footer={
          <>
            <Button variant="soft" onClick={() => setRetire(null)} disabled={retireM.isPending}>{t('psu.cancel')}</Button>
            <Button
              variant="primary"
              loading={retireM.isPending}
              disabled={reason.trim().length < 3}
              style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
              onClick={() => retire && retireM.mutate({ unitId: retire.id, reason: reason.trim() })}
            >
              {t('psu.retire')}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 12 }}>
          {t('psu.retireBody').replace('{serial}', retire?.serialNumber ?? '')}
        </p>
        <label className="lbl2">{t('psu.reason')}</label>
        <Input value={reason} placeholder={t('psu.reasonPh')} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </div>
  )
}
