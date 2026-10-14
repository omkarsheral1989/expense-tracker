import type { ExpenseListItem } from '../../../../services/expenseService/types.ts'

export type MonthOfExpenses = {
  /** The month as 'YYYY-MM'. */
  month: string
  expenses: ExpenseListItem[]
}

/**
 * Splits expenses that are already in order (newest day first) into one group
 * per month, keeping their order, so each month's header can sit above its rows.
 */
export function groupByMonth(expenses: ExpenseListItem[]): MonthOfExpenses[] {
  const months: MonthOfExpenses[] = []
  for (const expense of expenses) {
    const month = expense.date.slice(0, 7)
    const last = months.at(-1)
    if (last?.month === month) last.expenses.push(expense)
    else months.push({ month, expenses: [expense] })
  }
  return months
}
