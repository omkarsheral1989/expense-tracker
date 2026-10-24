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
export const slide: {
  waiting: (() => void) | null
  path: string
  index: number
  paths: Map<number, string>
  /**
   * While a row's pieces travel into a band (PRD 5.16), settles when that transition ends; null otherwise. A page whose band
   * would be replaced by another element meanwhile (the expense page, when its data arrives) waits for it, since the browser
   * ends a transition whose named piece leaves the page.
   */
  morph: Promise<void> | null
} = {
  waiting: null,
  morph: null,
  path: '',
  index: 0,
  paths: new Map(),
}

/**
 * Whether the page just before this one in the browser's history is `to`, so that going
 * back to it can pop the history instead of adding a page (ADR-059). The router's own
 * position in the history is its `idx`; `slide.paths` remembers the page of each position
 * the app has been at since it opened, so after a reload nothing is known.
 */
export function previousPageIs(to: string): boolean {
  const index: number = window.history.state?.idx ?? 0
  return index > 0 && slide.paths.get(index - 1) === to.split(/[?#]/)[0]
}
