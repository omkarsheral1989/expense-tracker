import { vi } from 'vitest'

/**
 * Gives jsdom a `document.startViewTransition` (it has none), and says what
 * each page change asked for: the direction the page's root carried when the
 * transition started. The transition runs its callback at once, as a browser
 * does a frame later. Call the returned function to put jsdom back.
 */
export function stubViewTransition() {
  const started: (string | undefined)[] = []
  const original = document.startViewTransition
  document.startViewTransition = vi.fn((callback?: () => unknown) => {
    started.push(document.documentElement.dataset.nav)
    const done = Promise.resolve(callback?.()).then(() => undefined)
    return { finished: done, ready: done, updateCallbackDone: done, skipTransition: () => {} } as unknown as ViewTransition
  })
  return {
    /** The direction of each transition started so far ("forward" or "back"). */
    started,
    restore: () => {
      if (original) document.startViewTransition = original
      else delete (document as Partial<Document>).startViewTransition
    },
  }
}

/** Makes `prefers-reduced-motion: reduce` match (or not) until the returned function is called. */
export function stubReducedMotion(reduce: boolean) {
  const original = window.matchMedia
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
  return () => {
    window.matchMedia = original
  }
}
