import type { ExpenseListItem } from '../../../../../services/expenseService/types.ts'

/** What an expense means for the user, as the end of its row says it. */
export type ExpenseStatus =
  /** The user paid more than their share: others owe them the difference. */
  | { kind: 'lent'; amountMinor: number }
  /** The user's share is more than they paid: they owe the difference. */
  | { kind: 'borrowed'; amountMinor: number }
  /** The user paid exactly their share, for example for themselves alone. */
  | { kind: 'even' }
  /** The user neither paid nor has a share. */
  | { kind: 'notInvolved' }

export function expenseStatus(expense: ExpenseListItem): ExpenseStatus {
  if (!expense.involved) return { kind: 'notInvolved' }
  const net = expense.yourPaidMinor - expense.yourOwedMinor
  if (net > 0) return { kind: 'lent', amountMinor: net }
  if (net < 0) return { kind: 'borrowed', amountMinor: -net }
  return { kind: 'even' }
}

/** The short month and the day of a 'YYYY-MM-DD' day, for the date column: "Oct" over "8". */
export function dateParts(day: string): { month: string; day: number } {
  const [year, month, date] = day.split('-').map(Number)
  return {
    month: new Date(year, month - 1, date).toLocaleDateString('en-US', { month: 'short' }),
    day: date,
  }
}
