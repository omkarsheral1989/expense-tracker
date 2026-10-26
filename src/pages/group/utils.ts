import type { QueryClient } from '@tanstack/react-query'
import { getDb } from '../../db/client.ts'
import { GROUP_TYPES } from '../../db/constants.ts'
import { prefetchCachedData } from '../../hooks/useCachedData'
import { expenseService } from '../../services/expenseService'
import { EXPENSE_PAGE_SIZE } from '../../services/expenseService/constants.ts'
import { groupService } from '../../services/groupService'
import { syncService } from '../../services/syncService'
import { useSyncStore } from '../../stores/useSyncStore'
import type { KnownGroup } from './types.ts'

/** The name of the group page's remembered data (`useCachedData`'s `page`). */
export const GROUP_PAGE = 'group'

/** The key of one group page's data for one user; a finished sync (`dataVersion`) makes a new one. */
export const groupPageKey = (userId: string, groupId: string, dataVersion: number) => `${userId}:${groupId}:${dataVersion}`

/** What the group page shows, with the first `limit` expenses; null when the user cannot see the group. */
export async function loadGroupPage(userId: string, groupId: string, limit: number) {
  const db = await getDb()
  const group = await groupService.getGroup(db, userId, groupId)
  if (!group) return null
  return {
    group,
    expenses: await expenseService.listExpensesPage(db, userId, groupId, { limit: Math.max(EXPENSE_PAGE_SIZE, limit) }),
    balances: await expenseService.groupBalances(db, userId, groupId),
    syncedIds: await syncService.syncedMembers(db, groupId),
  }
}

/**
 * Reads the group page's data again after a change made on a page that goes back to it (a payment, an expense, the group's
 * details), and waits for it. A change makes the app forget what the group page remembered (ADR-051), so without this it would
 * come back with its loader, and the loader turning into the page would end the transition back at once (PRD 5.16).
 */
export function refreshGroupPage(client: QueryClient, userId: string, groupId: string) {
  const key = groupPageKey(userId, groupId, useSyncStore.getState().dataVersion)
  return prefetchCachedData(client, () => loadGroupPage(userId, groupId, EXPENSE_PAGE_SIZE), GROUP_PAGE, key).catch(() => undefined)
}

/**
 * The group the page was opened with (`location.state`), when it is one for
 * this page: the same id and every field the band shows. Anything else, such as
 * a direct link or a state from another page, gives null and the page loads as before.
 */
export function knownGroupFrom(state: unknown, groupId: string): KnownGroup | null {
  const group = (state as { group?: Partial<KnownGroup> } | null)?.group
  if (
    !group ||
    group.id !== groupId ||
    typeof group.name !== 'string' ||
    typeof group.defaultCurrency !== 'string' ||
    typeof group.memberCount !== 'number' ||
    !(GROUP_TYPES as readonly unknown[]).includes(group.type)
  ) {
    return null
  }
  return { id: group.id, name: group.name, type: group.type as KnownGroup['type'], defaultCurrency: group.defaultCurrency, memberCount: group.memberCount }
}
