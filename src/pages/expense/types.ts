import type { ExpenseListItem } from '../../services/expenseService/types.ts'

/**
 * What the group's expense list already knows about an expense, handed to the
 * expense page through the router's state when a row is opened, so the page
 * can show it while the rest loads (ADR-053). Not for a payment or a deleted
 * expense, whose pages read differently.
 */
export type KnownExpense = Pick<ExpenseListItem, 'id' | 'description' | 'category' | 'amountMinor' | 'currency' | 'date'> & {
  groupId: string
}

/** The router state the group's list gives the expense page. */
export type ExpensePageState = { expense: KnownExpense }
