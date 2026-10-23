import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { AsyncState } from '../useAsyncData/types.ts'
import { PAGE_QUERY_ROOT } from './constants.ts'

/**
 * `useAsyncData` for pages that only show data (ADR-051): the same states and
 * the same `retry`, but the last result for a `key` is remembered while the app
 * is open. Coming back to a page shows what it showed before at once (`ready`)
 * and reads the data again behind it, updating the screen if it changed; only
 * the first visit starts at `loading`.
 *
 * `page` names the page, so two pages can never share what they remembered
 * even when their keys look alike. `key` names what is loaded, as for `useAsyncData`: everything `load` depends
 * on, the user's id included, so one user never sees another's data. With
 * `keepPrevious`, a new key keeps showing the earlier data until the new
 * arrives.
 */
export function useCachedData<T>(
  load: () => Promise<T>,
  page: string,
  key: string,
  { keepPrevious = false }: { keepPrevious?: boolean } = {},
) {
  const query = useQuery({
    queryKey: [PAGE_QUERY_ROOT, page, key],
    queryFn: load,
    placeholderData: keepPrevious ? keepPreviousData : undefined,
  })

  const state: AsyncState<T> =
    query.status === 'success'
      ? { status: 'ready', data: query.data }
      : query.status === 'error' && !query.isFetching
        ? { status: 'error', error: query.error instanceof Error ? query.error : new Error(String(query.error)) }
        : { status: 'loading' }

  return { state, retry: () => void query.refetch({ cancelRefetch: false }) }
}
