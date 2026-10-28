import { getDb } from '../../db/client.ts'
import { accountService } from '../../services/accountService'
import { expenseService } from '../../services/expenseService'
import { groupService } from '../../services/groupService'

/** The name of the add-expense page's remembered data (`useCachedData`'s `page`). */
export const ADD_EXPENSE_PAGE = 'addExpense'

/** The key of one group's add-expense data for one user. */
export const addExpenseKey = (userId: string, groupId: string) => `${userId}:${groupId}`

/** What the form opens with; null when the user cannot see the group (gone, deleted, or not a member). */
export async function loadAddExpense(userId: string, groupId: string) {
  const db = await getDb()
  const group = await groupService.getGroup(db, userId, groupId)
  if (!group) return null
  return {
    group,
    recentCurrencies: await expenseService.recentCurrencies(db, userId),
    pastChoices: await expenseService.pastCategoryChoices(db, userId),
    accounts: await accountService.listAccounts(db, userId),
    groups: await groupService.listGroups(db, userId),
  }
}
