import { canSlide, COMMIT_TIMEOUT_MS, slide } from '../useAppNavigate/utils.ts'

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

  function handlePopState(event: PopStateEvent) {
    if (replaying) return
    const index: number = window.history.state?.idx ?? slide.index - 1
    // A change of the #fragment on the same page is not a page change.
    if (window.location.pathname === slide.path || !canSlide()) return
    const direction = index < slide.index ? 'back' : 'forward'
    // Keep the router from replacing the page before the picture is taken.
    event.stopImmediatePropagation()

    const root = document.documentElement
    root.dataset.nav = direction
    const transition = document.startViewTransition(
      () =>
        new Promise<void>((resolve) => {
          slide.waiting = resolve
          replaying = true
          window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
          replaying = false
          setTimeout(resolve, COMMIT_TIMEOUT_MS)
        }),
    )
    void transition.finished.finally(() => {
      delete root.dataset.nav
      slide.waiting = null
    })
  }

  window.addEventListener('popstate', handlePopState)
  return () => window.removeEventListener('popstate', handlePopState)
}
