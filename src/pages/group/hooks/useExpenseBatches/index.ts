import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { PAGE_QUERY_ROOT } from '../../../../hooks/useCachedData/constants.ts'
import type { ExpenseCursor, ExpenseListItem, ExpensePage } from '../../../../services/expenseService/types.ts'

type State = {
  /** The page the later batches follow; a new one (a read again) starts them over. */
  base: ExpensePage | null
  rows: ExpenseListItem[]
  next: ExpenseCursor | null
  loading: boolean
  failed: boolean
}

/** What is remembered of the later batches while the user is on another page: the rows and where they end. */
type Remembered = Pick<State, 'base' | 'rows' | 'next'>

const EMPTY: Omit<State, 'base' | 'next'> = { rows: [], loading: false, failed: false }

/**
 * The group's expenses as the page shows them (ADR-058): the batch it read when
 * it opened (`base`), followed by the batches read since as the user scrolled.
 * `loadMore` reads the next one; a read that is running is not started again,
 * and a failed one keeps the rows and says so (`failed`) until it is tried again.
 * When the page reads again (`base` is a new object) the later batches start
 * over, since that read already holds as many rows as were shown.
 *
 * The later batches are remembered with the page's other data (ADR-051) under
 * `cacheKey`, so coming back to the group shows as many rows as when the user
 * left it, and the page returns to where it was scrolled. A change to the data
 * forgets them, as it forgets the page's own data.
 */
export function useExpenseBatches(base: ExpensePage | null, readNext: (after: ExpenseCursor) => Promise<ExpensePage>, cacheKey: string) {
  const client = useQueryClient()
  const queryKey = [PAGE_QUERY_ROOT, 'groupBatches', cacheKey]
  const [state, setState] = useState<State>(() => {
    const remembered = client.getQueryData<Remembered>(queryKey)
    if (remembered && remembered.base === base) return { ...EMPTY, ...remembered }
    return { ...EMPTY, base, next: base?.next ?? null }
  })

  // A new base: forget the batches that followed the old one.
  if (state.base !== base) setState({ ...EMPTY, base, next: base?.next ?? null })

  const { rows, next, loading, failed } = state.base === base ? state : { ...EMPTY, next: base?.next ?? null }

  // Remember them for the next visit.
  useEffect(() => {
    if (state.base) client.setQueryData<Remembered>([PAGE_QUERY_ROOT, 'groupBatches', cacheKey], { base: state.base, rows: state.rows, next: state.next })
  }, [client, cacheKey, state.base, state.rows, state.next])

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
