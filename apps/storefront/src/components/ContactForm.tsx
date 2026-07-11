'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { PhoneInput } from '@biztrack/ui/biztrack'
import { sendContactMessage } from '@/lib/api'

const IcSend = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="m4 4 16 8-16 8 4-8-4-8Z" />
  </svg>
)
const IcCheck = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

const SUBJECT_KEYS = [
  'subjectOrder',
  'subjectAvailability',
  'subjectDelivery',
  'subjectPayment',
  'subjectOther',
] as const

/** Contact form — posts to the backend, which emails the business (via Resend). */
export function ContactForm({ slug }: { slug: string }) {
  const t = useTranslations('contact')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState<string | undefined>(undefined)
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState<string>(SUBJECT_KEYS[0])
  const [message, setMessage] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      sendContactMessage(slug, {
        name: name.trim(),
        phone: phone || undefined,
        email: email.trim() || undefined,
        subject: t(subject),
        message: message.trim(),
      }),
  })

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !message.trim()) return
    mutation.mutate()
  }

  if (mutation.isSuccess) {
    return (
      <div className="ct-form">
        <div className="empty" style={{ padding: '40px 20px' }}>
          <div className="ei">{IcCheck}</div>
          <h3>{t('sentTitle')}</h3>
          <p>{t('sentDesc')}</p>
        </div>
      </div>
    )
  }

  return (
    <form className="ct-form" onSubmit={onSubmit}>
      <h3 style={{ fontSize: 18, fontWeight: 750, marginBottom: 6 }}>{t('formHeading')}</h3>
      <p style={{ fontSize: 13.5, color: 'var(--text-2)', marginBottom: 20 }}>{t('formSub')}</p>
      <div className="field-grid">
        <div className="field">
          <label>{t('name')}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label>{t('phone')}</label>
          <PhoneInput value={phone} onChange={setPhone} defaultCountry="CM" />
        </div>
        <div className="field full">
          <label>{t('email')}</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
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
      <button
        className="btn btn-primary btn-lg btn-block"
        style={{ marginTop: 18 }}
        type="submit"
        disabled={mutation.isPending}
      >
        {IcSend}
        {mutation.isPending ? t('sending') : t('send')}
      </button>
      {mutation.isError ? (
        <p style={{ color: 'var(--danger)', marginTop: 10, fontSize: 13 }}>
          {(mutation.error as Error).message}
        </p>
      ) : null}
    </form>
  )
}
