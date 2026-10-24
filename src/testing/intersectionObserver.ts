import { vi } from 'vitest'

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void

type Watcher = { callback: Callback; target: Element | null; options?: IntersectionObserverInit; disconnected: boolean }

/**
 * Gives jsdom an `IntersectionObserver` (it has none) that reports nothing until
 * the test says an element has come into view. `reach()` tells every observer
 * that is still watching that its element is in view, as scrolling to the end of
 * a list does. Call `restore` to put jsdom back.
 */
export function stubIntersectionObserver() {
  const watchers: Watcher[] = []
  const original = globalThis.IntersectionObserver
  globalThis.IntersectionObserver = vi.fn(function (this: unknown, callback: Callback, options?: IntersectionObserverInit) {
    const watcher: Watcher = { callback, target: null, options, disconnected: false }
    watchers.push(watcher)
    return {
      observe: (target: Element) => {
        watcher.target = target
      },
      unobserve: () => {},
      disconnect: () => {
        watcher.disconnected = true
      },
      takeRecords: () => [],
    }
  }) as unknown as typeof IntersectionObserver
  return {
    watchers,
    /** The observers that still watch an element. */
    active: () => watchers.filter((watcher) => watcher.target && !watcher.disconnected),
    /** Tells the observers that still watch an element that it is in view. */
    reach: () => {
      for (const watcher of watchers.filter((w) => w.target && !w.disconnected)) watcher.callback([{ isIntersecting: true, target: watcher.target! }])
    },
    restore: () => {
      if (original) globalThis.IntersectionObserver = original
      else delete (globalThis as Partial<typeof globalThis>).IntersectionObserver
    },
  }
}
