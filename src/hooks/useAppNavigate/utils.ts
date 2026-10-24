/** Which way a page change moves: forward slides the new page in from the right, back slides it out to the right. */
export type NavDirection = 'forward' | 'back'

/** The most a page change is waited for before the slide is let go (ms), so a page that never commits cannot freeze the screen. */
export const COMMIT_TIMEOUT_MS = 1000

/** True when the user asked their device for less motion: no page animation at all. */
export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** True when the browser can slide a page change (the View Transitions API) and the user allows motion. */
export function canSlide(): boolean {
  return typeof document.startViewTransition === 'function' && !prefersReducedMotion()
}

/**
 * State shared by `useAppNavigate` and `PageTransitions`: a slide that has been
 * asked for and is waiting for the new page to be on screen. While one waits,
 * the page change is the slide's and no fade runs on top of it.
 */
export const slide: { waiting: (() => void) | null } = { waiting: null }
