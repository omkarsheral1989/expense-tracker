import type { KnownGroup } from '../group/types.ts'
import type { PaymentMethod } from '../../services/accountService/types.ts'
import type { ExpenseDetails, ExpenseListItem, ExpensePayer } from '../../services/expenseService/types.ts'

/** A person as the list names them. */
export type KnownPerson = Pick<ExpensePayer, 'email' | 'name' | 'isYou'>

/**
 * What the group's expense list already knows about an expense, handed to the
 * expense page through the router's state when a row is opened, so the page
 * can show it while the rest loads (ADR-053, ADR-054). A payment also carries
 * who paid whom, and a deleted expense who deleted it and when.
 */
export type KnownExpense = Pick<ExpenseListItem, 'id' | 'description' | 'category' | 'amountMinor' | 'currency' | 'date'> & {
  groupId: string
  /** Who paid, for a payment (its title says who paid whom). */
  payer?: KnownPerson
  /** Who received the money, for a payment. */
  recipient?: KnownPerson
  /** Who deleted it and when, for a deleted expense. */
  deleted?: { by: KnownPerson; at: Date }
}

/** The router state the group's list gives the expense page. */
export type ExpensePageState = { expense: KnownExpense }

/** An expense as the page reads it: its details, and the payment method this device has for it (private, ADR-061). */
export type ExpenseWithPayment = ExpenseDetails & {
  paymentMethod: PaymentMethod | null
  /** The group the expense is in, for the row above its History when the page was not opened from the group's list. */
  group: KnownGroup
}
