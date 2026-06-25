import './globals.css'
import type { ReactNode } from 'react'
import { Providers } from './providers'

export const metadata = {
  title: 'BizTrack Admin',
  description: 'BizTrack CM admin dashboard',
}

type RootLayoutProps = {
  children: ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
