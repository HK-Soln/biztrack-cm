'use client'

import type { ChangeEvent } from 'react'
import { useTranslations } from 'next-intl'
import { Button, Input, NumberInput } from '@biztrack/ui'
import { PaymentMethod } from '@biztrack/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  createRestockPaymentDraft,
  isMobileMoneyPaymentMethod,
  type RestockPaymentDraft,
} from './restock-shared'

type RestockPaymentEditorProps = {
  payments: RestockPaymentDraft[]
  onChange: (payments: RestockPaymentDraft[]) => void
}

function paymentMethodLabel(
  method: PaymentMethod,
  t: ReturnType<typeof useTranslations<'app.inventory'>>,
) {
  switch (method) {
    case PaymentMethod.CARD:
      return t('restock.payment_methods.card')
    case PaymentMethod.MTN_MOMO:
      return t('restock.payment_methods.mtn_momo')
    case PaymentMethod.ORANGE_MONEY:
      return t('restock.payment_methods.orange_money')
    case PaymentMethod.CASH:
    default:
      return t('restock.payment_methods.cash')
  }
}

export function RestockPaymentEditor({
  payments,
  onChange,
}: RestockPaymentEditorProps) {
  const t = useTranslations('app.inventory')

  const addPayment = () => {
    onChange([...payments, createRestockPaymentDraft()])
  }

  const updatePayment = (
    paymentId: string,
    patch: Partial<RestockPaymentDraft>,
  ) => {
    onChange(
      payments.map((payment) =>
        payment.id === paymentId ? { ...payment, ...patch } : payment,
      ),
    )
  }

  const removePayment = (paymentId: string) => {
    onChange(payments.filter((payment) => payment.id !== paymentId))
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t('restock.sections.payments')}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('restock.payments_hint')}
          </p>
        </div>

        <Button type="button" variant="secondary" onClick={addPayment}>
          {t('restock.add_payment')}
        </Button>
      </div>

      {payments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-background/60 px-4 py-4 text-sm text-muted-foreground">
          {t('restock.no_payments')}
        </div>
      ) : (
        <div className="space-y-3">
          {payments.map((payment) => (
            <div
              key={payment.id}
              className="rounded-2xl border border-border bg-secondary/30 p-3"
            >
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(120px,0.8fr)_minmax(0,1fr)_auto] lg:items-end">
                <div className="space-y-1">
                  <span className="text-sm font-medium text-foreground">
                    {t('restock.payment_method')}
                  </span>
                  <Select
                    value={payment.method}
                    onValueChange={(value) =>
                      updatePayment(payment.id, { method: value as PaymentMethod })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('restock.payment_method')} />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        PaymentMethod.CASH,
                        PaymentMethod.CARD,
                        PaymentMethod.MTN_MOMO,
                        PaymentMethod.ORANGE_MONEY,
                      ].map((method) => (
                        <SelectItem key={method} value={method}>
                          {paymentMethodLabel(method, t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <NumberInput
                  label={t('restock.payment_amount')}
                  min="0.01"
                  step="0.01"
                  value={payment.amount}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    updatePayment(payment.id, { amount: event.target.value })
                  }
                />

                <Input
                  label={t('restock.mobile_money_reference')}
                  value={payment.mobileMoneyReference}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    updatePayment(payment.id, {
                      mobileMoneyReference: event.target.value,
                    })
                  }
                  disabled={!isMobileMoneyPaymentMethod(payment.method)}
                  placeholder={t('restock.mobile_money_reference_placeholder')}
                />

                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => removePayment(payment.id)}
                  className="h-10 px-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  {t('restock.remove_payment')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
