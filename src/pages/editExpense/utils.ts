import { getDb } from '../../db/client.ts'
import { accountService } from '../../services/accountService'
import { expenseService } from '../../services/expenseService'
import { groupService } from '../../services/groupService'

/** The name of the edit page's remembered data (`useCachedData`'s `page`). */
export const EDIT_EXPENSE_PAGE = 'editExpense'

/** The key of one expense's edit data for one user. */
export const editExpenseKey = (userId: string, groupId: string, expenseId: string) => `${userId}:${groupId}:${expenseId}`

/**
 * Everything the edit form opens with: the group, the expense in the form's
 * own terms and the recent currencies. Null when the user cannot edit the
 * expense (it is gone, deleted, a payment, or in a group they are not in).
 */
export async function loadExpenseToEdit(userId: string, groupId: string, expenseId: string) {
  const db = await getDb()
  const [group, expense] = await Promise.all([
    groupService.getGroup(db, userId, groupId),
    expenseService.getExpenseToEdit(db, userId, groupId, expenseId),
  ])
  if (!group || !expense) return null
  return {
    group,
    expense,
    recentCurrencies: await expenseService.recentCurrencies(db, userId),
    accounts: await accountService.listOptions(db),
    paymentMethod: await accountService.getPaymentMethod(db, expenseId),
  }
}
