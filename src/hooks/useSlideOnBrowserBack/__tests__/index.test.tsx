// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserRouter, Route, Routes, useNavigate } from 'react-router'
import { PageTransitions } from '../../../components/PageTransitions'
import { slide } from '../../useAppNavigate/utils.ts'
import { stubReducedMotion, stubViewTransition } from '../../../testing/viewTransition.ts'
import { openOverlay, releaseOverlay } from '../../useCloseOnBack/overlays.ts'
import { installSlideOnBrowserBack } from '../index.ts'

function PageA() {
  const navigate = useNavigate()
  return <button onClick={() => navigate('/b')}>Page A: go to B</button>
}
function PageB() {
  const navigate = useNavigate()
  return <button onClick={() => navigate('/c')}>Page B: go to C</button>
}

// Installed before the router exists, as `main.tsx` does.
let uninstall: () => void
let transitions: ReturnType<typeof stubViewTransition>

function renderApp() {
  render(
    <div id="root">
    <BrowserRouter>
      <PageTransitions />
      <Routes>
        <Route path="/a" element={<PageA />} />
        <Route path="/b" element={<PageB />} />
        <Route path="/c" element={<div>Page C</div>} />
      </Routes>
    </BrowserRouter>
    </div>,
  )
}

/**
 * Runs the held transition callbacks the way a browser does, outside `act`: the
 * callback waits for the new page to be on screen, which React only commits once
 * the test lets it, so `act` would wait for itself.
 */
async function finishTransitions() {
  const running = transitions.runHeld()
  await waitFor(() => expect(slide.waiting).toBeNull())
  await running
}

async function goToB() {
  await userEvent.click(screen.getByRole('button', { name: 'Page A: go to B' }))
  await screen.findByRole('button', { name: 'Page B: go to C' })
}

beforeEach(() => {
  window.history.replaceState(null, '', '/a')
  slide.waiting = null
  slide.path = ''
  slide.index = 0
  transitions = stubViewTransition({ hold: true })
  uninstall = installSlideOnBrowserBack()
})
afterEach(() => {
  cleanup()
  uninstall()
  transitions.restore()
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate
})

describe('installSlideOnBrowserBack', () => {
  it('starts a back slide for the browser Back, and holds the old page on screen until the browser has taken its picture', async () => {
    HTMLElement.prototype.animate = vi.fn()
    renderApp()
    await goToB()
    // Going forward by link also started a transition: let it finish first.
    await finishTransitions()
    transitions.started.length = 0
    vi.mocked(HTMLElement.prototype.animate).mockClear()

    act(() => window.history.back())
    await waitFor(() => expect(transitions.started).toEqual(['back']))

    // The picture is taken of the page still showing (B); only then does the router show A.
    expect(screen.getByRole('button', { name: 'Page B: go to C' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Page A: go to B' })).not.toBeInTheDocument()
    await finishTransitions()
    expect(await screen.findByRole('button', { name: 'Page A: go to B' })).toBeInTheDocument()
    // The slide's, not the fade's.
    expect(HTMLElement.prototype.animate).not.toHaveBeenCalled()
  })

  it('starts a forward slide for the browser Forward', async () => {
    renderApp()
    await goToB()
    await finishTransitions()
    act(() => window.history.back())
    await waitFor(() => expect(transitions.started).toContain('back'))
    await finishTransitions()
    await screen.findByRole('button', { name: 'Page A: go to B' })
    transitions.started.length = 0

    act(() => window.history.forward())
    await waitFor(() => expect(transitions.started).toEqual(['forward']))
    await finishTransitions()
    expect(await screen.findByRole('button', { name: 'Page B: go to C' })).toBeInTheDocument()
  })

  it('clears the direction once the slide is done', async () => {
    renderApp()
    await goToB()
    await finishTransitions()
    act(() => window.history.back())
    await waitFor(() => expect(document.documentElement.dataset.nav).toBe('back'))
    await finishTransitions()

    await waitFor(() => expect(document.documentElement.dataset.nav).toBeUndefined())
  })

  it('leaves a change that keeps the same page, such as a #fragment, to the router', async () => {
    renderApp()
    transitions.started.length = 0
    const seen = vi.fn()
    window.addEventListener('popstate', seen)

    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))

    expect(seen).toHaveBeenCalledTimes(1)
    expect(transitions.started).toEqual([])
    window.removeEventListener('popstate', seen)
  })

  it('leaves the browser Back to the router where the browser cannot slide', async () => {
    transitions.restore()
    renderApp()
    await goToB()

    act(() => window.history.back())

    expect(await screen.findByRole('button', { name: 'Page A: go to B' })).toBeInTheDocument()
    expect(document.documentElement.dataset.nav).toBeUndefined()
  })

  it('leaves the browser Back to the router when the user asked for less motion', async () => {
    const undo = stubReducedMotion(true)
    renderApp()
    await goToB()

    act(() => window.history.back())

    expect(await screen.findByRole('button', { name: 'Page A: go to B' })).toBeInTheDocument()
    expect(transitions.started).toEqual([])
    undo()
  })

  it('stops watching once it is removed', async () => {
    uninstall()
    renderApp()
    await goToB()
    transitions.started.length = 0

    act(() => window.history.back())

    expect(await screen.findByRole('button', { name: 'Page A: go to B' })).toBeInTheDocument()
    expect(transitions.started).toEqual([])
    uninstall = installSlideOnBrowserBack()
  })
})

describe('installSlideOnBrowserBack with overlays open (PRD 5.19)', () => {
  it('lets Back close the overlay: no slide, no fade, no page change, and the router does not hear of it', async () => {
    HTMLElement.prototype.animate = vi.fn()
    renderApp()
    await goToB()
    await finishTransitions()
    transitions.started.length = 0
    vi.mocked(HTMLElement.prototype.animate).mockClear()
    const close = vi.fn()
    const overlay = openOverlay({ close, dismissible: () => true })

    act(() => window.history.back())
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1))

    expect(transitions.started).toEqual([])
    expect(HTMLElement.prototype.animate).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Page B: go to C' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/b')
    releaseOverlay(overlay)
  })

  it('still slides for Back from the page once the overlay is closed', async () => {
    renderApp()
    await goToB()
    await finishTransitions()
    const overlay = openOverlay({ close: vi.fn(), dismissible: () => true })
    act(() => window.history.back())
    await waitFor(() => expect(window.history.state?.overlay).toBeUndefined())
    releaseOverlay(overlay)
    transitions.started.length = 0

    act(() => window.history.back())
    await waitFor(() => expect(transitions.started).toEqual(['back']))
    await finishTransitions()

    expect(await screen.findByRole('button', { name: 'Page A: go to B' })).toBeInTheDocument()
  })

  it('does not slide when Back is pressed with a sheet that must stay', async () => {
    renderApp()
    await goToB()
    await finishTransitions()
    transitions.started.length = 0
    const close = vi.fn()
    const overlay = openOverlay({ close, dismissible: () => false })

    act(() => window.history.back())
    await waitFor(() => expect(window.history.state?.overlay).toBe(1))

    expect(close).not.toHaveBeenCalled()
    expect(transitions.started).toEqual([])
    expect(screen.getByRole('button', { name: 'Page B: go to C' })).toBeInTheDocument()
    releaseOverlay(overlay)
  })
})
