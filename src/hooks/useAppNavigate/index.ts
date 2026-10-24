import { useCallback } from 'react'
import { useNavigate, type NavigateOptions, type To } from 'react-router'
import { canSlide, COMMIT_TIMEOUT_MS, slide, type NavDirection } from './utils.ts'

type Options = NavigateOptions & {
  /**
   * Forward (the default) slides the new page in from the right; back, for a Back
   * arrow, Cancel, or a Save that returns to where the user came from, slides it
   * out to the right. A navigation that replaces the page has no direction.
   */
  direction?: NavDirection
}

/**
 * `useNavigate` that animates the page change with a slide (PRD 5.15, ADR-057):
 * the old page moves a little to the left and dims while the new one slides in
 * (back reverses it). It uses the View Transitions API, and does nothing extra
 * where that is missing, the user asked for less motion, or the page is only
 * replaced; `PageTransitions` fades those in.
 */
export function useAppNavigate() {
  const navigate = useNavigate()

  return useCallback(
    (to: To, { direction, ...options }: Options = {}) => {
      if (options.replace || !canSlide()) {
        navigate(to, options)
        return
      }
      const root = document.documentElement
      root.dataset.nav = direction ?? 'forward'
      const transition = document.startViewTransition(
        () =>
          new Promise<void>((resolve) => {
            slide.waiting = resolve
            navigate(to, options)
            // Let go if the page never commits (the same address, or a refusal).
            setTimeout(resolve, COMMIT_TIMEOUT_MS)
          }),
      )
      void transition.finished.finally(() => {
        delete root.dataset.nav
        slide.waiting = null
      })
    },
    [navigate],
  )
}
