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
