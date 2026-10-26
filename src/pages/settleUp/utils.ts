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
