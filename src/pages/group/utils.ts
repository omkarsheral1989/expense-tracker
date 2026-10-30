import type { QueryClient } from '@tanstack/react-query'
import { getDb } from '../../db/client.ts'
import { ROUTES } from '../../routes.ts'
import { GROUP_TYPES } from '../../db/constants.ts'
import { prefetchCachedData } from '../../hooks/useCachedData'
import { balancesService } from '../../services/balancesService'
import { userBalancesFrom } from '../../services/balancesService/utils.ts'
import { expenseService } from '../../services/expenseService'
import { EXPENSE_PAGE_SIZE } from '../../services/expenseService/constants.ts'
import { groupService } from '../../services/groupService'
import { syncService } from '../../services/syncService'
import { totalsService } from '../../services/totalsService'
import { useSyncStore } from '../../stores/useSyncStore'
import type { KnownGroup } from './types.ts'

/** The name of the group page's remembered data (`useCachedData`'s `page`). */
export const GROUP_PAGE = 'group'

/** The key of one group page's data for one user; a finished sync (`dataVersion`) makes a new one. */
export const groupPageKey = (userId: string, groupId: string, dataVersion: number) => `${userId}:${groupId}:${dataVersion}`

/** What the group page shows, with the first `limit` expenses; null when the user cannot see the group. */
export async function loadGroupPage(userId: string, groupId: string, limit: number) {
  const db = await getDb()
  // A deleted group opens read-only here (PRD 5.23); the form pages get no group for it.
  const group = await groupService.getGroup(db, userId, groupId, { includeDeleted: true })
  if (!group) return null
  const everyone = await balancesService.groupBalances(db, userId, groupId)
  return {
    group,
    expenses: await expenseService.listExpensesPage(db, userId, groupId, { limit: Math.max(EXPENSE_PAGE_SIZE, limit) }),
    // Simplified, like the balances page (PRD 5.4, 5.21).
    balances: everyone ? userBalancesFrom(everyone, userId) : [],
    // What is still owed, for the Delete group dialog (PRD 5.22); null when the group is settled up.
    unsettled: everyone && everyone.currencies.length > 0 ? everyone : null,
    syncedIds: await syncService.syncedMembers(db, groupId),
    // Whether the Totals pill has anything to open (PRD 5.20).
    hasSpending: await totalsService.hasSpending(db, userId, groupId),
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
 * Where the group page's Back arrow leads when the page was opened from one of the group's own pages (`location.state.backTo`, set
 * by an expense's group card), else null for the home page. Only an address inside this group, or the Deleted groups page, is accepted.
 */
export function backToFrom(state: unknown, groupId: string): string | null {
  const backTo = (state as { backTo?: unknown } | null)?.backTo
  return typeof backTo === 'string' && (backTo.startsWith(`/groups/${groupId}/`) || backTo === ROUTES.deletedGroups) ? backTo : null
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
