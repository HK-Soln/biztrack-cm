const toNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export default () => ({
  admin: {
    port: toNumber(process.env.ADMIN_PORT, 3002),
  },
})
