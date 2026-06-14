//@ts-ignore
import './globals.css'
import type { ReactNode } from 'react'
import { Providers } from './providers'

export const metadata = {
  title: 'BizTrack CM',
  description: 'BizTrack CM desktop (v2)',
}

// Applies the persisted palette/chrome before first paint to avoid a theme flash.
// next-themes injects its own no-flash script for the .dark class.
const themeNoFlashScript = `(function(){try{var p=localStorage.getItem('biztrack.theme.palette');var c=localStorage.getItem('biztrack.theme.chrome');var e=document.documentElement;e.setAttribute('data-palette',(p==='a'||p==='b'||p==='c'||p==='d')?p:'a');e.setAttribute('data-chrome',(c==='neutral'||c==='brand')?c:'neutral');}catch(_){}})();`

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-palette="a" data-chrome="neutral" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeNoFlashScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
