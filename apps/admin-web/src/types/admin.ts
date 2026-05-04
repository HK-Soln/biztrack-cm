export interface AdminSession {
  id: string
  name: string
  email: string
  role: string
  isSuperAdmin: boolean
  permissions: string[]
  scopes: Record<string, { cities?: string[]; plans?: string[] }>
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export interface ActionResult {
  success: boolean
  error?: string
}
