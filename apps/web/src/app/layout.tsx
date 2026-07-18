// @ts-ignore
import './globals.css'
import type { Metadata } from 'next'
import { Sora, Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'

const sora = Sora({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-sora',
  display: 'swap',
})
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'BizTrack CM',
  description:
    'Manage your business simply and efficiently with BizTrack CM. Our all-in-one platform offers tools for inventory management, sales tracking, customer relationship management, and more. Streamline your operations and grow your business with ease.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sora.variable} ${inter.variable}`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
