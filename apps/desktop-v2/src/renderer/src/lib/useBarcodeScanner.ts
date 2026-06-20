import { useEffect, useRef } from 'react'

// Global hardware-barcode-scanner capture, ported from desktop v1. Scanners type a code
// very fast (sub-30ms between keys) and end with Enter. We listen on the window in the
// CAPTURE phase so a scan is caught wherever focus is — even inside an input — and, when a
// field was being typed into, its value is restored so the scanned digits don't leak in.
// Manual (human-speed) typing never forms a scan buffer, so normal typing is unaffected.

type EditableElement = HTMLInputElement | HTMLTextAreaElement

interface BarcodeScannerOptions {
  enabled?: boolean
  minLength?: number
  maxIntervalMs?: number
  endKey?: string
}

function isEditableElement(target: EventTarget | null): target is EditableElement {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
}

function setEditableValue(target: EditableElement, value: string): void {
  const prototype = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
  descriptor?.set?.call(target, value)
  target.dispatchEvent(new Event('input', { bubbles: true }))
}

export function useBarcodeScanner(
  onScan: (barcode: string, event: KeyboardEvent) => void,
  options: BarcodeScannerOptions = {},
): void {
  const { enabled = true, minLength = 4, maxIntervalMs = 30, endKey = 'Enter' } = options
  const bufferRef = useRef('')
  const lastTimeRef = useRef(0)
  const targetSnapshotRef = useRef<{ target: EditableElement; value: string } | null>(null)
  const onScanRef = useRef(onScan)

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    const reset = (): void => {
      bufferRef.current = ''
      lastTimeRef.current = 0
      targetSnapshotRef.current = null
    }
    if (!enabled) {
      reset()
      return
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.isComposing || event.defaultPrevented) return
      if (event.ctrlKey || event.metaKey || event.altKey) {
        reset()
        return
      }

      const isTerminalKey = event.key === endKey
      const isPrintableKey = event.key.length === 1
      if (!isTerminalKey && !isPrintableKey) return

      const now = performance.now()
      if (lastTimeRef.current > 0 && now - lastTimeRef.current > maxIntervalMs) {
        bufferRef.current = ''
        targetSnapshotRef.current = null
      }
      lastTimeRef.current = now

      if (isTerminalKey) {
        const barcode = bufferRef.current
        const snapshot = targetSnapshotRef.current
        reset()
        if (barcode.length < minLength) return

        event.preventDefault()
        event.stopPropagation()

        // Restore the field's value so the burst of scanned chars doesn't stay in it.
        if (snapshot) {
          const { target, value } = snapshot
          window.requestAnimationFrame(() => {
            if (target.isConnected && target.value.endsWith(barcode)) setEditableValue(target, value)
          })
        }

        onScanRef.current(barcode, event)
        return
      }

      if (!bufferRef.current && isEditableElement(event.target)) {
        targetSnapshotRef.current = { target: event.target, value: event.target.value }
      }
      bufferRef.current += event.key
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      reset()
    }
  }, [enabled, endKey, maxIntervalMs, minLength])
}
