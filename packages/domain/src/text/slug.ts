// ---------------------------------------------------------------------------
// One way to turn a name into a slug, for the server and the till: lower case, accents
// removed, anything other than letters, digits, spaces and '-' dropped, spaces as '-'.
// "Kemi Stores", "kemi stores " and "Kémi Stores" all give `kemi-stores`.
// ---------------------------------------------------------------------------

export function slugify(text: string, maxLength = 200): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLength)
}

/**
 * A slug for `name` that is not among `taken`: the plain slug, or the first of `-2`, `-3`,
 * ... that is free. `taken` holds every slug already used in the business, deleted records
 * included, since the unique index counts them. An empty slug becomes `fallback`.
 */
export function uniqueSlug(
  name: string,
  taken: Iterable<string>,
  fallback = 'item',
  maxLength = 200,
): string {
  const base = slugify(name, maxLength) || fallback
  const used = new Set(taken)
  if (!used.has(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`
    if (!used.has(candidate)) return candidate
  }
}
