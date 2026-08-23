import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, CommandSelect, Input, Modal } from '@biztrack/ui/biztrack'
import { dataClient } from '@/lib/data-client'
import { useCurrency } from '@/lib/currency'
import { errorMessage } from '@/lib/error'
import { useT } from '@/i18n'
import type { LocalProduct } from '@shared/ipc'

/**
 * Quick-create a SIMPLE product from inside the Receive Stock flow and add it straight to the
 * receipt. Openining stock stays 0 — the receipt itself supplies the received quantity, so stock
 * is never double-counted. Full details (variants, serials, images, SEO) are added later from the
 * product page. Works offline (local create + outbox) and via the cloud API.
 */
export function QuickCreateProduct({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (product: LocalProduct, unitCost: string) => void
}) {
  const t = useT()
  const money = useCurrency()

  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [categoryLabel, setCategoryLabel] = useState<string | null>(null)
  const [unitId, setUnitId] = useState<string | null>(null)
  const [unitLabel, setUnitLabel] = useState<string | null>(null)
  const [cost, setCost] = useState('')
  const [price, setPrice] = useState('')
  const [sku, setSku] = useState('')
  const [barcode, setBarcode] = useState('')
  const [err, setErr] = useState<string | null>(null)

  // Default the unit to the business default ("Piece") so most products need no unit choice.
  const { data: units } = useQuery({
    queryKey: ['units', 'for-quick-create'],
    queryFn: () => dataClient.units.list({ limit: 100 }),
    enabled: open,
  })
  useEffect(() => {
    if (unitId || !units?.data?.length) return
    const def = units.data.find((u) => u.isDefault) ?? units.data[0]
    if (def) {
      setUnitId(def.id)
      setUnitLabel(def.abbreviation ? `${def.name} (${def.abbreviation})` : def.name)
    }
  }, [units, unitId])

  const reset = () => {
    setName('')
    setCategoryId(null)
    setCategoryLabel(null)
    setUnitId(null)
    setUnitLabel(null)
    setCost('')
    setPrice('')
    setSku('')
    setBarcode('')
    setErr(null)
  }
  const close = () => {
    reset()
    onClose()
  }

  const loadCategories = useCallback(async (search: string) => {
    const cats = await dataClient.categories.listSelectable({ search: search || undefined })
    return cats.map((c) => ({ value: c.id, label: c.name }))
  }, [])
  const loadUnits = useCallback(async (search: string) => {
    const res = await dataClient.units.list({ search: search || undefined, limit: 50 })
    return res.data.map((u) => ({
      value: u.id,
      label: u.abbreviation ? `${u.name} (${u.abbreviation})` : u.name,
    }))
  }, [])

  const create = useMutation({
    mutationFn: () =>
      dataClient.products.create({
        name: name.trim(),
        sellingPrice: Number(price.replace(/\s/g, '')) || 0,
        costPrice: cost.trim() ? Number(cost.replace(/\s/g, '')) : null,
        unitOfMeasureId: unitId as string,
        categoryId: categoryId ?? null,
        sku: sku.trim() || null,
        barcode: barcode.trim() || null,
        productType: 'SIMPLE',
      }),
    onSuccess: (product) => {
      onCreated(product, cost)
      close()
    },
    onError: (e) => setErr(errorMessage(e, t('recv.qcError'))),
  })

  const submit = () => {
    if (!name.trim()) return setErr(t('recv.qcNameRequired'))
    if (!unitId) return setErr(t('recv.qcUnitRequired'))
    if (!price.trim()) return setErr(t('recv.qcPriceRequired'))
    setErr(null)
    create.mutate()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('recv.qcTitle')}
      footer={
        <>
          <Button variant="soft" onClick={close} disabled={create.isPending}>
            {t('recv.cancel')}
          </Button>
          <Button variant="primary" loading={create.isPending} onClick={submit}>
            {t('recv.qcCreate')}
          </Button>
        </>
      }
    >
      <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14 }}>{t('recv.qcDesc')}</p>

      <div className="ff">
        <label className="lbl2">
          {t('recv.qcName')} <span className="req">*</span>
        </label>
        <Input
          value={name}
          placeholder={t('recv.qcNamePh')}
          onChange={(e) => {
            setName(e.target.value)
            setErr(null)
          }}
        />
      </div>

      <div className="form-2col" style={{ marginTop: 10 }}>
        <div className="ff">
          <label className="lbl2">{t('recv.qcCategory')}</label>
          <CommandSelect
            value={categoryId}
            valueLabel={categoryLabel}
            onChange={(v, o) => {
              setCategoryId(v)
              setCategoryLabel(o?.label ?? null)
            }}
            loadOptions={loadCategories}
            placeholder={t('recv.qcPickCategory')}
            searchPlaceholder={t('recv.qcSearchCategories')}
            clearLabel={t('recv.qcOptional')}
          />
          <div className="hint" style={{ marginTop: 4 }}>
            {t('recv.qcCategoryHint')}
          </div>
        </div>
        <div className="ff">
          <label className="lbl2">
            {t('recv.qcUnit')} <span className="req">*</span>
          </label>
          <CommandSelect
            value={unitId}
            valueLabel={unitLabel}
            onChange={(v, o) => {
              setUnitId(v)
              setUnitLabel(o?.label ?? null)
              setErr(null)
            }}
            loadOptions={loadUnits}
            placeholder={t('recv.qcPickUnit')}
            searchPlaceholder={t('recv.qcSearchUnits')}
            invalid={!!err && !unitId}
          />
          <div className="hint" style={{ marginTop: 4 }}>
            {t('recv.qcUnitHint')}
          </div>
        </div>
      </div>

      <div className="form-2col" style={{ marginTop: 10 }}>
        <div className="ff">
          <label className="lbl2">{t('recv.qcCost')}</label>
          <Input
            value={cost}
            inputMode="decimal"
            placeholder="0"
            onChange={(e) => setCost(e.target.value)}
            style={{ textAlign: 'right' }}
          />
          <div className="hint" style={{ marginTop: 4 }}>
            {t('recv.qcCostHint')}
          </div>
        </div>
        <div className="ff">
          <label className="lbl2">
            {t('recv.qcPrice')} <span className="req">*</span>
          </label>
          <Input
            value={price}
            inputMode="decimal"
            placeholder="0"
            onChange={(e) => {
              setPrice(e.target.value)
              setErr(null)
            }}
            style={{ textAlign: 'right' }}
          />
          <div className="hint" style={{ marginTop: 4 }}>
            {t('recv.qcPriceHint')} ({money.symbol})
          </div>
        </div>
      </div>

      <div className="form-2col" style={{ marginTop: 10 }}>
        <div className="ff">
          <label className="lbl2">
            {t('recv.qcSku')} <span className="opt">({t('recv.qcOptional')})</span>
          </label>
          <Input value={sku} onChange={(e) => setSku(e.target.value)} />
        </div>
        <div className="ff">
          <label className="lbl2">
            {t('recv.qcBarcode')} <span className="opt">({t('recv.qcOptional')})</span>
          </label>
          <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} />
        </div>
      </div>

      {err ? (
        <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 12 }} role="alert">
          {err}
        </p>
      ) : null}
    </Modal>
  )
}
