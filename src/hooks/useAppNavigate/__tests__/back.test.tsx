// @vitest-environment jsdom
// Going back leaves the page behind out of the history, so the browser's Back does not bring it again (ADR-059).
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router'
import { PageTransitions } from '../../../components/PageTransitions'
import { stubViewTransition } from '../../../testing/viewTransition.ts'
import { useAppNavigate } from '../index.ts'
import { previousPageIs, slide, type NavDirection } from '../utils.ts'

type Go = { to: string; direction?: NavDirection; replace?: boolean }

function Page({ name, links }: { name: string; links: Record<string, Go> }) {
  const navigate = useAppNavigate()
  const location = useLocation()
  return (
    <div>
      <p>Page {name}</p>
      <p data-testid="where">{`${location.pathname}#${window.history.state?.idx}`}</p>
      {Object.entries(links).map(([label, { to, direction, replace }]) => (
        <button key={label} onClick={() => navigate(to, { direction, replace })}>
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
        <Route path="/a" element={<Page name="A" links={{ 'Open B': { to: '/b' }, 'Open C': { to: '/c' } }} />} />
        <Route path="/b" element={<Page name="B" links={{ 'Open C': { to: '/c' }, 'Back to A': { to: '/a', direction: 'back' }, 'Replace with C': { to: '/c', replace: true } }} />} />
        <Route path="/c" element={<Page name="C" links={{ 'Back to A': { to: '/a', direction: 'back' }, 'Back to B': { to: '/b', direction: 'back' } }} />} />
      </Routes>
    </BrowserRouter>,
  )
}

const where = () => screen.getByTestId('where').textContent

beforeEach(() => {
  window.history.replaceState(null, '', '/a')
  slide.paths.clear()
  slide.waiting = null
})
afterEach(cleanup)

describe('going back through useAppNavigate', () => {
  it('goes back in the history when the page before is the one asked for, so the page left is not in the way of the next Back', async () => {
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: 'Open B' }))
    await screen.findByText('Page B')
    expect(where()).toBe('/b#1')

    await userEvent.click(screen.getByRole('button', { name: 'Back to A' }))

    await screen.findByText('Page A')
    // Back to position 0, not a new position 2 with B still behind it.
    expect(where()).toBe('/a#0')
  })

  it('does not bring the page left back with the browser Back, only the one before', async () => {
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: 'Open B' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Open C' }))
    await screen.findByText('Page C')
    await userEvent.click(screen.getByRole('button', { name: 'Back to B' }))
    await screen.findByText('Page B')
    expect(where()).toBe('/b#1')

    window.history.back()

    await screen.findByText('Page A')
    expect(where()).toBe('/a#0')
  })

  it('replaces the page when the one before is not the one asked for, so the page left is still out of the history', async () => {
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: 'Open B' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Open C' }))
    await screen.findByText('Page C')
    expect(where()).toBe('/c#2')

    // The page before C is B, not A: C is replaced by A.
    await userEvent.click(screen.getByRole('button', { name: 'Back to A' }))

    await screen.findByText('Page A')
    expect(where()).toBe('/a#2')
    window.history.back()
    await screen.findByText('Page B')
  })

  it('replaces the page when nothing is known of the one before it (after a reload)', async () => {
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: 'Open B' }))
    await screen.findByText('Page B')
    slide.paths.clear()

    await userEvent.click(screen.getByRole('button', { name: 'Back to A' }))

    await screen.findByText('Page A')
    expect(where()).toBe('/a#1')
  })

  it('still adds a page for a forward move, and replaces for a move that asks to', async () => {
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: 'Open B' }))
    await screen.findByText('Page B')
    expect(where()).toBe('/b#1')

    await userEvent.click(screen.getByRole('button', { name: 'Replace with C' }))

    await screen.findByText('Page C')
    expect(where()).toBe('/c#1')
  })

  it('slides back when it replaces the page by the target, and when it goes back in the history', async () => {
    const transitions = stubViewTransition()
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: 'Open B' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Open C' }))
    await screen.findByText('Page C')
    transitions.started.length = 0

    await userEvent.click(screen.getByRole('button', { name: 'Back to A' }))

    await screen.findByText('Page A')
    expect(transitions.started).toEqual(['back'])
    transitions.restore()
  })
})

describe('previousPageIs', () => {
  it('is false at the first page of the session, whatever is remembered', () => {
    slide.paths.set(-1, '/a')
    window.history.replaceState({ idx: 0 }, '', '/a')
    expect(previousPageIs('/a')).toBe(false)
  })

  it('compares the path alone, without a query or a fragment', () => {
    window.history.replaceState({ idx: 3 }, '', '/b')
    slide.paths.set(2, '/a')
    expect(previousPageIs('/a?x=1')).toBe(true)
    expect(previousPageIs('/a#top')).toBe(true)
    expect(previousPageIs('/ab')).toBe(false)
    expect(previousPageIs('/b')).toBe(false)
  })

  it('is false when the page before was never seen', () => {
    window.history.replaceState({ idx: 3 }, '', '/b')
    expect(previousPageIs('/a')).toBe(false)
  })
})
