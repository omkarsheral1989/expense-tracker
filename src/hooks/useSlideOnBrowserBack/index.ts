import { groupHeroFor, routerPathOf, setGroupOpenStyle } from '../useAppNavigate/hero.ts'
import { handleOverlayPop } from '../useCloseOnBack/overlays.ts'
import { canSlide, COMMIT_TIMEOUT_MS, rememberScroll, slide } from '../useAppNavigate/utils.ts'

/**
 * Slides the page for the browser's and the phone's Back and Forward too (PRD
 * 5.15, ADR-057). The address changes before the app can react, and the router
 * replaces the page in the same event, so there would be no old page left for the
 * browser to take a picture of. So the event is held back: the browser starts its
 * transition (it takes the picture of the page still on screen), and inside it the
 * event is handed to the router again, which then shows the new page.
 *
 * It must be called before the router is created: listeners run in the order they
 * were added, and this one has to see the event first. Returns a function that
 * removes it.
 */
export function installSlideOnBrowserBack(): () => void {
  let replaying = false
  // The app puts each page back where it was scrolled itself (`PageTransitions`), before the transition takes its picture.
  if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'

  function handlePopState(event: PopStateEvent) {
    if (replaying) return
    // A move between an overlay's steps is not a page change (PRD 5.19): Back closes the overlay, and the router never hears of it.
    if (handleOverlayPop(event)) return
    rememberScroll()
    const index: number = window.history.state?.idx ?? slide.index - 1
    // A change of the #fragment on the same page is not a page change.
    if (window.location.pathname === slide.path || !canSlide()) return
    const direction = index < slide.index ? 'back' : 'forward'
    // Keep the router from replacing the page before the picture is taken.
    event.stopImmediatePropagation()

    const root = document.documentElement
    // A group's row and its page morph into each other (PRD 5.16), whichever way the browser went.
    const hero = groupHeroFor(routerPathOf(slide.path), routerPathOf(window.location.pathname))
    if (hero) setGroupOpenStyle(root, hero)
    root.dataset.nav = hero?.direction ?? direction
    const undoBefore = hero?.before()
    let undoAfter: (() => void) | undefined
    const transition = document.startViewTransition(
      () =>
        new Promise<void>((resolve) => {
          slide.waiting = () => {
            undoAfter = hero?.after()
            resolve()
          }
          replaying = true
          window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
          replaying = false
          setTimeout(resolve, COMMIT_TIMEOUT_MS)
        }),
    )
    const morph = hero ? transition.finished.then(() => undefined, () => undefined) : null
    slide.morph = morph
    void transition.finished.finally(() => {
      delete root.dataset.nav
      if (slide.morph === morph) slide.morph = null
      slide.waiting = null
      undoBefore?.()
      undoAfter?.()
    })
  }

  window.addEventListener('popstate', handlePopState)
  return () => window.removeEventListener('popstate', handlePopState)
}
