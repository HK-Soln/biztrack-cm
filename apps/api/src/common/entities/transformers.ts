export const decimalTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | number | null): number | null => {
    if (value === null || value === undefined) return null
    return typeof value === 'number' ? value : Number(value)
  },
}

export const dateTransformer = {
  to: (value: Date | null | undefined) => value,
  from: (value: Date | string | null): Date | null => {
    if (value === null || value === undefined) return null
    return value instanceof Date ? value : new Date(value)
  },
}
