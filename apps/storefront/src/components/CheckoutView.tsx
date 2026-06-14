'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { checkout } from '@/lib/api'
import { checkoutSchema, type CheckoutFormValues } from '@/lib/schemas'
import { useCartSession } from '@/lib/cart-store'

const inputStyle = {
  display: 'block',
  width: '100%',
  padding: 10,
  marginTop: 4,
  borderRadius: 10,
  border: '1px solid var(--border)',
} as const

export function CheckoutView({ slug }: { slug: string }) {
  const router = useRouter()
  const sessionToken = useCartSession((state) => state.sessionToken)
  const clearSession = useCartSession((state) => state.clear)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const mutation = useMutation({
    mutationFn: (values: CheckoutFormValues) =>
      checkout(slug, sessionToken as string, {
        ...values,
        customerEmail: values.customerEmail || undefined,
      }),
    onSuccess: (order) => {
      clearSession()
      router.push(`/${slug}/orders/${order.trackingToken}`)
    },
  })

  if (!sessionToken) {
    return <p className="container muted" style={{ padding: 24 }}>Your cart is empty.</p>
  }

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const parsed = checkoutSchema.safeParse(Object.fromEntries(form.entries()))
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]
        if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message
      }
      setErrors(fieldErrors)
      return
    }
    setErrors({})
    mutation.mutate(parsed.data)
  }

  const field = (name: string, label: string, type = 'text') => (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span className="muted" style={{ fontSize: 13 }}>{label}</span>
      <input name={name} type={type} style={inputStyle} />
      {errors[name] ? <span style={{ color: '#a32d2d', fontSize: 12 }}>{errors[name]}</span> : null}
    </label>
  )

  return (
    <form className="container" style={{ padding: '24px 16px', maxWidth: 560 }} onSubmit={onSubmit}>
      <h1>Checkout</h1>
      {field('customerName', 'Full name')}
      {field('customerPhone', 'Phone', 'tel')}
      {field('customerEmail', 'Email (optional)', 'email')}

      <label style={{ display: 'block', marginBottom: 12 }}>
        <span className="muted" style={{ fontSize: 13 }}>Fulfilment</span>
        <select name="fulfillmentType" defaultValue="DELIVERY" style={inputStyle}>
          <option value="DELIVERY">Delivery</option>
          <option value="PICKUP">Pickup</option>
        </select>
      </label>
      {field('deliveryAddress', 'Delivery address')}
      {field('deliveryCity', 'City')}
      {field('notes', 'Order notes (optional)')}

      <button
        type="submit"
        disabled={mutation.isPending}
        style={{
          marginTop: 8,
          padding: '12px 20px',
          borderRadius: 12,
          border: 'none',
          background: 'var(--primary)',
          color: '#fff',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        {mutation.isPending ? 'Placing order…' : 'Place order'}
      </button>
      {mutation.isError ? (
        <p style={{ color: '#a32d2d' }}>{(mutation.error as Error).message}</p>
      ) : null}
    </form>
  )
}
