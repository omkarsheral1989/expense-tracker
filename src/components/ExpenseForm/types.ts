import type { SplitMethod } from '../../db/types.ts'
import type { ReceiptInput } from '../../services/photoService/types.ts'

/**
 * Who paid and how the expense is split, as the form holds it: the payer's
 * person id, the method, and the number entered for each member by person id
 * (see `computeShares` in the expense service).
 */
export type SplitValue = {
  paidBy: string
  method: SplitMethod
  values: Record<string, number>
}

/** What the add-expense form holds. */
export type FormValues = {
  description: string
  /** A category key such as 'food.dining_out'. */
  category: string
  /** Whether the user picked the category themselves: the description then no longer picks it (PRD 5.5). */
  categoryChosen?: boolean
  /**
   * The amount as typed, cleaned to digits and one "." ('1234.5'); the field
   * shows it with separators. Empty until the user types.
   */
  amount: string
  /** An ISO 4217 code such as 'INR'. */
  currency: string
  /** 'YYYY-MM-DD'. */
  date: string
  notes: string
  split: SplitValue
  /** The id of the account the user paid with, or none (PRD 4.10). Only meaningful when the user is the payer. */
  accountId?: string | null
  /**
   * What the account was debited, as typed in the account's currency ('8412.5'); empty when not entered.
   * Only used when the account's currency differs from the expense's.
   */
  charged?: string
  /** Receipt photos chosen on the device, in order; kept in the photo store on save. */
  receipts: File[]
  /**
   * Photos the expense already has (when editing), in order, as stored. They
   * come before the chosen ones; taking one off removes it from the expense.
   * Missing for a new expense.
   */
  keptReceipts?: ReceiptInput[]
}
