import { expenseService } from '../../services/expenseService'
import type { KnownExpense } from './types.ts'

const DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * The expense the page was opened with (`location.state`), when it is one for
 * this page: the same group and expense and every field the band shows, and
 * not a payment. Anything else, such as a direct link, gives null and the page
 * loads as before.
 */
export function knownExpenseFrom(state: unknown, groupId: string, expenseId: string): KnownExpense | null {
  const expense = (state as { expense?: Partial<KnownExpense> } | null)?.expense
  if (
    !expense ||
    expense.id !== expenseId ||
    expense.groupId !== groupId ||
    typeof expense.description !== 'string' ||
    typeof expense.category !== 'string' ||
    expense.category === expenseService.settlementCategory ||
    typeof expense.amountMinor !== 'number' ||
    typeof expense.currency !== 'string' ||
    typeof expense.date !== 'string' ||
    !DAY.test(expense.date)
  ) {
    return null
  }
  const { id, description, category, amountMinor, currency, date } = expense
  return { id, groupId, description, category, amountMinor, currency, date }
}
