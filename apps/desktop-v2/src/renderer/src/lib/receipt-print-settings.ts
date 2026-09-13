// Device-local receipt print settings (printer, copies, auto-print). NOT synced — each physical
// till has its own printer — so these live in localStorage per device, unlike the business-level
// receipt content settings (which live on the profile).

export interface ReceiptPrintSettings {
  /** Selected printer device name; null = use the OS default / show the dialog. */
  printerName: string | null
  /** Copies to print per receipt. */
  copies: number
  /** Print automatically right after checkout (no dialog). */
  autoPrint: boolean
}

const KEY = 'biztrack.receiptPrint'

export const DEFAULT_RECEIPT_PRINT_SETTINGS: ReceiptPrintSettings = {
  printerName: null,
  copies: 1,
  autoPrint: true,
}

export function loadReceiptPrintSettings(): ReceiptPrintSettings {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return DEFAULT_RECEIPT_PRINT_SETTINGS
    return { ...DEFAULT_RECEIPT_PRINT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_RECEIPT_PRINT_SETTINGS
  }
}

export function saveReceiptPrintSettings(s: ReceiptPrintSettings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* ignore (private mode / disabled storage) */
  }
}
