// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from '../../../components/QueryProvider/client.ts'
import { useBatches } from '../index.ts'

afterEach(cleanup)

type Batch = { items: string[]; next: number | null }

/** One cache shared by the renders of a test, as the app has one for all its pages. */
function setUp() {
  const client = createQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { wrapper }
}

/** A promise settled from outside, to hold a read open. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => ((resolve = done), (reject = fail)))
  return { promise, resolve, reject }
}

const base: Batch = { items: ['a', 'b'], next: 2 }

describe('useBatches', () => {
  it('starts with the batch it was given and says whether there is more', () => {
    const { wrapper } = setUp()

    const { result } = renderHook(() => useBatches(base, vi.fn(), 'list', 'key'), { wrapper })

    expect(result.current.items).toEqual(['a', 'b'])
    expect(result.current.hasMore).toBe(true)
  })

  it('has nothing before its first batch', () => {
    const { wrapper } = setUp()

    const { result } = renderHook(() => useBatches(null, vi.fn(), 'list', 'key'), { wrapper })

    expect(result.current).toMatchObject({ items: [], hasMore: false })
  })

  it('reads the next batch from the cursor, adds it, and ends when there is no cursor left', async () => {
    const { wrapper } = setUp()
    const readNext = vi.fn(async () => ({ items: ['c'], next: null }) as Batch)
    const { result } = renderHook(() => useBatches(base, readNext, 'list', 'key'), { wrapper })

    act(() => result.current.loadMore())

    await waitFor(() => expect(result.current.items).toEqual(['a', 'b', 'c']))
    expect(readNext).toHaveBeenCalledWith(2)
    expect(result.current.hasMore).toBe(false)
    act(() => result.current.loadMore())
    expect(readNext).toHaveBeenCalledTimes(1)
  })

  it('does not start a read while one is running', async () => {
    const { wrapper } = setUp()
    const held = deferred<Batch>()
    const readNext = vi.fn(() => held.promise)
    const { result } = renderHook(() => useBatches(base, readNext, 'list', 'key'), { wrapper })

    act(() => result.current.loadMore())
    expect(result.current.loading).toBe(true)
    act(() => result.current.loadMore())
    act(() => result.current.loadMore())
    await act(async () => held.resolve({ items: ['c'], next: null }))

    expect(readNext).toHaveBeenCalledTimes(1)
    expect(result.current.loading).toBe(false)
  })

  it('keeps the rows read so far when a read fails, says so, and reads again on request', async () => {
    const { wrapper } = setUp()
    const readNext = vi
      .fn()
      .mockResolvedValueOnce({ items: ['c'], next: 3 })
      .mockRejectedValueOnce(new Error('broken'))
      .mockResolvedValue({ items: ['d'], next: null })
    const { result } = renderHook(() => useBatches(base, readNext, 'list', 'key'), { wrapper })
    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.items).toEqual(['a', 'b', 'c']))

    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(result.current.items).toEqual(['a', 'b', 'c'])
    expect(result.current.hasMore).toBe(true)

    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.items).toEqual(['a', 'b', 'c', 'd']))
    expect(result.current.failed).toBe(false)
    expect(readNext).toHaveBeenLastCalledWith(3)
  })

  it('starts the later batches over when the page reads again (a new first batch)', async () => {
    const { wrapper } = setUp()
    const readNext = vi.fn(async () => ({ items: ['c'], next: null }) as Batch)
    const { result, rerender } = renderHook(({ first }) => useBatches(first, readNext, 'list', 'key'), { wrapper, initialProps: { first: base } })
    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.items).toHaveLength(3))

    const again: Batch = { items: ['a', 'b', 'c', 'd'], next: 4 }
    rerender({ first: again })

    expect(result.current.items).toEqual(['a', 'b', 'c', 'd'])
    expect(result.current.hasMore).toBe(true)
  })

  it('remembers the later batches for the next visit, per name and key', async () => {
    const { wrapper } = setUp()
    const readNext = vi.fn(async () => ({ items: ['c'], next: null }) as Batch)
    const first = renderHook(() => useBatches(base, readNext, 'list', 'key'), { wrapper })
    act(() => first.result.current.loadMore())
    await waitFor(() => expect(first.result.current.items).toHaveLength(3))
    first.unmount()

    const back = renderHook(() => useBatches(base, readNext, 'list', 'key'), { wrapper })
    const elsewhere = renderHook(() => useBatches(base, readNext, 'list', 'other'), { wrapper })
    const another = renderHook(() => useBatches(base, readNext, 'other', 'key'), { wrapper })

    expect(back.result.current.items).toEqual(['a', 'b', 'c'])
    expect(elsewhere.result.current.items).toEqual(['a', 'b'])
    expect(another.result.current.items).toEqual(['a', 'b'])
  })
})
