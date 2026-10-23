import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { dataChanges } from '../../db/changes.ts'
import { PAGE_QUERY_ROOT } from '../../hooks/useCachedData/constants.ts'
import { logService } from '../../services/logService'
import { useAuthStore } from '../../stores/useAuthStore'
import { createQueryClient } from './client.ts'

const log = logService.scope('cache')

/**
 * Holds what pages have read, for `useCachedData` (ADR-051), and keeps it true:
 * a change to the data refreshes the pages on screen in place and forgets what
 * pages not on screen remembered (they show the loader once, then read fresh);
 * signing in or out, or starting guest mode, forgets everything.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient)

  useEffect(() => {
    const stopChanges = dataChanges.subscribe(() => {
      log.debug('Data changed, refreshing pages')
      void client.invalidateQueries({ queryKey: [PAGE_QUERY_ROOT], type: 'active' })
      client.removeQueries({ queryKey: [PAGE_QUERY_ROOT], type: 'inactive' })
    })
    let who = identityOf(useAuthStore.getState())
    const stopAuth = useAuthStore.subscribe((state) => {
      const next = identityOf(state)
      if (next === who) return
      who = next
      log.info('Signed in or out, forgetting what pages remembered')
      client.clear()
    })
    return () => {
      stopChanges()
      stopAuth()
    }
  }, [client])

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

/** Who is using the app: the signed-in account, a guest, or nobody. */
function identityOf({ profile, guest }: ReturnType<typeof useAuthStore.getState>) {
  return profile ? `google:${profile.id}` : guest ? 'guest' : 'none'
}
