import { clsx } from 'clsx'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from 'react'

// --- minimal BarcodeDetector typings (not yet in the DOM lib) -----------------
interface DetectedBarcode {
  rawValue: string
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}
interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike
  getSupportedFormats?(): Promise<string[]>
}
function getBarcodeDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === 'undefined') return null
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
  return ctor ?? null
}
/** True when the running platform can do camera-based barcode scanning. */
export function cameraScanSupported(): boolean {
  return (
    getBarcodeDetectorCtor() != null &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  )
}

// React keeps a controlled <input> in sync via its own value setter; to inject a
// value programmatically (camera scan) we must use the native setter then fire an
// 'input' event so React's onChange runs and the parent state updates.
function setNativeValue(el: HTMLInputElement, value: string) {
  const proto = Object.getPrototypeOf(el) as object
  const desc = Object.getOwnPropertyDescriptor(proto, 'value')
  desc?.set?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

export interface ScanInputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
  /**
   * Fired when a barcode is captured — either by a hardware scanner (a fast burst
   * of keystrokes ending in Enter) or the camera. The value is already written into
   * the input; use this to advance focus / auto-submit.
   */
  onScan?: (value: string) => void
  /** Hide the camera-scan button even where it is supported. */
  noCamera?: boolean
  // Labels (host app provides i18n; sensible English defaults).
  scanTitle?: string
  cameraTitle?: string
  cameraHint?: string
  cameraError?: string
}

// Keystroke bursts faster than this (ms between keys) are treated as a scanner,
// not a human typing. Tuned conservatively — real scanners are well under 30ms.
const BURST_GAP_MS = 35
const MIN_SCAN_LEN = 3

/**
 * Design-system text input with barcode-scan support. Hardware HID scanners work
 * by focusing the field and typing; this also detects that burst and fires onScan,
 * and offers a camera fallback for devices without a hardware scanner.
 */
export const ScanInput = forwardRef<HTMLInputElement, ScanInputProps>(function ScanInput(
  {
    error,
    className,
    onScan,
    noCamera,
    scanTitle = 'Scan barcode with camera',
    cameraTitle = 'Scan barcode',
    cameraHint = 'Point the camera at a barcode.',
    cameraError = 'Could not access the camera.',
    onKeyDown,
    ...rest
  },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, [])

  // Hardware-scanner burst tracking.
  const lastKeyAt = useRef(0)
  const burstLen = useRef(0)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      const now = e.timeStamp
      if (e.key === 'Enter') {
        const value = e.currentTarget.value.trim()
        const wasBurst = burstLen.current >= MIN_SCAN_LEN
        burstLen.current = 0
        if (wasBurst && value.length >= MIN_SCAN_LEN && onScan) {
          // A scanner's trailing Enter — capture it instead of submitting a form,
          // and don't forward to the host's onKeyDown (which usually also handles
          // Enter) so the scanned value isn't processed twice.
          e.preventDefault()
          onScan(value)
          return
        }
      } else if (e.key.length === 1) {
        burstLen.current = now - lastKeyAt.current <= BURST_GAP_MS ? burstLen.current + 1 : 1
      }
      lastKeyAt.current = now
      onKeyDown?.(e)
    },
    [onScan, onKeyDown],
  )

  const showCamera = !noCamera && cameraScanSupported()
  const [scanning, setScanning] = useState(false)

  const onCameraResult = useCallback(
    (value: string) => {
      setScanning(false)
      const el = inputRef.current
      if (el) {
        setNativeValue(el, value)
        el.focus()
      }
      onScan?.(value)
    },
    [onScan],
  )

  return (
    <div className={clsx('scan-field', showCamera && 'has-cam')}>
      <input
        ref={inputRef}
        className={clsx('input', error && 'err', className)}
        onKeyDown={handleKeyDown}
        {...rest}
      />
      {showCamera ? (
        <button
          type="button"
          className="scan-btn"
          title={scanTitle}
          aria-label={scanTitle}
          onClick={() => setScanning(true)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
            <path d="M7 12h10" />
          </svg>
        </button>
      ) : null}
      {scanning ? (
        <CameraScanModal
          title={cameraTitle}
          hint={cameraHint}
          errorText={cameraError}
          onResult={onCameraResult}
          onClose={() => setScanning(false)}
        />
      ) : null}
    </div>
  )
})

// --- camera scan overlay ------------------------------------------------------
interface CameraScanModalProps {
  title: string
  hint: string
  errorText: string
  onResult: (value: string) => void
  onClose: () => void
}

function CameraScanModal({ title, hint, errorText, onResult, onClose }: CameraScanModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [err, setErr] = useState<string | null>(null)
  // Keep the latest onResult without making the camera effect depend on it — parents
  // pass inline onScan arrows whose identity changes each render, which would
  // otherwise tear down and restart the camera stream on every re-render.
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false
    const Detector = getBarcodeDetectorCtor()

    async function start() {
      if (!Detector) {
        setErr(errorText)
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        const video = videoRef.current
        if (!video || stopped) return
        video.srcObject = stream
        await video.play()
        const detector = new Detector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code', 'itf'],
        })
        const tick = async () => {
          if (stopped || !videoRef.current) return
          try {
            const codes = await detector.detect(videoRef.current)
            const hit = codes.find((c) => c.rawValue)
            if (hit) {
              onResultRef.current(hit.rawValue)
              return
            }
          } catch {
            // transient per-frame decode errors are expected; keep polling
          }
          raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      } catch {
        setErr(errorText)
      }
    }
    void start()

    return () => {
      stopped = true
      if (raf) cancelAnimationFrame(raf)
      stream?.getTracks().forEach((tr) => tr.stop())
    }
  }, [errorText])

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="modal scan-cam-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          {err ? (
            <p className="scan-cam-err">{err}</p>
          ) : (
            <>
              <div className="scan-cam-frame">
                <video ref={videoRef} muted playsInline />
                <span className="scan-cam-reticle" />
              </div>
              <p className="scan-cam-hint">{hint}</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
