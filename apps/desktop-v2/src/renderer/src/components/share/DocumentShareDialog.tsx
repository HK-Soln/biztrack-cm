import { useState, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Input, PhoneInput, isValidPhone } from '@biztrack/ui/biztrack'
import { dataClient } from '@/lib/data-client'
import { errorMessage } from '@/lib/error'
import { useT } from '@/i18n'

const X = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6 6 18" /></svg>
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Send an app-generated PDF (statement, etc.) to a contact via the WhatsApp/email composer,
 * or download it. Offline-first: the desktop opens the user's composer with the PDF revealed
 * to attach (no server round-trip needed). Mirrors the receipt send UX.
 */
export function DocumentShareDialog({
  title,
  html,
  filename,
  message,
  subject,
  defaultPhone,
  defaultEmail,
  recipientName,
  onClose,
}: {
  title: string
  html: string
  filename: string
  message: string
  subject: string
  defaultPhone?: string | null
  defaultEmail?: string | null
  recipientName: string
  onClose: () => void
}) {
  const t = useT()
  const [mode, setMode] = useState<'menu' | 'whatsapp' | 'email'>('menu')
  const [phone, setPhone] = useState(defaultPhone ?? '')
  const [email, setEmail] = useState(defaultEmail ?? '')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const share = useMutation({
    mutationFn: (channel: 'whatsapp' | 'email') =>
      dataClient.documents.shareHtmlPdf({
        html,
        filename,
        message,
        subject,
        channel,
        phone: channel === 'whatsapp' ? phone.trim() : null,
        email: channel === 'email' ? email.trim() : null,
      }),
    onSuccess: () => { setDone(t('share.sent')); setMode('menu') },
    onError: (e) => setError(errorMessage(e, t('share.error'))),
  })
  const submitSend = () => {
    if (mode === 'menu') return
    if (mode === 'whatsapp' && !isValidPhone(phone.trim())) return setError(t('share.invalidPhone'))
    if (mode === 'email' && !EMAIL_RE.test(email.trim())) return setError(t('share.invalidEmail'))
    setError(null)
    share.mutate(mode)
  }

  const download = useMutation({
    mutationFn: () => dataClient.documents.downloadHtmlPdf(html, filename),
    onSuccess: (r) => { if (r.saved) setDone(t('share.downloaded')) },
    onError: (e) => setError(errorMessage(e, t('share.downloadError'))),
  })

  const optionRow = (icon: ReactNode, label: string, sub: string, onClick: () => void) => (
    <button type="button" className="share-opt" onClick={onClick}>
      <span className="share-opt-ic">{icon}</span>
      <span className="share-opt-main"><span className="share-opt-lab">{label}</span><span className="share-opt-sub">{sub}</span></span>
    </button>
  )

  return (
    <div className="pay-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="pay-modal" style={{ width: 440 }}>
        <div className="pm-head">
          <h3>{mode === 'menu' ? title : mode === 'whatsapp' ? t('share.whatsapp') : t('share.email')}</h3>
          <button type="button" className="x" onClick={mode === 'menu' ? onClose : () => { setMode('menu'); setError(null) }}>{X}</button>
        </div>
        <div className="pm-body">
          {mode === 'menu' ? (
            <>
              {done ? <p style={{ color: 'var(--success)', fontSize: 13, marginBottom: 10 }}>{done}</p> : null}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {optionRow(
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M3 5h18v14H3z" /><path d="m3 6 9 7 9-7" /></svg>,
                  t('share.email'), t('sell.composerNote'), () => { setError(null); setDone(null); setMode('email') },
                )}
                {optionRow(
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.3A9 9 0 1 0 12 3Z" /></svg>,
                  t('share.whatsapp'), t('sell.composerNote'), () => { setError(null); setDone(null); setMode('whatsapp') },
                )}
                {optionRow(
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" /></svg>,
                  t('share.download'), t('share.downloadSub'), () => { setError(null); setDone(null); download.mutate() },
                )}
              </div>
              {download.isPending ? <p className="hint" style={{ marginTop: 10 }}>{t('share.rendering')}</p> : null}
              {error ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }} role="alert">{error}</p> : null}
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>{t('share.toSupplier').replace('{name}', recipientName)}</p>
              {mode === 'whatsapp' ? (
                <div className="ff">
                  <label className="lbl2">{t('share.recipientPhone')}</label>
                  <PhoneInput value={phone} onChange={(v) => { setPhone(v ?? ''); setError(null) }} />
                </div>
              ) : (
                <div className="ff">
                  <label className="lbl2">{t('share.recipientEmail')}</label>
                  <Input value={email} type="email" placeholder="client@email.com" onChange={(e) => { setEmail(e.target.value); setError(null) }} />
                </div>
              )}
              {error ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }} role="alert">{error}</p> : null}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <Button variant="soft" onClick={() => { setMode('menu'); setError(null) }} disabled={share.isPending}>{t('share.back')}</Button>
                <Button variant="primary" loading={share.isPending} disabled={mode === 'whatsapp' ? !phone.trim() : !email.trim()} onClick={submitSend}>{t('share.send')}</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
