// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router'
import { slide } from '../../../hooks/useAppNavigate/utils.ts'
import { PAGE_FADE_MS, PAGE_TRANSITION_MS } from '../../../theme/transition.ts'
import { stubReducedMotion } from '../../../testing/viewTransition.ts'
import { PageTransitions } from '../index.tsx'

function Link({ to, replace }: { to: string; replace?: boolean }) {
  const navigate = useNavigate()
  return <button onClick={() => navigate(to, { replace })}>{replace ? 'Replace' : 'Go'}</button>
}

function renderApp() {
  render(
    <div id="root">
      <MemoryRouter initialEntries={['/start']}>
        <PageTransitions />
        <Routes>
          <Route path="/start" element={<Link to="/next" />} />
          <Route path="/next" element={<Link to="/start" replace />} />
        </Routes>
      </MemoryRouter>
    </div>,
  )
}

let animate: ReturnType<typeof vi.fn>
beforeEach(() => {
  animate = vi.fn()
  HTMLElement.prototype.animate = animate as unknown as typeof HTMLElement.prototype.animate
})
afterEach(() => {
  cleanup()
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate
  slide.waiting = null
  document.documentElement.style.removeProperty('--page-transition-ms')
})

describe('PageTransitions and the history entry the app is on', () => {
  it('remembers the router\'s key of the page on screen, which tells an overlay\'s step (same key) from a page change', async () => {
    renderApp()
    const first = slide.key

    await userEvent.click(screen.getByRole('button', { name: 'Go' }))

    expect(first).toBe('default')
    expect(slide.key).not.toBe('default')
    expect(slide.key).toMatch(/\w+/)
  })
})

describe('PageTransitions', () => {
  it('shows the first screen at once, with no fade', () => {
    renderApp()

    expect(animate).not.toHaveBeenCalled()
  })

  it('fades the new page in over the fade time when a page change is not a slide (the browser Back, a replaced page, no View Transitions)', async () => {
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))

    expect(animate).toHaveBeenCalledTimes(1)
    expect(animate).toHaveBeenCalledWith([{ opacity: 0 }, { opacity: 1 }], { duration: PAGE_FADE_MS, easing: 'ease-out' })
    expect(document.getElementById('root')).not.toBeNull()
  })

  it('fades a page that replaces the current one', async () => {
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))
    animate.mockClear()
    await userEvent.click(screen.getByRole('button', { name: 'Replace' }))

    expect(animate).toHaveBeenCalledTimes(1)
  })

  it('lets the slide that is waiting for the new page start, and does not fade on top of it', async () => {
    renderApp()
    const resolved = vi.fn()
    slide.waiting = resolved
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))

    expect(resolved).toHaveBeenCalledTimes(1)
    expect(slide.waiting).toBeNull()
    expect(animate).not.toHaveBeenCalled()
  })

  it('does not fade when the user asked for less motion', async () => {
    const undo = stubReducedMotion(true)
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))

    expect(animate).not.toHaveBeenCalled()
    undo()
  })

  it('tells the CSS how long a slide lasts', () => {
    renderApp()

    expect(document.documentElement.style.getPropertyValue('--page-transition-ms')).toBe(`${PAGE_TRANSITION_MS}ms`)
  })
})
