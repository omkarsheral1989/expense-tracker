import type { SplitMethod } from '../../../../db/types.ts'

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
}
