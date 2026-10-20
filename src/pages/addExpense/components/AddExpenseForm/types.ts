import type { FormValues } from '../../../../components/ExpenseForm/types.ts'

/**
 * What the form carried over when the user moved the expense to another group:
 * every field but the split (the new group has other members), and the default
 * currency of the group it came from, to tell whether the user chose the
 * currency or it was only the group's default. Passed in the router's state.
 */
export type ExpenseDraft = Omit<FormValues, 'split' | 'keptReceipts'> & {
  fromDefaultCurrency: string
}

/** The router state of the add-expense page. */
export type AddExpenseLocationState = { draft?: ExpenseDraft } | null
