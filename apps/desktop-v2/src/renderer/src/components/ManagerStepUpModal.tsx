import { useEffect, useState } from 'react'
import { Button, Modal, OtpInput } from '@biztrack/ui/biztrack'
import type { PinVerifyReason, PinVerifyResult } from '@shared/ipc'
import { useT } from '@/i18n'
import { dataClient } from '@/lib/data-client'
import { useBarcodeScanner } from '@/lib/useBarcodeScanner'
import { useStepUpStore } from '@/stores/step-up.store'

const PIN_LENGTH = 6

/**
 * App-root manager step-up modal (BIZ-3.2). Any flow can trigger it via
 * requestManagerStepUp(); a manager enters their PIN in place — no navigation away
 * from the cart, the cashier stays logged in. Verification is offline (dataClient.pin).
 */
export function ManagerStepUpModal() {
  const t = useT()
  const open = useStepUpStore((s) => s.open)
  const resolve = useStepUpStore((s) => s.resolve)
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

  const cancel = () => resolve(null)

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

  const submit = async (code: string) => {
    if (busy || code.length < PIN_LENGTH) return
    await authorizeWith(() => dataClient.pin.verify(code), t('stepUp.wrongPin'))
  }

  // BIZ-3.3 — scanning an authorization card verifies its token directly (no PIN typed/shown).
  useBarcodeScanner(
    (token) => {
      if (open && !busy)
        void authorizeWith(() => dataClient.pin.verifyCard(token), t('stepUp.cardFailed'))
    },
    { enabled: open },
  )

  return (
    <Modal
      open={open}
      onClose={cancel}
      title={t('stepUp.title')}
      overlayClassName="modal-overlay-top"
      onSubmit={() => void submit(pin)}
      footer={
        <>
          <Button variant="soft" type="button" onClick={cancel} disabled={busy}>
            {t('stepUp.cancel')}
          </Button>
          <Button variant="primary" type="submit" loading={busy} disabled={pin.length < PIN_LENGTH}>
            {t('stepUp.authorize')}
          </Button>
        </>
      }
    >
      <p style={{ marginBottom: 12 }}>{t('stepUp.subtitle')}</p>
      <label className="lbl2">{t('stepUp.pinLabel')}</label>
      <OtpInput
        length={PIN_LENGTH}
        value={pin}
        onChange={setPin}
        onComplete={(v) => void submit(v)}
        error={!!error}
      />
      <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 10 }}>
        {t('stepUp.orScan')}
      </p>
      {error ? (
        <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }} role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  )
}
