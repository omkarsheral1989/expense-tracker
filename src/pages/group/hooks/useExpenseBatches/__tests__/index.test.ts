// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseCursor, ExpenseListItem, ExpensePage } from '../../../../../services/expenseService/types.ts'
import { useExpenseBatches } from '../index.ts'

const item = (id: string) => ({ id }) as ExpenseListItem
const cursor = (id: string): ExpenseCursor => ({ date: '2026-10-08', createdAt: '2026-10-08 10:00:00+00', id })
const page = (ids: string[], next: string | null): ExpensePage => ({ items: ids.map(item), next: next ? cursor(next) : null })

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => ((resolve = done), (reject = fail)))
  return { promise, resolve, reject }
}

const ids = (items: ExpenseListItem[]) => items.map((it) => it.id)

describe('useExpenseBatches', () => {
  it('starts with the batch the page read, and says whether more follow', () => {
    const base = page(['a', 'b'], 'b')
    const { result } = renderHook(() => useExpenseBatches(base, vi.fn()))

    expect(ids(result.current.items)).toEqual(['a', 'b'])
    expect(result.current.hasMore).toBe(true)
    expect(result.current.loading).toBe(false)
    expect(result.current.failed).toBe(false)
  })

  it('has nothing, and no more, before the page has read anything', () => {
    const { result } = renderHook(() => useExpenseBatches(null, vi.fn()))

    expect(result.current.items).toEqual([])
    expect(result.current.hasMore).toBe(false)
  })

  it('has no more when the first batch has no next', () => {
    const base = page(['a'], null)
    const { result } = renderHook(() => useExpenseBatches(base, vi.fn()))
    expect(result.current.hasMore).toBe(false)
  })

  it('reads the next batch after the last cursor and adds it, until there is no next', async () => {
    const base = page(['a', 'b'], 'b')
    const readNext = vi.fn(async (after: ExpenseCursor) => (after.id === 'b' ? page(['c', 'd'], 'd') : page(['e'], null)))
    const { result } = renderHook(() => useExpenseBatches(base, readNext))

    act(() => result.current.loadMore())
    await waitFor(() => expect(ids(result.current.items)).toEqual(['a', 'b', 'c', 'd']))
    expect(readNext).toHaveBeenLastCalledWith(cursor('b'))
    expect(result.current.hasMore).toBe(true)

    act(() => result.current.loadMore())
    await waitFor(() => expect(ids(result.current.items)).toEqual(['a', 'b', 'c', 'd', 'e']))
    expect(readNext).toHaveBeenLastCalledWith(cursor('d'))
    expect(result.current.hasMore).toBe(false)
    expect(readNext).toHaveBeenCalledTimes(2)
  })

  it('does nothing when there is no more to read', () => {
    const readNext = vi.fn()
    const base = page(['a'], null)
    const { result } = renderHook(() => useExpenseBatches(base, readNext))

    act(() => result.current.loadMore())

    expect(readNext).not.toHaveBeenCalled()
  })

  it('shows that it is loading, and does not start a second read while one is running', async () => {
    const running = deferred<ExpensePage>()
    const readNext = vi.fn(() => running.promise)
    const base = page(['a'], 'a')
    const { result } = renderHook(() => useExpenseBatches(base, readNext))

    act(() => result.current.loadMore())
    expect(result.current.loading).toBe(true)
    act(() => result.current.loadMore())
    act(() => result.current.loadMore())
    expect(readNext).toHaveBeenCalledTimes(1)

    await act(async () => running.resolve(page(['b'], null)))
    expect(result.current.loading).toBe(false)
    expect(ids(result.current.items)).toEqual(['a', 'b'])
  })

  it('keeps the rows when a read fails, says so, and tries again from the same place', async () => {
    const readNext = vi.fn<(after: ExpenseCursor) => Promise<ExpensePage>>().mockRejectedValueOnce(new Error('database is closed')).mockResolvedValueOnce(page(['b'], null))
    const base = page(['a'], 'a')
    const { result } = renderHook(() => useExpenseBatches(base, readNext))

    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(ids(result.current.items)).toEqual(['a'])
    expect(result.current.loading).toBe(false)
    expect(result.current.hasMore).toBe(true)

    act(() => result.current.loadMore())
    await waitFor(() => expect(ids(result.current.items)).toEqual(['a', 'b']))
    expect(result.current.failed).toBe(false)
    expect(readNext).toHaveBeenNthCalledWith(2, cursor('a'))
  })

  it('starts the later batches over when the page reads again, since that read holds them already', async () => {
    const readNext = vi.fn(async () => page(['c'], null))
    const first = page(['a', 'b'], 'b')
    const again = page(['a', 'b', 'c'], null)
    const { result, rerender } = renderHook(({ base }) => useExpenseBatches(base, readNext), { initialProps: { base: first } })
    act(() => result.current.loadMore())
    await waitFor(() => expect(ids(result.current.items)).toEqual(['a', 'b', 'c']))

    // The page read again: as many rows as were shown, so no duplicate of "c".
    rerender({ base: again })

    expect(ids(result.current.items)).toEqual(['a', 'b', 'c'])
    expect(result.current.hasMore).toBe(false)
  })

  it('ignores a batch that arrives after the page has read again', async () => {
    const late = deferred<ExpensePage>()
    const first = page(['a'], 'a')
    const again = page(['a', 'z'], null)
    const { result, rerender } = renderHook(({ base }) => useExpenseBatches(base, () => late.promise), { initialProps: { base: first } })
    act(() => result.current.loadMore())

    rerender({ base: again })
    await act(async () => late.resolve(page(['b'], null)))

    expect(ids(result.current.items)).toEqual(['a', 'z'])
    expect(result.current.loading).toBe(false)
  })
})
