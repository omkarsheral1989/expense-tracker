import { useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router'
import { prefersReducedMotion, slide } from '../../hooks/useAppNavigate/utils.ts'
import { PAGE_FADE_MS, PAGE_TRANSITION_MS } from '../../theme/transition.ts'

/**
 * Renders nothing. When the page changes it finishes a slide that is waiting for
 * the new page (`useAppNavigate`), and for every other change (the browser's or
 * the phone's Back, a page that replaces the current one, a browser without
 * View Transitions) fades the new page in. The first screen appears at once, and
 * with reduced motion nothing animates (PRD 5.15).
 */
export function PageTransitions() {
  const location = useLocation()
  const first = useRef(true)

  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--page-transition-ms', `${PAGE_TRANSITION_MS}ms`)
  }, [])

  useLayoutEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (slide.waiting) {
      // The new page is on screen: the slide can start.
      slide.waiting()
      slide.waiting = null
      return
    }
    const root = document.getElementById('root')
    if (!root || typeof root.animate !== 'function' || prefersReducedMotion()) return
    root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: PAGE_FADE_MS, easing: 'ease-out' })
  }, [location.key])

  return null
}
