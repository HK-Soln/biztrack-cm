'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { PanelLeftClose, PanelLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getVisibleRoutes } from '@/config/routes'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname()
  const { data: session } = useSession()

  const permissions = session?.admin?.permissions ?? []
  const isSuperAdmin = session?.admin?.isSuperAdmin ?? false

  const visibleItems = getVisibleRoutes(permissions, isSuperAdmin)

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'flex h-screen flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-200',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        <div className="flex h-16 items-center border-b border-sidebar-border px-4">
          {!collapsed && (
            <span className="text-lg font-semibold text-sidebar-foreground">
              BizTrack Admin
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent',
              collapsed ? 'mx-auto' : 'ml-auto'
            )}
          >
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          {visibleItems.map((item) => {
            const isActive = pathname === item.path || pathname.startsWith(`${item.path}/`)

            const linkContent = (
              <Link
                href={item.path}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
                  collapsed && 'justify-center px-0'
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            )

            if (collapsed) {
              return (
                <Tooltip key={item.path}>
                  <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              )
            }

            return <div key={item.path}>{linkContent}</div>
          })}
        </nav>
      </aside>
    </TooltipProvider>
  )
}
