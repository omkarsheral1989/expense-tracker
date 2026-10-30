import type { QueryClient } from '@tanstack/react-query'
import { getDb } from '../../db/client.ts'
import { prefetchCachedData } from '../../hooks/useCachedData'
import { expenseService } from '../../services/expenseService'
import { groupService } from '../../services/groupService'
import { totalsService } from '../../services/totalsService'
import { useSyncStore } from '../../stores/useSyncStore'

/** The name of the home page's remembered data (`useCachedData`'s `page`). */
export const HOME_PAGE = 'home'

/** The key of one user's home page; a finished sync (`dataVersion`) makes a new one. */
export const homeKey = (userId: string, dataVersion: number) => `${userId}:${dataVersion}`

/** What the home page shows: the user's groups, their balances, and what a group of one has spent. */
export async function loadHome(userId: string) {
  const db = await getDb()
  return {
    groups: await groupService.listGroups(db, userId),
    balances: await expenseService.balancesByGroup(db, userId),
    // What a group of one shows instead of a balance (PRD 5.2).
    spent: await totalsService.spentByGroup(db, userId),
  }
}

/**
 * Reads the home page's data again after a change made on a page that goes back to it (deleting a group), and waits for it. A change
 * makes the app forget what the home page remembered (ADR-051), so without this it would come back with its loader.
 */
export function refreshHomePage(client: QueryClient, userId: string) {
  return prefetchCachedData(client, () => loadHome(userId), HOME_PAGE, homeKey(userId, useSyncStore.getState().dataVersion))
}
