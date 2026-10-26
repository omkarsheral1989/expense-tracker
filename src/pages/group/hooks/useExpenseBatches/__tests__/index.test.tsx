// @vitest-environment jsdom
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseCursor, ExpenseListItem, ExpensePage } from '../../../../../services/expenseService/types.ts'
import { createQueryClient } from '../../../../../components/QueryProvider/client.ts'
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

/** The page's query cache, which remembers the later batches between visits. */
const withClient = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }

/** Renders the hook for one group, in its own cache unless one is given. */
function renderBatches<P extends { base: ExpensePage | null }>(
  use: (props: P) => ReturnType<typeof useExpenseBatches>,
  initialProps: P,
  client: QueryClient = createQueryClient(),
) {
  return renderHook(use, { initialProps, wrapper: withClient(client) })
}

describe('useExpenseBatches', () => {
  it('starts with the batch the page read, and says whether more follow', () => {
    const base = page(['a', 'b'], 'b')
    const { result } = renderBatches(({ base }) => useExpenseBatches(base, vi.fn(), 'g'), { base })

    expect(ids(result.current.items)).toEqual(['a', 'b'])
    expect(result.current.hasMore).toBe(true)
    expect(result.current.loading).toBe(false)
    expect(result.current.failed).toBe(false)
  })

  it('has nothing, and no more, before the page has read anything', () => {
    const { result } = renderBatches(({ base }) => useExpenseBatches(base, vi.fn(), 'g'), { base: null })

    expect(result.current.items).toEqual([])
    expect(result.current.hasMore).toBe(false)
  })

  it('has no more when the first batch has no next', () => {
    const base = page(['a'], null)
    const { result } = renderBatches(({ base }) => useExpenseBatches(base, vi.fn(), 'g'), { base })
    expect(result.current.hasMore).toBe(false)
  })

  it('reads the next batch after the last cursor and adds it, until there is no next', async () => {
    const base = page(['a', 'b'], 'b')
    const readNext = vi.fn(async (after: ExpenseCursor) => (after.id === 'b' ? page(['c', 'd'], 'd') : page(['e'], null)))
    const { result } = renderBatches(({ base }) => useExpenseBatches(base, readNext, 'g'), { base })

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
    const { result } = renderBatches(({ base }) => useExpenseBatches(base, readNext, 'g'), { base })

    act(() => result.current.loadMore())

    expect(readNext).not.toHaveBeenCalled()
  })

  it('shows that it is loading, and does not start a second read while one is running', async () => {
    const running = deferred<ExpensePage>()
    const readNext = vi.fn(() => running.promise)
    const base = page(['a'], 'a')
    const { result } = renderBatches(({ base }) => useExpenseBatches(base, readNext, 'g'), { base })

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
    const { result } = renderBatches(({ base }) => useExpenseBatches(base, readNext, 'g'), { base })

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
    const { result, rerender } = renderBatches(({ base }) => useExpenseBatches(base, readNext, 'g'), { base: first })
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
    const { result, rerender } = renderBatches(({ base }: { base: ExpensePage }) => useExpenseBatches(base, () => late.promise, 'g'), { base: first })
    act(() => result.current.loadMore())

    rerender({ base: again })
    await act(async () => late.resolve(page(['b'], null)))

    expect(ids(result.current.items)).toEqual(['a', 'z'])
    expect(result.current.loading).toBe(false)
  })
})

describe('useExpenseBatches, coming back to the group', () => {
  async function scrolledThrough(client: QueryClient, base: ExpensePage, key = 'g') {
    const readNext = vi.fn(async () => page(['c', 'd'], 'd'))
    const view = renderBatches(({ base: shown }: { base: ExpensePage }) => useExpenseBatches(shown, readNext, key), { base }, client)
    act(() => view.result.current.loadMore())
    await waitFor(() => expect(ids(view.result.current.items)).toEqual(['a', 'b', 'c', 'd']))
    view.unmount()
  }

  it('shows the rows read before at once, with the same place to go on from', async () => {
    const client = createQueryClient()
    const base = page(['a', 'b'], 'b')
    await scrolledThrough(client, base)

    const readNext = vi.fn(async () => page(['e'], null))
    const { result } = renderBatches(({ base: shown }: { base: ExpensePage }) => useExpenseBatches(shown, readNext, 'g'), { base }, client)

    expect(ids(result.current.items)).toEqual(['a', 'b', 'c', 'd'])
    expect(result.current.hasMore).toBe(true)
    act(() => result.current.loadMore())
    await waitFor(() => expect(ids(result.current.items)).toEqual(['a', 'b', 'c', 'd', 'e']))
    expect(readNext).toHaveBeenCalledWith(cursor('d'))
  })

  it('starts from the first batch when the page has read again meanwhile', async () => {
    const client = createQueryClient()
    await scrolledThrough(client, page(['a', 'b'], 'b'))

    const readNext = vi.fn(async () => page(['x'], null))
    const { result } = renderBatches(({ base }: { base: ExpensePage }) => useExpenseBatches(base, readNext, 'g'), { base: page(['a', 'b'], 'b') }, client)

    expect(ids(result.current.items)).toEqual(['a', 'b'])
    // And it reads on from the new read's last row.
    act(() => result.current.loadMore())
    await waitFor(() => expect(ids(result.current.items)).toEqual(['a', 'b', 'x']))
    expect(readNext).toHaveBeenCalledWith(cursor('b'))
  })

  it('keeps each group to itself', async () => {
    const client = createQueryClient()
    const base = page(['a', 'b'], 'b')
    await scrolledThrough(client, base, 'one group')

    const { result } = renderBatches(({ base: shown }: { base: ExpensePage }) => useExpenseBatches(shown, vi.fn(), 'another group'), { base }, client)

    expect(ids(result.current.items)).toEqual(['a', 'b'])
  })
})
