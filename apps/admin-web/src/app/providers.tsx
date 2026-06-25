'use client'

import { SessionProvider } from 'next-auth/react'
import { Toaster } from 'sonner'
import type { ReactNode } from 'react'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <Toaster richColors position="top-right" />
    </SessionProvider>
  )
}
