import { useEffect, useState, type ReactNode } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, Input, Modal, PhoneInput, isValidPhone } from '@biztrack/ui/biztrack'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { errorMessage } from '@/lib/error'
import { useT } from '@/i18n'
import type { DocumentKind } from '@shared/ipc'

type Mode = 'menu' | 'whatsapp' | 'email'

/**
 * Share an RFQ/PO. Online (desktop or cloud): the server compiles + sends the PDF via
 * WhatsApp/email (prompting for a recipient if the contact has none), or the user can
 * download it. Offline (desktop): download the locally-rendered PDF. (Native OS "share
 * via apps" is the additional offline path — see follow-up.)
 */
export function ShareDialog({
  kind,
  id,
  supplierId,
  supplierName,
  supplierPhone,
  supplierEmail,
  onClose,
  onSent,
}: {
  kind: DocumentKind
  id: string
  supplierId?: string | null
  supplierName?: string | null
  supplierPhone?: string | null
  supplierEmail?: string | null
  onClose: () => void
  onSent?: () => void
}) {
  const t = useT()
  const online = typeof navigator === 'undefined' ? true : navigator.onLine
  const [mode, setMode] = useState<Mode>('menu')
  const [phone, setPhone] = useState(supplierPhone ?? '')
  const [email, setEmail] = useState(supplierEmail ?? '')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  // Auto-load the supplier's stored phone/email so the user doesn't retype them.
  const { data: contact } = useQuery({
    queryKey: [...queryKeys.contacts, supplierId, 'share'],
    queryFn: () => dataClient.contacts.get(supplierId!),
    enabled: isElectron && !!supplierId,
  })
  useEffect(() => {
    if (!contact) return
    setPhone((p) => p || contact.phone || '')
    setEmail((e) => e || contact.email || '')
  }, [contact])

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  const send = useMutation({
    mutationFn: (channel: 'whatsapp' | 'email') =>
      dataClient.documents.send({
        kind,
        id,
        supplierId,
        channel,
        recipient: channel === 'whatsapp' ? { phone: phone.trim() } : { email: email.trim() },
      }),
    onSuccess: () => { onSent?.(); setDone(t('share.sent')); setMode('menu') },
    onError: (e) => setError(errorMessage(e, t('share.error'))),
  })

  const submitSend = () => {
    if (mode === 'menu') return
    if (mode === 'whatsapp' && !isValidPhone(phone.trim())) return setError(t('share.invalidPhone'))
    if (mode === 'email' && !EMAIL_RE.test(email.trim())) return setError(t('share.invalidEmail'))
    setError(null)
    send.mutate(mode)
  }

  const download = useMutation({
    mutationFn: () => dataClient.documents.downloadPdf({ kind, id, supplierId }),
    onSuccess: (r) => { if (r.saved) { setDone(t('share.downloaded')); } },
    onError: (e) => setError(errorMessage(e, t('share.downloadError'))),
  })

  const optionRow = (icon: ReactNode, label: string, sub: string, onClick: () => void, disabled?: boolean) => (
    <button type="button" className="share-opt" disabled={disabled} onClick={onClick}>
      <span className="share-opt-ic">{icon}</span>
      <span className="share-opt-main"><span className="share-opt-lab">{label}</span><span className="share-opt-sub">{sub}</span></span>
    </button>
  )

  return (
    <Modal open onClose={onClose} onSubmit={submitSend} title={mode === 'menu' ? t('share.title') : mode === 'whatsapp' ? t('share.whatsapp') : t('share.email')}>
      {mode === 'menu' ? (
        <>
          {done ? <p style={{ color: 'var(--success)', fontSize: 13, marginBottom: 10 }}>{done}</p> : null}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {optionRow(
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M3 5h18v14H3z" /><path d="m3 6 9 7 9-7" /></svg>,
              t('share.email'), online ? t('share.emailSub') : t('share.needsOnline'), () => { setError(null); setDone(null); setMode('email') }, !online,
            )}
            {optionRow(
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.3A9 9 0 1 0 12 3Z" /></svg>,
              t('share.whatsapp'), online ? t('share.whatsappSub') : t('share.needsOnline'), () => { setError(null); setDone(null); setMode('whatsapp') }, !online,
            )}
            {optionRow(
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" /></svg>,
              t('share.download'), t('share.downloadSub'), () => { setError(null); setDone(null); download.mutate() },
            )}
          </div>
          {download.isPending ? <p className="hint" style={{ marginTop: 10 }}>{t('share.rendering')}</p> : null}
          {!online ? <p className="hint" style={{ marginTop: 10 }}>{t('share.offlineNote')}</p> : null}
        </>
      ) : mode === 'whatsapp' ? (
        <>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>{t('share.toSupplier').replace('{name}', supplierName ?? '')}</p>
          <div className="ff">
            <label className="lbl2">{t('share.recipientPhone')}</label>
            <PhoneInput value={phone} onChange={(v) => { setPhone(v ?? ''); setError(null) }} />
          </div>
        </>
      ) : (
        <>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>{t('share.toSupplier').replace('{name}', supplierName ?? '')}</p>
          <div className="ff">
            <label className="lbl2">{t('share.recipientEmail')}</label>
            <Input value={email} type="email" placeholder="supplier@example.com" onChange={(e) => { setEmail(e.target.value); setError(null) }} />
          </div>
        </>
      )}
      {error ? <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }} role="alert">{error}</p> : null}
      {mode !== 'menu' ? (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <Button variant="soft" onClick={() => { setMode('menu'); setError(null) }} disabled={send.isPending}>{t('share.back')}</Button>
          <Button
            type="submit"
            variant="primary"
            loading={send.isPending}
            disabled={mode === 'whatsapp' ? !phone.trim() : !email.trim()}
          >
            {t('share.send')}
          </Button>
        </div>
      ) : null}
    </Modal>
  )
}
