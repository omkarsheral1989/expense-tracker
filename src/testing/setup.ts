// Runs before every test file. Adds the readable checks of jest-dom
// (`toBeInTheDocument`, `toHaveTextContent`, ...) and, in the jsdom tests, the
// browser features Ant Design and our hooks expect but jsdom does not have.
import '@testing-library/jest-dom/vitest'

if (typeof window !== 'undefined') {
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
