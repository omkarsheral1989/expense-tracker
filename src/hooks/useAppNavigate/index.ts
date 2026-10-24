import { useCallback } from 'react'
import { useNavigate, type NavigateOptions, type To } from 'react-router'
import { groupHeroFor, routerPathOf, setGroupOpenStyle } from './hero.ts'
import { canSlide, COMMIT_TIMEOUT_MS, previousPageIs, slide, type NavDirection } from './utils.ts'

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
      // Going back to the page just before this one leaves it behind in the history, so the
      // browser's Back does not bring it back (ADR-059). The slide is the history pop's (`useSlideOnBrowserBack`).
      const target = typeof to === 'string' ? to : to.pathname
      if (direction === 'back' && !options.replace && target && previousPageIs(target)) {
        navigate(-1)
        return
      }
      // Any other way back replaces this page by the target, again leaving it out of the history.
      const replace = options.replace ?? direction === 'back'
      const navigation = { ...options, replace }
      if ((replace && !direction) || !canSlide()) {
        navigate(to, navigation)
        return
      }
      const root = document.documentElement
      // A group's row and its page morph into each other (PRD 5.16); anything else slides.
      const hero = target && !replace ? groupHeroFor(routerPathOf(slide.path), target) : null
      if (hero) setGroupOpenStyle(root)
      root.dataset.nav = hero?.direction ?? direction ?? 'forward'
      const undoBefore = hero?.before()
      let undoAfter: (() => void) | undefined
      const transition = document.startViewTransition(
        () =>
          new Promise<void>((resolve) => {
            slide.waiting = () => {
              undoAfter = hero?.after()
              resolve()
            }
            navigate(to, navigation)
            // Let go if the page never commits (the same address, or a refusal).
            setTimeout(resolve, COMMIT_TIMEOUT_MS)
          }),
      )
      void transition.finished.finally(() => {
        delete root.dataset.nav
        slide.waiting = null
        undoBefore?.()
        undoAfter?.()
      })
    },
    [navigate],
  )
}
