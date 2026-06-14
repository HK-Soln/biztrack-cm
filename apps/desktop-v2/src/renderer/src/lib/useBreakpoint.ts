import { useEffect, useState } from 'react'

export type Breakpoint = 'mobile' | 'tablet' | 'desktop'

// Matches the design breakpoints: mobile < 640, tablet 640–1023, desktop ≥ 1024.
function resolve(width: number): Breakpoint {
  if (width < 640) return 'mobile'
  if (width < 1024) return 'tablet'
  return 'desktop'
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(() =>
    typeof window === 'undefined' ? 'desktop' : resolve(window.innerWidth),
  )
  useEffect(() => {
    const onResize = () => setBp(resolve(window.innerWidth))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return bp
}
