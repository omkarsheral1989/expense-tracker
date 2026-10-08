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
}
