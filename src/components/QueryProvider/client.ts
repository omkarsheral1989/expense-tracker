import { QueryClient } from '@tanstack/react-query'

/**
 * The cache of what pages have read (ADR-051). The data is on this device, so
 * queries run offline too (`networkMode: 'always'`); a failure is shown, not
 * retried behind the user's back; data is always read again when a page opens
 * (`staleTime: 0`) and kept until the app closes (`gcTime: Infinity`).
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        networkMode: 'always',
        retry: false,
        staleTime: 0,
        gcTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  })
}
