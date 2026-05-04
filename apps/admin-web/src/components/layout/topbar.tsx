'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { LogOut, ChevronRight } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { findRouteByPath } from '@/config/routes'

function humanizeSegment(segment: string): string {
  // UUID / hash / cuid-style identifiers — show truncated for breadcrumbs.
  const looksLikeId = segment.length >= 12 && /^[0-9a-f-]+$/i.test(segment)
  if (looksLikeId) return `#${segment.slice(0, 8)}`
  return segment
    .split(/[-_]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ')
}

interface Crumb {
  href: string
  label: string
  isLast: boolean
}

function getBreadcrumbs(pathname: string): Crumb[] {
  const segments = pathname.split('/').filter(Boolean)
  return segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/')
    const config = findRouteByPath(href)
    return {
      href,
      label: config?.label ?? humanizeSegment(segment),
      isLast: index === segments.length - 1,
    }
  })
}

function getInitials(name: string | null | undefined): string {
  if (!name) return 'AD'
  const initials = name
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .filter(Boolean)
    .join('')
    .toUpperCase()
    .slice(0, 2)
  return initials || 'AD'
}

export function Topbar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const breadcrumbs = getBreadcrumbs(pathname)

  const admin = session?.admin

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.href} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3" />}
            {crumb.isLast ? (
              <span className="font-medium text-foreground">{crumb.label}</span>
            ) : (
              <Link href={crumb.href} className="hover:text-foreground">
                {crumb.label}
              </Link>
            )}
          </span>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {getInitials(admin?.name)}
                </AvatarFallback>
              </Avatar>
              <div className="hidden text-left md:block">
                <p className="text-sm font-medium leading-tight">{admin?.name ?? 'Admin'}</p>
                <p className="text-xs text-muted-foreground">{admin?.email}</p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{admin?.name}</p>
                <p className="text-xs text-muted-foreground">{admin?.email}</p>
                <Badge variant="secondary" className="mt-1 w-fit text-xs">
                  {admin?.role}
                </Badge>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-danger-600 focus:text-danger-600"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
