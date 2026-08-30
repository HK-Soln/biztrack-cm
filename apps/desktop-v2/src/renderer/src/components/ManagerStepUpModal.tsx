import { useEffect, useState } from 'react'
import { Button, Modal, OtpInput, ScanInput } from '@biztrack/ui/biztrack'
import { MemberAuthCredentialType } from '@biztrack/types'
import type { PinVerifyReason, PinVerifyResult } from '@shared/ipc'
import { useT } from '@/i18n'
import { dataClient } from '@/lib/data-client'
import { useBarcodeScanner } from '@/lib/useBarcodeScanner'
import { useSessionStore } from '@/stores/session.store'
import { useStepUpStore } from '@/stores/step-up.store'

const PIN_LENGTH = 6

/**
 * App-root manager step-up modal (BIZ-3.2/3.3). Any flow can trigger it via requestManagerStepUp().
 * A manager authorizes in place — no navigation away from the cart — with a PIN and/or a scanned
 * authorization card (camera or hardware scanner), depending on the business's allowed methods.
 * Three outcomes: Approve (verified), Continue anyway (ring up unapproved), Cancel (abort the sale).
 */
export function ManagerStepUpModal() {
  const t = useT()
  const open = useStepUpStore((s) => s.open)
  const resolve = useStepUpStore((s) => s.resolve)
  const allowedMethods = useSessionStore((s) => s.status.allowedAuthMethods)
  // null/absent ⇒ both allowed (never lock the owner out).
  const pinAllowed = !allowedMethods || allowedMethods.includes(MemberAuthCredentialType.PIN)
  const cardAllowed = !allowedMethods || allowedMethods.includes(MemberAuthCredentialType.CARD)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setPin('')
      setError(null)
      setBusy(false)
    }
  }, [open])

  // Cancel = abort the action: close the modal and do NOT ring up the sale.
  const cancel = () => resolve({ type: 'cancelled' })
  // Continue anyway = ring up the sale WITHOUT approval (flagged unauthorized on the backend).
  const override = () => resolve({ type: 'override' })

  const messageFor = (reason: PinVerifyReason | undefined, attemptsRemaining?: number): string => {
    switch (reason) {
      case 'LOCKED_OUT':
        return t('stepUp.lockedOut')
      case 'STALE_DEVICE':
        return t('stepUp.staleDevice')
      case 'NO_MATCH':
        return attemptsRemaining != null
          ? `${t('stepUp.wrongPin')} ${attemptsRemaining} ${t('stepUp.attemptsLeft')}`
          : t('stepUp.wrongPin')
      default:
        return t('stepUp.wrongPin')
    }
  }

  const authorizeWith = async (verify: () => Promise<PinVerifyResult>, onFail: string) => {
    setBusy(true)
    setError(null)
    try {
      const result = await verify()
      if (result.authorized && result.authorizedByUserId) {
        resolve({
          type: 'approved',
          authorizedByUserId: result.authorizedByUserId,
          authorizedByName: result.authorizedByName,
        })
        return
      }
      setError(messageFor(result.reason, result.attemptsRemaining))
      setPin('')
    } catch {
      setError(onFail)
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  const submitPin = async (code: string) => {
    if (busy || code.length < PIN_LENGTH) return
    await authorizeWith(() => dataClient.pin.verify(code), t('stepUp.wrongPin'))
  }

  // BIZ-3.3 — scanning an authorization card verifies its token directly (no PIN typed/shown).
  const submitCard = async (token: string) => {
    const value = (token ?? '').trim()
    if (busy || !value) return
    await authorizeWith(() => dataClient.pin.verifyCard(value), t('stepUp.cardFailed'))
  }

  // Global hardware-scanner capture — works even when the PIN field is focused. (It stops the
  // event before the ScanInput's own burst detector, so a hardware scan never double-fires.)
  useBarcodeScanner(
    (token) => {
      if (open && !busy) void submitCard(token)
    },
    { enabled: open },
  )

  return (
    <Modal
      open={open}
      onClose={cancel}
      title={t('stepUp.title')}
      overlayClassName="modal-overlay-top"
      onSubmit={pinAllowed ? () => void submitPin(pin) : undefined}
      footer={
        <>
          <Button variant="soft" type="button" onClick={cancel} disabled={busy}>
            {t('stepUp.cancel')}
          </Button>
          <Button variant="ghost" type="button" onClick={override} disabled={busy}>
            {t('stepUp.override')}
          </Button>
          {pinAllowed ? (
            <Button
              variant="primary"
              type="submit"
              loading={busy}
              disabled={pin.length < PIN_LENGTH}
            >
              {t('stepUp.approve')}
            </Button>
          ) : null}
        </>
      }
    >
      <p style={{ marginBottom: 14 }}>{t('stepUp.subtitle')}</p>

      {pinAllowed ? (
        <>
          <label className="lbl2">{t('stepUp.pinLabel')}</label>
          <OtpInput
            length={PIN_LENGTH}
            value={pin}
            onChange={setPin}
            onComplete={(v) => void submitPin(v)}
            error={!!error}
          />
        </>
      ) : null}

      {pinAllowed && cardAllowed ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            margin: '16px 0 12px',
            color: 'var(--text-muted)',
            fontSize: 12,
          }}
        >
          <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          {t('stepUp.or')}
          <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>
      ) : null}

      {cardAllowed ? (
        <>
          <label className="lbl2">{t('stepUp.scanLabel')}</label>
          <ScanInput
            autoFocus={!pinAllowed}
            placeholder={t('stepUp.scanPlaceholder')}
            onScan={(v) => void submitCard(v)}
            error={!!error}
            scanTitle={t('stepUp.scanBtn')}
            cameraTitle={t('stepUp.scanCamTitle')}
            cameraHint={t('stepUp.scanCamHint')}
            cameraError={t('stepUp.scanCamError')}
          />
        </>
      ) : null}

      {error ? (
        <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }} role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  )
}
