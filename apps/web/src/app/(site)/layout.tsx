import './site.css'
import type { Metadata } from 'next'
import { SiteHeader } from './_chrome/SiteHeader'
import { SiteFooter } from './_chrome/SiteFooter'
import { SiteChrome } from './_chrome/SiteChrome'

export const metadata: Metadata = {
  metadataBase: new URL('https://hk-solutions.app'),
  openGraph: {
    siteName: 'BizTrack CM',
    locale: 'en_US',
    alternateLocale: 'fr_FR',
    type: 'website',
  },
  twitter: { card: 'summary_large_image' },
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
      <SiteChrome />
    </>
  )
}
