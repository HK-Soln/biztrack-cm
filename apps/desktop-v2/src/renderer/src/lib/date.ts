// Today's date as a local `YYYY-MM-DD` string, suitable for <input type="date">
// defaults. Uses local time (not UTC) so the picker shows the user's actual today.
export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
