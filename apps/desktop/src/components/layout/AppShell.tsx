import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import type { ReactNode } from 'react'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopBar />
        <main style={{ flex: 1, overflow: 'auto', padding: '1.5rem', background: '#f9fafb' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
