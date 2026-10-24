import { vi } from 'vitest'

/**
 * Gives jsdom a `document.startViewTransition` (it has none), and says what
 * each page change asked for: the direction the page's root carried when the
 * transition started. The transition runs its callback at once (or, with `hold`,
 * when the test calls `runHeld`), as a browser does a frame later. Call
 * `restore` to put jsdom back.
 */
export function stubViewTransition({ hold = false }: { hold?: boolean } = {}) {
  const started: (string | undefined)[] = []
  const held: (() => Promise<void>)[] = []
  const original = document.startViewTransition
  document.startViewTransition = vi.fn((callback?: () => unknown) => {
    started.push(document.documentElement.dataset.nav)
    const run = async () => {
      await callback?.()
    }
    // With `hold`, the callback runs only when the test says (a browser runs it a frame later).
    const done = hold ? new Promise<void>((resolve) => held.push(async () => { await run(); resolve() })) : run()
    return { finished: done, ready: done, updateCallbackDone: done, skipTransition: () => {} } as unknown as ViewTransition
  })
  return {
    /** With `hold`: runs the callbacks of the transitions that are waiting. */
    runHeld: async () => {
      while (held.length) await held.shift()!()
    },
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
