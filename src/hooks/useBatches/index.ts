import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { PAGE_QUERY_ROOT } from '../useCachedData/constants.ts'

/** A batch of rows and where the next one starts (null at the end). */
type Batch<Item, Cursor> = { items: Item[]; next: Cursor | null }

type State<Item, Cursor> = {
  /** The batch the later ones follow; a new one (a read again) starts them over. */
  base: Batch<Item, Cursor> | null
  rows: Item[]
  next: Cursor | null
  loading: boolean
  failed: boolean
}

/** What is remembered of the later batches while the user is on another page: the rows and where they end. */
type Remembered<Item, Cursor> = Pick<State<Item, Cursor>, 'base' | 'rows' | 'next'>

/**
 * A list read in batches, as a page shows it (ADR-058, ADR-062): the batch it read
 * when it opened (`base`), followed by the batches read since as the user scrolled.
 * `loadMore` reads the next one; a read that is running is not started again, and a
 * failed one keeps the rows and says so (`failed`) until it is tried again. When the
 * page reads again (`base` is a new object) the later batches start over. They are
 * remembered with the page's other data (ADR-051) under `name` and `cacheKey`, so
 * coming back shows as many rows as when the user left.
 */
export function useBatches<Item, Cursor>(
  base: Batch<Item, Cursor> | null,
  readNext: (after: Cursor) => Promise<Batch<Item, Cursor>>,
  name: string,
  cacheKey: string,
) {
  const client = useQueryClient()
  const queryKey = [PAGE_QUERY_ROOT, name, cacheKey]
  const empty = { rows: [] as Item[], loading: false, failed: false }
  const [state, setState] = useState<State<Item, Cursor>>(() => {
    const remembered = client.getQueryData<Remembered<Item, Cursor>>(queryKey)
    return remembered ? { ...empty, ...remembered } : { ...empty, base, next: base?.next ?? null }
  })

  // A new base: forget the batches that followed the old one.
  if (state.base !== base) setState({ ...empty, base, next: base?.next ?? null })

  const { rows, next, loading, failed } = state.base === base ? state : { ...empty, next: base?.next ?? null }

  // Remember them for the next visit.
  useEffect(() => {
    if (state.base) client.setQueryData<Remembered<Item, Cursor>>([PAGE_QUERY_ROOT, name, cacheKey], { base: state.base, rows: state.rows, next: state.next })
  }, [client, name, cacheKey, state.base, state.rows, state.next])

  const loadMore = useCallback(() => {
    if (!next || loading) return
    setState((current) => ({ ...current, loading: true, failed: false }))
    readNext(next).then(
      (page) =>
        setState((current) =>
          current.base === base ? { ...current, rows: [...current.rows, ...page.items], next: page.next, loading: false } : current,
        ),
      () => setState((current) => (current.base === base ? { ...current, loading: false, failed: true } : current)),
    )
  }, [base, next, loading, readNext])

  return {
    items: base ? [...base.items, ...rows] : [],
    hasMore: next !== null,
    loading,
    failed,
    loadMore,
  }
}
