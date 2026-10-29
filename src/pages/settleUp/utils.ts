import { ROUTES } from '../../routes.ts'
import { getDb } from '../../db/client.ts'
import { expenseService } from '../../services/expenseService'
import { groupService } from '../../services/groupService'

/** The name of the settle-up page's remembered data (`useCachedData`'s `page`). */
export const SETTLE_UP_PAGE = 'settleUp'

/** The key of one group's settle-up data for one user. */
export const settleUpKey = (userId: string, groupId: string) => `${userId}:${groupId}`

/** What the form opens with; null when the user cannot see the group (gone, deleted, or not a member). */
export async function loadSettleUp(userId: string, groupId: string) {
  const db = await getDb()
  const group = await groupService.getGroup(db, userId, groupId)
  if (!group) return null
  return { group, recentCurrencies: await expenseService.recentCurrencies(db, userId) }
}

/** Where Settle up's Back leads: the balances page when it opened this one (its router state says so), else the group page. */
export function settleBackTo(state: unknown, groupId: string): string {
  return (state as { from?: unknown } | null)?.from === 'balances' ? ROUTES.balances(groupId) : ROUTES.group(groupId)
}
