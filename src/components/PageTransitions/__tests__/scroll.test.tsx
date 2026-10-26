// @vitest-environment jsdom
// A page that is opened starts at the top; going back returns to where the page was scrolled, before the transition takes
// its picture, so a row that morphs back into its band is where the user left it (PRD 5.16).
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAppNavigate } from '../../../hooks/useAppNavigate'
import { slide, type NavDirection } from '../../../hooks/useAppNavigate/utils.ts'
import { installSlideOnBrowserBack } from '../../../hooks/useSlideOnBrowserBack'
import { PageTransitions } from '../index.tsx'

type Go = { to: string; direction?: NavDirection; replace?: boolean }

function Page({ name, links }: { name: string; links: Record<string, Go> }) {
  const navigate = useAppNavigate()
  return (
    <div>
      <p>Page {name}</p>
      {Object.entries(links).map(([label, go]) => (
        <button key={label} onClick={() => navigate(go.to, go)}>
          {label}
        </button>
      ))}
    </div>
  )
}

function renderApp() {
  render(
    <BrowserRouter>
      <PageTransitions />
      <Routes>
        <Route path="/a" element={<Page name="A" links={{ 'Open B': { to: '/b' } }} />} />
        <Route path="/b" element={<Page name="B" links={{ 'Back to A': { to: '/a', direction: 'back' }, 'Open C instead': { to: '/c', replace: true, direction: 'forward' } }} />} />
        <Route path="/c" element={<Page name="C" links={{}} />} />
      </Routes>
    </BrowserRouter>,
  )
}

/** The user scrolls the page to `top`. */
const scrollTo = (top: number) => window.scrollTo(0, top)

let removeBrowserBack: () => void
beforeEach(() => {
  window.history.replaceState(null, '', '/a')
  slide.paths.clear()
  slide.scrolls.clear()
  slide.waiting = null
  scrollTo(0)
  removeBrowserBack = installSlideOnBrowserBack()
})
afterEach(() => {
  cleanup()
  removeBrowserBack()
})

describe('scroll positions', () => {
  it('starts a page that is opened at the top', async () => {
    renderApp()
    scrollTo(700)

    await userEvent.click(screen.getByRole('button', { name: 'Open B' }))

    await screen.findByText('Page B')
    expect(window.scrollY).toBe(0)
  })

  it('returns to where the page was scrolled with the app\'s Back', async () => {
    renderApp()
    scrollTo(700)
    await userEvent.click(screen.getByRole('button', { name: 'Open B' }))
    await screen.findByText('Page B')
    scrollTo(150)

    await userEvent.click(screen.getByRole('button', { name: 'Back to A' }))

    await screen.findByText('Page A')
    expect(window.scrollY).toBe(700)
  })

  it('returns there with the browser\'s Back too, and Forward returns to where the next page was', async () => {
    renderApp()
    scrollTo(700)
    await userEvent.click(screen.getByRole('button', { name: 'Open B' }))
    await screen.findByText('Page B')
    scrollTo(150)

    window.history.back()
    await screen.findByText('Page A')
    expect(window.scrollY).toBe(700)

    window.history.forward()
    await screen.findByText('Page B')
    expect(window.scrollY).toBe(150)
  })

  it('starts a page that replaces another at the top', async () => {
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: 'Open B' }))
    await screen.findByText('Page B')
    scrollTo(300)

    await userEvent.click(screen.getByRole('button', { name: 'Open C instead' }))

    await screen.findByText('Page C')
    expect(window.scrollY).toBe(0)
  })

  it('leaves putting pages back to the app, not the browser', () => {
    // jsdom's history has no such setting; a browser's starts at 'auto'.
    Object.defineProperty(window.history, 'scrollRestoration', { value: 'auto', writable: true, configurable: true })
    const remove = installSlideOnBrowserBack()

    expect(window.history.scrollRestoration).toBe('manual')
    remove()
    delete (window.history as { scrollRestoration?: string }).scrollRestoration
  })
})
