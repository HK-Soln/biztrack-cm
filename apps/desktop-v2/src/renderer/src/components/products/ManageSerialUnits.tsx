import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Modal, Pagination, ScanInput, Select } from '@biztrack/ui/biztrack'
import { dataClient } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { usePaged } from '@/lib/usePaged'
import { useBreakpoint } from '@/lib/useBreakpoint'
import { errorMessage } from '@/lib/error'
import { useT } from '@/i18n'
import { validateSerial } from '@/lib/serial'
import type { LocalProduct, LocalSerialUnit } from '@shared/ipc'

const PAGE_SIZE = 5

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

  // The displayed units are paginated + searched by the BFF/API (5 per page); the renderer
  // never holds the full set. Existing-duplicate/format enforcement happens server-side.
  const {
    items: serials,
    total: totalSerials,
    page,
    totalPages,
    isPending: serialsLoading,
    setPage,
    search,
    setSearch,
  } = usePaged<LocalSerialUnit>([...queryKeys.products, 'serials-page', id], (q) =>
    dataClient.products.listSerialUnitsPage(id, { ...q, limit: PAGE_SIZE }),
  )
  const { data: variants = [] } = useQuery({
    queryKey: [...queryKeys.products, 'variants', id],
    queryFn: () => dataClient.products.listVariants(id),
  })
  const hasVariants = variants.length > 0
  const variantName = (vid: string | null) =>
    vid ? (variants.find((v) => v.id === vid)?.name ?? null) : null
  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.products })

  const [serial, setSerial] = useState('')
  const [variantId, setVariantId] = useState('')
  const [addErr, setAddErr] = useState<string | null>(null)
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkErr, setBulkErr] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')
  const [editErr, setEditErr] = useState<string | null>(null)
  const [retire, setRetire] = useState<LocalSerialUnit | null>(null)
  const [reason, setReason] = useState('')

  const addM = useMutation({
    mutationFn: (input: { serialNumber: string; variantId: string | null }) =>
      dataClient.products.addSerialUnits(id, [
        { serialNumber: input.serialNumber, serialType: type, variantId: input.variantId },
      ]),
    onSuccess: () => {
      setSerial('')
      setVariantId('')
      setAddErr(null)
      invalidate()
    },
    onError: (e) => setAddErr(errorMessage(e, t('psu.addError'))),
  })
  const renameM = useMutation({
    mutationFn: (input: { unitId: string; serialNumber: string }) =>
      dataClient.products.updateSerialNumber(id, input.unitId, input.serialNumber),
    onSuccess: () => {
      setEditId(null)
      setEditErr(null)
      invalidate()
    },
    onError: (e) => setEditErr(errorMessage(e, t('psu.editError'))),
  })
  const retireM = useMutation({
    mutationFn: (input: { unitId: string; reason: string }) =>
      dataClient.products.retireSerialUnit(id, input.unitId, input.reason),
    onSuccess: () => {
      setRetire(null)
      setReason('')
      invalidate()
    },
  })

  const addSerial = (raw: string) => {
    const v = raw.trim()
    if (!v) return
    if (!validateSerial(v, type)) return setAddErr(t('psu.invalid').replace('{type}', typeLabel))
    if (hasVariants && !variantId) return setAddErr(t('psu.variantRequired'))
    // Existing duplicates are enforced server-side (the renderer only holds the current page).
    addM.mutate({ serialNumber: v, variantId: hasVariants ? variantId : null })
  }
  const submitAdd = () => addSerial(serial)

  // --- bulk add (paste / scan) ----------------------------------------------
  // Split on newlines, commas, semicolons or whitespace; classify each entry so the user
  // sees valid / duplicate / invalid before committing. "dup" is a within-batch repeat;
  // clashes with already-stored units are rejected server-side on submit. A barcode scanner
  // sends each code + Enter, so scanning straight into the textarea just works.
  const bulkTokens = useMemo(() => {
    const seen = new Set<string>()
    return bulkText
      .split(/[\n,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((value) => {
        const key = value.toLowerCase()
        const status: 'ok' | 'dup' | 'invalid' = !validateSerial(value, type)
          ? 'invalid'
          : seen.has(key)
            ? 'dup'
            : 'ok'
        seen.add(key)
        return { value, status }
      })
  }, [bulkText, type])
  const validTokens = bulkTokens.filter((tk) => tk.status === 'ok')

  const bulkM = useMutation({
    mutationFn: () =>
      dataClient.products.addSerialUnits(
        id,
        validTokens.map((tk) => ({
          serialNumber: tk.value,
          serialType: type,
          variantId: hasVariants ? variantId : null,
        })),
        'Bulk add',
      ),
    onSuccess: () => {
      setBulkText('')
      setVariantId('')
      setBulkErr(null)
      setBulkMode(false)
      invalidate()
    },
    onError: (e) => setBulkErr(errorMessage(e, t('psu.addError'))),
  })
  const submitBulk = () => {
    if (hasVariants && !variantId) return setBulkErr(t('psu.bulkVariantRequired'))
    if (validTokens.length === 0) return setBulkErr(t('psu.bulkNone'))
    bulkM.mutate()
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
    // Duplicate serials are enforced server-side (the renderer only holds the current page).
    renameM.mutate({ unitId: u.id, serialNumber: v })
  }

  // Only in-stock units can be renamed or retired — sold/reserved/returned/damaged units
  // are committed and must stay as recorded.
  const canModify = (u: LocalSerialUnit) => u.status === 'IN_STOCK'

  const statusPill = (status: string) => {
    switch (status) {
      case 'RESERVED':
        return (
          <span className="st st-low">
            <span className="d" />
            {t('psu.reserved')}
          </span>
        )
      case 'SOLD':
        return <span className="st st-neutral">{t('psu.sold')}</span>
      case 'RETURNED':
        return <span className="st st-neutral">{t('psu.returned')}</span>
      case 'DAMAGED':
        return <span className="st st-neutral">{t('psu.damaged')}</span>
      default:
        return (
          <span className="st st-ok">
            <span className="d" />
            {t('psu.inStock')}
          </span>
        )
    }
  }

  const editingCell = (u: LocalSerialUnit) => (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      <ScanInput
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
        onScan={(v) => {
          setEditVal(v)
          setEditErr(null)
        }}
        scanTitle={t('scan.title')}
        cameraTitle={t('scan.camTitle')}
        cameraHint={t('scan.camHint')}
        cameraError={t('scan.camError')}
        style={{ height: 32, maxWidth: 200 }}
      />
      <span className="acts" style={{ display: 'inline-flex', gap: 4 }}>
        <button
          type="button"
          title={t('psu.save')}
          aria-label={t('psu.save')}
          onClick={() => saveEdit(u)}
          disabled={renameM.isPending}
          style={{ color: 'var(--success)' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </button>
        <button
          type="button"
          title={t('psu.cancel')}
          aria-label={t('psu.cancel')}
          onClick={() => setEditId(null)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </span>
    </span>
  )

  const editIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
      <path d="M14 6l4 4" />
    </svg>
  )
  const retireIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </svg>
  )

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-h">
        <div>
          <h3>{t('psu.title')}</h3>
          <p style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 2 }}>{t('psu.sub')}</p>
        </div>
        {/* Available (in-stock) count — sold/returned/damaged units are on record (and paged
            below) but are not available, so the header reflects only IN_STOCK units. */}
        <span className="chip-tag">
          {t('psu.count').replace('{n}', String(product.currentStock))}
        </span>
      </div>

      {/* Add unit (a stock-in). Two modes: one-at-a-time, or paste/scan many. */}
      <div className="seg-pick" style={{ marginBottom: 12 }}>
        <button
          type="button"
          aria-pressed={!bulkMode}
          onClick={() => {
            setBulkMode(false)
            setBulkErr(null)
          }}
        >
          {t('psu.modeOne')}
        </button>
        <button
          type="button"
          aria-pressed={bulkMode}
          onClick={() => {
            setBulkMode(true)
            setAddErr(null)
          }}
        >
          {t('psu.modeBulk')}
        </button>
      </div>

      {!bulkMode ? (
        <>
          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              alignItems: 'flex-start',
              marginBottom: 14,
            }}
          >
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <ScanInput
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
                onScan={addSerial}
                scanTitle={t('scan.title')}
                cameraTitle={t('scan.camTitle')}
                cameraHint={t('scan.camHint')}
                cameraError={t('scan.camError')}
              />
            </div>
            {hasVariants ? (
              <div style={{ flex: '0 1 180px' }}>
                <Select value={variantId} onChange={(e) => setVariantId(e.target.value)}>
                  <option value="">{t('psu.variantPick')}</option>
                  {variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            <Button variant="primary" onClick={submitAdd} loading={addM.isPending}>
              + {t('psu.add')}
            </Button>
          </div>
          {addErr ? (
            <p
              style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: -6, marginBottom: 12 }}
              role="alert"
            >
              {addErr}
            </p>
          ) : null}
        </>
      ) : (
        <div style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 11.5, color: 'var(--text-2)', marginBottom: 8 }}>
            {t('psu.bulkHint')}
          </p>
          {hasVariants ? (
            <div style={{ marginBottom: 8, maxWidth: 240 }}>
              <Select
                value={variantId}
                onChange={(e) => {
                  setVariantId(e.target.value)
                  setBulkErr(null)
                }}
              >
                <option value="">{t('psu.variantPick')}</option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <textarea
            className="ta"
            rows={6}
            value={bulkText}
            placeholder={t('psu.bulkPh')}
            onChange={(e) => {
              setBulkText(e.target.value)
              setBulkErr(null)
            }}
            style={{
              width: '100%',
              resize: 'vertical',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 13,
            }}
          />
          {bulkTokens.length > 0 ? (
            <div
              style={{
                display: 'flex',
                gap: 6,
                flexWrap: 'wrap',
                alignItems: 'center',
                marginTop: 8,
              }}
            >
              <span
                className="chip-tag"
                style={{ background: 'var(--success-soft)', color: 'var(--success)' }}
              >
                {t('psu.bulkValid').replace('{n}', String(validTokens.length))}
              </span>
              {bulkTokens.some((tk) => tk.status === 'dup') ? (
                <span
                  className="chip-tag"
                  style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}
                >
                  {t('psu.bulkDup').replace(
                    '{n}',
                    String(bulkTokens.filter((tk) => tk.status === 'dup').length),
                  )}
                </span>
              ) : null}
              {bulkTokens.some((tk) => tk.status === 'invalid') ? (
                <span
                  className="chip-tag"
                  style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
                >
                  {t('psu.bulkInvalid').replace(
                    '{n}',
                    String(bulkTokens.filter((tk) => tk.status === 'invalid').length),
                  )}
                </span>
              ) : null}
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button
              variant="primary"
              onClick={submitBulk}
              loading={bulkM.isPending}
              disabled={validTokens.length === 0}
            >
              {t('psu.bulkAdd').replace('{n}', String(validTokens.length))}
            </Button>
            {bulkText ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setBulkText('')
                  setBulkErr(null)
                }}
              >
                {t('common.clear')}
              </Button>
            ) : null}
          </div>
          {bulkErr ? (
            <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 8 }} role="alert">
              {bulkErr}
            </p>
          ) : null}
        </div>
      )}

      {totalSerials > 0 || search ? (
        <div style={{ marginBottom: 12 }}>
          <Input
            value={search}
            placeholder={t('psu.search')}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      ) : null}

      {serialsLoading ? null : serials.length === 0 ? (
        <div className="hint">{search ? t('psu.noResults') : t('psu.empty')}</div>
      ) : bp === 'mobile' ? (
        // Mobile: stacked cards.
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {serials.map((u) => (
            <div key={u.id} className="card" style={{ background: 'var(--inset)', padding: 12 }}>
              {editId === u.id ? (
                editingCell(u)
              ) : (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  {canModify(u) ? (
                    <span
                      className="serial-pill"
                      style={{ cursor: 'pointer' }}
                      onClick={() => startEdit(u)}
                    >
                      {u.serialNumber}
                    </span>
                  ) : (
                    <span className="serial-pill">{u.serialNumber}</span>
                  )}
                  {statusPill(u.status)}
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 10,
                }}
              >
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                  {variantName(u.variantId) ?? '—'}
                </span>
                {canModify(u) ? (
                  <span className="acts" style={{ display: 'inline-flex', gap: 4 }}>
                    <button type="button" title={t('psu.edit')} onClick={() => startEdit(u)}>
                      {editIcon}
                    </button>
                    <button
                      type="button"
                      title={t('psu.retire')}
                      onClick={() => setRetire(u)}
                      style={{ color: 'var(--danger)' }}
                    >
                      {retireIcon}
                    </button>
                  </span>
                ) : null}
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
                <td>
                  {editId === u.id ? (
                    editingCell(u)
                  ) : canModify(u) ? (
                    <span
                      className="serial-pill"
                      style={{ cursor: 'pointer' }}
                      onClick={() => startEdit(u)}
                    >
                      {u.serialNumber}
                    </span>
                  ) : (
                    <span className="serial-pill">{u.serialNumber}</span>
                  )}
                </td>
                {hasVariants ? <td>{variantName(u.variantId) ?? '—'}</td> : null}
                <td>{statusPill(u.status)}</td>
                <td className="right">
                  {canModify(u) ? (
                    <span
                      className="acts"
                      style={{ display: 'inline-flex', gap: 4, justifyContent: 'flex-end' }}
                    >
                      <button type="button" title={t('psu.edit')} onClick={() => startEdit(u)}>
                        {editIcon}
                      </button>
                      <button
                        type="button"
                        title={t('psu.retire')}
                        onClick={() => setRetire(u)}
                        style={{ color: 'var(--danger)' }}
                      >
                        {retireIcon}
                      </button>
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        total={totalSerials}
        limit={PAGE_SIZE}
        onPage={setPage}
        prevLabel={t('common.prev')}
        nextLabel={t('common.next')}
      />
      {editErr ? (
        <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 8 }} role="alert">
          {editErr}
        </p>
      ) : null}

      <Modal
        open={!!retire}
        onClose={() => setRetire(null)}
        title={t('psu.retireTitle')}
        footer={
          <>
            <Button variant="soft" onClick={() => setRetire(null)} disabled={retireM.isPending}>
              {t('psu.cancel')}
            </Button>
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
        <Input
          value={reason}
          placeholder={t('psu.reasonPh')}
          onChange={(e) => setReason(e.target.value)}
        />
      </Modal>
    </div>
  )
}
