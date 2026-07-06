'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { PhoneInput } from '@biztrack/ui/biztrack'

const IcSend = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="m4 4 16 8-16 8 4-8-4-8Z" />
  </svg>
)

const SUBJECT_KEYS = [
  'subjectOrder',
  'subjectAvailability',
  'subjectDelivery',
  'subjectPayment',
  'subjectOther',
] as const

/**
 * Contact form that composes a message and opens the store's WhatsApp (preferred) or
 * an email draft — no backend needed. Rendered only when the store exposes a channel.
 */
export function ContactForm({
  whatsappNumber,
  email,
}: {
  whatsappNumber: string | null
  email: string | null
}) {
  const t = useTranslations('contact')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState<string | undefined>(undefined)
  const [customerEmail, setCustomerEmail] = useState('')
  const [subject, setSubject] = useState<string>(SUBJECT_KEYS[0])
  const [message, setMessage] = useState('')

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const subjectLabel = t(subject)
    const body = [
      name ? `${t('name')}: ${name}` : '',
      phone ? `${t('phone')}: ${phone}` : '',
      customerEmail ? `${t('email')}: ${customerEmail}` : '',
      '',
      message,
    ]
      .filter((line) => line !== '' || message)
      .join('\n')

    if (whatsappNumber) {
      const digits = whatsappNumber.replace(/\D/g, '')
      const text = `${subjectLabel}\n\n${body}`
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, '_blank')
    } else if (email) {
      window.location.href = `mailto:${email}?subject=${encodeURIComponent(
        subjectLabel,
      )}&body=${encodeURIComponent(body)}`
    }
  }

  return (
    <form className="ct-form" onSubmit={onSubmit}>
      <h3 style={{ fontSize: 18, fontWeight: 750, marginBottom: 6 }}>{t('formHeading')}</h3>
      <p style={{ fontSize: 13.5, color: 'var(--text-2)', marginBottom: 20 }}>{t('formSub')}</p>
      <div className="field-grid">
        <div className="field">
          <label>{t('name')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>{t('phone')}</label>
          <PhoneInput value={phone} onChange={setPhone} defaultCountry="CM" />
        </div>
        <div className="field full">
          <label>{t('email')}</label>
          <input
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
          />
        </div>
        <div className="field full">
          <label>{t('subject')}</label>
          <select value={subject} onChange={(e) => setSubject(e.target.value)}>
            {SUBJECT_KEYS.map((key) => (
              <option key={key} value={key}>
                {t(key)}
              </option>
            ))}
          </select>
        </div>
        <div className="field full">
          <label>{t('message')}</label>
          <textarea
            rows={5}
            required
            placeholder={t('messagePlaceholder')}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
      </div>
      <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 18 }} type="submit">
        {IcSend}
        {t('send')}
      </button>
    </form>
  )
}
