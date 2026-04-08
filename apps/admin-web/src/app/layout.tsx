import './globals.css'
import type { ReactNode } from 'react'

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
      <body>{children}</body>
    </html>
  )
}
