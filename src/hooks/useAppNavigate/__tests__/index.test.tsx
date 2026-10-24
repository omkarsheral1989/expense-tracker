// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { PageTransitions } from '../../../components/PageTransitions'
import { CurrentPath } from '../../../testing/CurrentPath.tsx'
import { stubReducedMotion, stubViewTransition } from '../../../testing/viewTransition.ts'
import { useAppNavigate } from '../index.ts'
import type { NavDirection } from '../utils.ts'

function Page({ label, go }: { label: string; go?: Parameters<ReturnType<typeof useAppNavigate>> }) {
  const navigate = useAppNavigate()
  return <button onClick={() => go && navigate(...go)}>{label}</button>
}

function renderApp(go: Parameters<ReturnType<typeof useAppNavigate>>) {
  return render(
    <MemoryRouter initialEntries={['/start']}>
      <PageTransitions />
      <Routes>
        <Route path="/start" element={<Page label="Go" go={go} />} />
        <Route path="/next" element={<div>Next page</div>} />
      </Routes>
      <CurrentPath />
    </MemoryRouter>,
  )
}

let restoreTransition: () => void
let transitions: ReturnType<typeof stubViewTransition>
beforeEach(() => {
  transitions = stubViewTransition()
  restoreTransition = transitions.restore
})
afterEach(() => {
  cleanup()
  restoreTransition()
})

describe('useAppNavigate', () => {
  it('goes to the page and slides forward by default', async () => {
    renderApp(['/next'])
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))

    expect(await screen.findByText('Next page')).toBeInTheDocument()
    expect(transitions.started).toEqual(['forward'])
  })

  it.each<NavDirection>(['forward', 'back'])('slides %s when asked', async (direction) => {
    renderApp(['/next', { direction }])
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))

    await screen.findByText('Next page')
    expect(transitions.started).toEqual([direction])
  })

  it('waits for the new page before the transition can start moving it, and clears the direction when done', async () => {
    renderApp(['/next', { direction: 'back' }])
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))

    await screen.findByText('Next page')
    await waitFor(() => expect(document.documentElement.dataset.nav).toBeUndefined())
  })

  it('passes the router state on to the new page', async () => {
    function Show() {
      return <div>State: {(useLocation().state as { group: { id: string } }).group.id}</div>
    }
    render(
      <MemoryRouter initialEntries={['/start']}>
        <PageTransitions />
        <Routes>
          <Route path="/start" element={<Page label="Go" go={['/next', { state: { group: { id: 'g1' } } }]} />} />
          <Route path="/next" element={<Show />} />
        </Routes>
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))

    expect(await screen.findByText('State: g1')).toBeInTheDocument()
    expect(transitions.started).toEqual(['forward'])
  })

  it('does not slide a page that only replaces the current one', async () => {
    renderApp(['/next', { replace: true }])
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))

    expect(await screen.findByText('Next page')).toBeInTheDocument()
    expect(transitions.started).toEqual([])
  })

  it('goes to the page without a slide where the browser has no View Transitions', async () => {
    transitions.restore()
    expect(document.startViewTransition).toBeUndefined()
    renderApp(['/next', { direction: 'back' }])
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))

    expect(await screen.findByText('Next page')).toBeInTheDocument()
    expect(document.documentElement.dataset.nav).toBeUndefined()
  })

  it('does not slide when the user asked for less motion', async () => {
    const undo = stubReducedMotion(true)
    renderApp(['/next'])
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))

    expect(await screen.findByText('Next page')).toBeInTheDocument()
    expect(transitions.started).toEqual([])
    undo()
  })
})
