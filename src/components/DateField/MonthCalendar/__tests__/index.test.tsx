// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dateService } from '../../../../services/dateService'
import { MonthCalendar } from '../index.tsx'

function renderCalendar(selected = '2026-10-14') {
  const onSelect = vi.fn()
  const view = render(<MonthCalendar selected={dateService.fromDay(selected)} onSelect={onSelect} />)
  const grid = view.container.firstElementChild as HTMLElement
  return { onSelect, grid, container: view.container }
}

/** A day of the month is on screen once its cell is in the grid. */
const showing = (container: HTMLElement, day: string) => container.querySelector(`td[data-day="${day}"]`) !== null

/**
 * Ends the slide to another month. The old month leaves the page when its
 * caption's animation ends, which jsdom never plays, so the test ends it.
 */
function finishSlide(container: HTMLElement) {
  container.querySelectorAll('[data-animated-caption]').forEach((caption) => {
    caption.dispatchEvent(new Event('animationend'))
  })
}

function swipe(grid: HTMLElement, from: [number, number], to: [number, number]) {
  fireEvent.touchStart(grid, { touches: [{ clientX: from[0], clientY: from[1] }] })
  fireEvent.touchEnd(grid, { changedTouches: [{ clientX: to[0], clientY: to[1] }] })
}

describe('MonthCalendar', () => {
  afterEach(cleanup)

  it('starts on the month of the chosen day', () => {
    const { container } = renderCalendar()
    expect(showing(container, '2026-10-14')).toBe(true)
    expect(showing(container, '2026-11-15')).toBe(false)
  })

  it('moves a month with the arrows, across a year end, without choosing a day', async () => {
    const user = userEvent.setup()
    const { container, onSelect } = renderCalendar('2026-12-10')

    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(showing(container, '2027-01-15')).toBe(true)
    expect(screen.getByTitle('2027')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(showing(container, '2026-11-15')).toBe(true)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('slides to the other month: the old one slides out, hidden from screen readers, then is gone', async () => {
    const user = userEvent.setup()
    const { container } = renderCalendar()
    const oldMonthStillThere = () => container.querySelector('[aria-hidden="true"] td[data-day="2026-10-14"]') !== null

    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(showing(container, '2026-11-15')).toBe(true)
    expect(oldMonthStillThere()).toBe(true)

    finishSlide(container)
    expect(oldMonthStillThere()).toBe(false)
    expect(showing(container, '2026-10-14')).toBe(false)
  })

  it('moves a month with a sideways swipe: left for next, right for previous', () => {
    const { container, grid, onSelect } = renderCalendar()

    swipe(grid, [300, 400], [100, 400])
    expect(showing(container, '2026-11-15')).toBe(true)

    swipe(grid, [100, 400], [300, 400])
    swipe(grid, [100, 400], [300, 400])
    expect(showing(container, '2026-09-15')).toBe(true)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('does not move for a short swipe or an up-and-down scroll', () => {
    const { container, grid } = renderCalendar()

    swipe(grid, [300, 400], [270, 400])
    swipe(grid, [300, 300], [200, 600])

    expect(showing(container, '2026-10-14')).toBe(true)
  })

  it('moves a month with the wheel, and keeps the page from scrolling', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
    const { container, grid } = renderCalendar()

    const down = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })
    fireEvent(grid, down)
    expect(down.defaultPrevented).toBe(true)
    expect(showing(container, '2026-11-15')).toBe(true)

    vi.useRealTimers()
  })

  it('moves only one month for one flick of the wheel', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
    const { container, grid } = renderCalendar()

    for (let tick = 0; tick < 5; tick++) {
      fireEvent(grid, new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }))
    }
    expect(showing(container, '2026-11-15')).toBe(true)
    expect(showing(container, '2026-12-15')).toBe(false)

    // After a pause a new flick moves it again.
    vi.setSystemTime(new Date(2026, 9, 14, 12, 0, 1))
    fireEvent(grid, new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }))
    expect(showing(container, '2026-12-15')).toBe(true)

    vi.useRealTimers()
  })

  it('lights the chosen day only in its own month, and the right day when coming back to it', async () => {
    const user = userEvent.setup()
    const { container } = renderCalendar('2026-10-31')
    const lit = () => container.querySelector('td.rdp-selected')?.getAttribute('data-day') ?? null

    expect(lit()).toBe('2026-10-31')

    // September has no 31st, so moving there must not make 30 Sept look chosen.
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    finishSlide(container)
    expect(showing(container, '2026-09-15')).toBe(true)
    expect(lit()).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Next month' }))
    finishSlide(container)
    expect(lit()).toBe('2026-10-31')
  })

  it('chooses a day only when its date is tapped', async () => {
    const user = userEvent.setup()
    const { container, onSelect } = renderCalendar()

    await user.click(screen.getByRole('button', { name: 'Next month' }))
    await user.click(container.querySelector('td[data-day="2026-11-20"] button') as HTMLElement)

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(dateService.toDay(onSelect.mock.calls[0][0])).toBe('2026-11-20')
  })
})
