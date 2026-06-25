export const dateTransformer = {
  to: (value: Date | null | undefined) => value,
  from: (value: Date | string | null): Date | null => {
    if (value === null || value === undefined) return null
    return value instanceof Date ? value : new Date(value)
  },
}
