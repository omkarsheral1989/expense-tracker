// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stubIntersectionObserver } from '../../../../../testing/intersectionObserver.ts'
import { renderPage } from '../../../../../testing/render.tsx'
import type { ExpenseListItem } from '../../../../../services/expenseService/types.ts'
import { ExpenseList } from '../index.tsx'

const expense = (id: string, date = '2026-10-08'): ExpenseListItem => ({
  id,
  description: `Expense ${id}`,
  category: 'general',
  amountMinor: 1000,
  currency: 'GBP',
  date,
  payer: null,
  yourPaidMinor: 0,
  yourOwedMinor: 0,
  involved: false,
})

let observers: ReturnType<typeof stubIntersectionObserver>
beforeEach(() => {
  observers = stubIntersectionObserver()
})
afterEach(() => {
  cleanup()
  observers.restore()
})

function renderList(props: Partial<Parameters<typeof ExpenseList>[0]> = {}) {
  const onLoadMore = vi.fn()
  renderPage(
    <ExpenseList expenses={[expense('1'), expense('2')]} groupId="g1" hasMore loadingMore={false} loadMoreFailed={false} onLoadMore={onLoadMore} {...props} />,
  )
  return { onLoadMore }
}

describe('ExpenseList paging', () => {
  it('watches the end of the list when there is more, a screen before it', () => {
    renderList()

    expect(screen.getByTestId('list-end')).toBeInTheDocument()
    expect(observers.active()).toHaveLength(1)
    expect(observers.active()[0].options).toEqual({ rootMargin: '600px' })
  })

  it('asks for the next batch when the end comes into view', () => {
    const { onLoadMore } = renderList()
    expect(onLoadMore).not.toHaveBeenCalled()

    observers.reach()

    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('does not watch, or draw an end, when there is no more', () => {
    renderList({ hasMore: false })

    expect(observers.active()).toHaveLength(0)
    expect(screen.queryByTestId('list-end')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Loading more expenses')).not.toBeInTheDocument()
  })

  it('shows a small spinner under the list while the next batch is read, and does not watch meanwhile', () => {
    renderList({ loadingMore: true })

    expect(screen.getByLabelText('Loading more expenses')).toBeInTheDocument()
    expect(observers.active()).toHaveLength(0)
  })

  it('ends in "Couldn\'t load more." with Try again after a failure, which asks again, and does not watch', async () => {
    const { onLoadMore } = renderList({ loadMoreFailed: true })

    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load more.")
    // The failure row takes the watched row's place, so scrolling does not retry by itself.
    expect(screen.queryByTestId('list-end')).not.toBeInTheDocument()
    expect(observers.active()).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('watches again after each batch, so a list still short of the view keeps asking', async () => {
    const onLoadMore = vi.fn()
    function Harness() {
      const [rows, setRows] = useState([expense('1'), expense('2')])
      return (
        <>
          <button onClick={() => setRows((current) => [...current, expense(String(current.length + 1))])}>Add a row</button>
          <ExpenseList expenses={rows} groupId="g1" hasMore loadingMore={false} loadMoreFailed={false} onLoadMore={onLoadMore} />
        </>
      )
    }
    renderPage(<Harness />)
    observers.reach()
    expect(onLoadMore).toHaveBeenCalledTimes(1)
    const before = observers.watchers.length

    await userEvent.click(screen.getByRole('button', { name: 'Add a row' }))

    expect(observers.watchers.length).toBeGreaterThan(before)
    observers.reach()
    expect(onLoadMore).toHaveBeenCalledTimes(2)
  })

  it('does nothing where the browser has no IntersectionObserver', () => {
    observers.restore()
    delete (globalThis as Partial<typeof globalThis>).IntersectionObserver

    expect(() => renderList()).not.toThrow()
    expect(screen.getByText('Expense 1')).toBeInTheDocument()
  })

  it('draws a header for a month only once, over all the rows given', () => {
    renderList({ expenses: [expense('1', '2026-10-20'), expense('2', '2026-10-02'), expense('3', '2026-09-30')], hasMore: false })

    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(['October 2026', 'September 2026'])
  })
})
