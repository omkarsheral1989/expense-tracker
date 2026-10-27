// @vitest-environment jsdom
// A page change made while overlays are open ends with the same history as without them (PRD 5.19, ADR-063, ADR-059).
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserRouter, Route, Routes } from 'react-router'
import { PageTransitions } from '../../../components/PageTransitions'
import { handleOverlayPop, openOverlayCount } from '../../useCloseOnBack/overlays.ts'
import { useCloseOnBack } from '../../useCloseOnBack'
import { useAppNavigate } from '../index.ts'
import { slide } from '../utils.ts'

function Overlay({ name }: { name: string }) {
  useCloseOnBack(true, () => {})
  return <p>Overlay {name}</p>
}

function Page({ name, to, direction, overlays = 0 }: { name: string; to: string; direction?: 'back' | 'forward'; overlays?: number }) {
  const navigate = useAppNavigate()
  const [open, setOpen] = useState(overlays)
  return (
    <div>
      <p>Page {name}</p>
      <button onClick={() => setOpen((count) => count + 1)}>Open overlay</button>
      <button onClick={() => navigate(to, { direction })}>Go</button>
      {Array.from({ length: open }, (_, index) => (
        <Overlay key={index} name={`${name}${index}`} />
      ))}
    </div>
  )
}

function renderApp() {
  render(
    <BrowserRouter>
      <PageTransitions />
      <Routes>
        <Route path="/a" element={<Page name="A" to="/b" />} />
        <Route path="/b" element={<Page name="B" to="/a" direction="back" />} />
      </Routes>
    </BrowserRouter>,
  )
}

/** Where the app is now: the path, the router's position in the history, and how many overlay steps are on top of it. */
const where = () => `${window.location.pathname}#${window.history.state?.idx}/${window.history.state?.overlay ?? 0}`
const tick = () => new Promise((resolve) => setTimeout(resolve, 30))

beforeEach(async () => {
  await tick()
  window.history.replaceState(null, '', '/a')
  slide.paths.clear()
  slide.waiting = null
  window.addEventListener('popstate', handleOverlayPop)
})
afterEach(async () => {
  cleanup()
  await tick()
  window.removeEventListener('popstate', handleOverlayPop)
})

describe('a page change while an overlay is open', () => {
  it('goes on at once when no overlay is open', async () => {
    renderApp()

    await userEvent.click(screen.getByRole('button', { name: 'Go' }))

    expect(await screen.findByText('Page B')).toBeInTheDocument()
    expect(where()).toBe('/b#1/0')
  })

  it('drops the overlay\'s step first, so the new page is the next step after the old one', async () => {
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: 'Open overlay' }))
    await screen.findByText('Overlay A0')
    expect(where()).toBe('/a#0/1')
    const length = window.history.length

    await userEvent.click(screen.getByRole('button', { name: 'Go' }))

    expect(await screen.findByText('Page B')).toBeInTheDocument()
    // One step for the new page, none left for the overlay.
    expect(where()).toBe('/b#1/0')
    expect(window.history.length).toBe(length)
    expect(openOverlayCount()).toBe(0)
  })

  it('drops the steps of several overlays', async () => {
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: 'Open overlay' }))
    await userEvent.click(screen.getByRole('button', { name: 'Open overlay' }))
    expect(where()).toBe('/a#0/2')

    await userEvent.click(screen.getByRole('button', { name: 'Go' }))

    expect(await screen.findByText('Page B')).toBeInTheDocument()
    expect(where()).toBe('/b#1/0')
  })

  it('returns to the page just before by going back in the history, as without an overlay (ADR-059)', async () => {
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))
    await screen.findByText('Page B')
    await userEvent.click(screen.getByRole('button', { name: 'Open overlay' }))
    await screen.findByText('Overlay B0')
    expect(where()).toBe('/b#1/1')

    await userEvent.click(screen.getByRole('button', { name: 'Go' }))

    await waitFor(() => expect(screen.getByText('Page A')).toBeInTheDocument())
    expect(where()).toBe('/a#0/0')
    // The browser's Back from here leaves the app's pages, not to B again.
    expect(window.history.state?.idx).toBe(0)
  })

  it('goes on anyway when the history does not answer', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      renderApp()
      await act(async () => {
        screen.getByRole('button', { name: 'Open overlay' }).click()
      })
      vi.spyOn(window.history, 'go').mockImplementation(() => {})

      await act(async () => {
        screen.getByRole('button', { name: 'Go' }).click()
        await vi.advanceTimersByTimeAsync(200)
      })

      expect(screen.getByText('Page B')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
