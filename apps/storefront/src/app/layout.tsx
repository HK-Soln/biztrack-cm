//@ts-ignore
import './globals.css'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'BizTrack Online',
  description: 'Online stores powered by BizTrack CM',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
