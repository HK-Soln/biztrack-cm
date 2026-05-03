'use client'

import { useEffect, useRef } from 'react'

type EditableElement = HTMLInputElement | HTMLTextAreaElement

type BarcodeScannerOptions = {
  enabled?: boolean
  minLength?: number
  maxIntervalMs?: number
  endKey?: string
}

function isEditableElement(target: EventTarget | null): target is EditableElement {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
}

function setEditableValue(target: EditableElement, value: string) {
  const prototype =
    target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
  descriptor?.set?.call(target, value)
  target.dispatchEvent(new Event('input', { bubbles: true }))
}

export function useBarcodeScanner(
  onScan: (barcode: string, event: KeyboardEvent) => void,
  options: BarcodeScannerOptions = {},
) {
  const {
    enabled = true,
    minLength = 4,
    maxIntervalMs = 30,
    endKey = 'Enter',
  } = options

  const bufferRef = useRef('')
  const lastTimeRef = useRef(0)
  const targetSnapshotRef = useRef<{ target: EditableElement; value: string } | null>(null)
  const onScanRef = useRef(onScan)

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    if (!enabled) {
      bufferRef.current = ''
      lastTimeRef.current = 0
      targetSnapshotRef.current = null
      return
    }

    const reset = () => {
      bufferRef.current = ''
      lastTimeRef.current = 0
      targetSnapshotRef.current = null
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.defaultPrevented) {
        return
      }

      if (event.ctrlKey || event.metaKey || event.altKey) {
        reset()
        return
      }

      const isTerminalKey = event.key === endKey
      const isPrintableKey = event.key.length === 1

      if (!isTerminalKey && !isPrintableKey) {
        return
      }

      const now = performance.now()
      if (lastTimeRef.current > 0 && now - lastTimeRef.current > maxIntervalMs) {
        bufferRef.current = ''
        targetSnapshotRef.current = null
      }
      lastTimeRef.current = now

      if (isTerminalKey) {
        const barcode = bufferRef.current
        const targetSnapshot = targetSnapshotRef.current
        reset()

        if (barcode.length < minLength) {
          return
        }

        event.preventDefault()
        event.stopPropagation()

        if (targetSnapshot) {
          const { target, value } = targetSnapshot
          window.requestAnimationFrame(() => {
            if (!target.isConnected) {
              return
            }

            if (target.value.endsWith(barcode)) {
              setEditableValue(target, value)
            }
          })
        }

        onScanRef.current(barcode, event)
        return
      }

      if (!bufferRef.current && isEditableElement(event.target)) {
        targetSnapshotRef.current = {
          target: event.target,
          value: event.target.value,
        }
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
