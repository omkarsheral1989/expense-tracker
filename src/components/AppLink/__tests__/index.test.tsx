// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { CurrentPath } from '../../../testing/CurrentPath.tsx'
import { stubViewTransition } from '../../../testing/viewTransition.ts'
import { AppLink } from '../index.tsx'

function Arrived() {
  return <div>State: {(useLocation().state as { id: string } | null)?.id ?? 'none'}</div>
}

function renderLink(link: React.ReactElement) {
  render(
    <MemoryRouter initialEntries={['/start']}>
      <Routes>
        <Route path="/start" element={link} />
        <Route path="/next" element={<Arrived />} />
      </Routes>
      <CurrentPath />
    </MemoryRouter>,
  )
}

let transitions: ReturnType<typeof stubViewTransition>
beforeEach(() => {
  transitions = stubViewTransition()
})
afterEach(() => {
  cleanup()
  transitions.restore()
})

describe('AppLink', () => {
  it('opens the page with a forward slide, and its state', async () => {
    renderLink(<AppLink to="/next" state={{ id: 'g1' }}>Open</AppLink>)
    await userEvent.click(screen.getByRole('link', { name: 'Open' }))

    expect(await screen.findByText('State: g1')).toBeInTheDocument()
    expect(transitions.started).toEqual(['forward'])
  })

  it('slides back for a link that returns to where the user came from', async () => {
    renderLink(<AppLink to="/next" direction="back">Back</AppLink>)
    await userEvent.click(screen.getByRole('link', { name: 'Back' }))

    await screen.findByText('State: none')
    expect(transitions.started).toEqual(['back'])
  })

  it('has a real address, so it can be opened in a new tab', () => {
    renderLink(<AppLink to="/next">Open</AppLink>)

    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/next')
  })

  it.each([
    ['a modifier key', { metaKey: true }],
    ['a middle click', { button: 1 }],
  ])('leaves a click with %s to the browser', (_, init) => {
    renderLink(<AppLink to="/next">Open</AppLink>)
    const notCancelled = fireEvent.click(screen.getByRole('link', { name: 'Open' }), init)

    expect(notCancelled).toBe(true)
    expect(transitions.started).toEqual([])
  })

  it('still runs the click handler it is given', async () => {
    let clicked = false
    renderLink(<AppLink to="/next" onClick={() => (clicked = true)}>Open</AppLink>)
    await userEvent.click(screen.getByRole('link', { name: 'Open' }))

    expect(clicked).toBe(true)
  })
})
