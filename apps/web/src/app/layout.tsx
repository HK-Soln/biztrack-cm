import type { Metadata } from 'next'
import { Analytics } from "@vercel/analytics/next"
// @ts-expect-error - Global CSS import, allowed in Next.js
import './globals.css'

export const metadata: Metadata = {
  title: 'BizTrack CM',
  description: 'Manage your business simply and efficiently with BizTrack CM. Our all-in-one platform offers tools for inventory management, sales tracking, customer relationship management, and more. Streamline your operations and grow your business with ease.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <Analytics />
      <body>{children}</body>
    </html>
  )
}
