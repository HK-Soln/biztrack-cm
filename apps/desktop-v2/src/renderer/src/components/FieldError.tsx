/** Inline per-field validation message (icon + text). Pair with a zod schema whose
 * messages are i18n keys, resolved with t() at the call site. */
export function FieldError({ message }: { message: string }) {
  return (
    <div className="msg err">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16h.01" />
      </svg>
      <span>{message}</span>
    </div>
  )
}
