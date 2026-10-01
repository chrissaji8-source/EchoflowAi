import { useLayoutEffect, type ComponentProps } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useCurtain } from './Curtain'

function plainLeftClick(e: React.MouseEvent) {
  return !(e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
}

/** `<Link>` that goes through the curtain. */
export function TLink({ to, onClick, ...rest }: ComponentProps<typeof Link>) {
  const { go } = useCurtain()
  return (
    <Link
      to={to}
      {...rest}
      onClick={(e) => {
        onClick?.(e)
        if (!plainLeftClick(e) || typeof to !== 'string') return
        e.preventDefault()
        go(to)
      }}
    />
  )
}

/** `<NavLink>` that goes through the curtain. */
export function TNavLink({ to, onClick, ...rest }: ComponentProps<typeof NavLink>) {
  const { go } = useCurtain()
  return (
    <NavLink
      to={to}
      {...rest}
      onClick={(e) => {
        onClick?.(e)
        if (!plainLeftClick(e) || typeof to !== 'string') return
        e.preventDefault()
        go(to)
      }}
    />
  )
}

/** Reset scroll on route change (or jump to the #hash target). */
export function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useLayoutEffect(() => {
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'instant' })
      return
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname, hash])
  return null
}
