// Runs before every test file. Adds the readable checks of jest-dom
// (`toBeInTheDocument`, `toHaveTextContent`, ...) and, in the jsdom tests, the
// browser features Ant Design and our hooks expect but jsdom does not have.
import '@testing-library/jest-dom/vitest'
import { logService } from '../services/logService'

// Log lines would drown the test report; tests that check them read them with `captureLogs`.
logService.setOutput(() => {})

if (typeof window !== 'undefined') {
  // `findBy...` and `waitFor` give up after 1 s by default, which a busy
  // machine (a full run with many files at once) can take to show a page that
  // opens a database. A longer limit costs nothing when the screen is right.
  const { configure } = await import('@testing-library/react')
  configure({ asyncUtilTimeout: 5000 })

  // Ant Design's responsive helpers and `useColorScheme` ask for media queries.
  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList

  // jsdom does not scroll (it prints "Not implemented" each time); the page transitions put each page back where it was
  // scrolled (`PageTransitions`), so this one moves `window.scrollY` for the tests to read.
  window.scrollTo = ((first: ScrollToOptions | number, second?: number) => {
    const top = typeof first === 'object' ? (first.top ?? window.scrollY) : (second ?? 0)
    Object.defineProperty(window, 'scrollY', { value: top, configurable: true })
  }) as typeof window.scrollTo

  // Used by Ant Design to measure dropdowns and lists.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  // Ant Design asks for the styles of pseudo-elements to measure scrollbars;
  // jsdom cannot answer and prints a warning each time, so ask without them.
  const getComputedStyle = window.getComputedStyle.bind(window)
  window.getComputedStyle = (element) => getComputedStyle(element)

  // Ant Design scrolls items into view; jsdom has no layout to scroll.
  Element.prototype.scrollIntoView ??= () => {}

  // jsdom cannot show Blobs, so it has no blob addresses; give each a unique
  // one, so photos can be shown and their addresses freed as in a browser.
  let blobUrls = 0
  URL.createObjectURL ??= () => `blob:test/${++blobUrls}`
  URL.revokeObjectURL ??= () => {}
}
