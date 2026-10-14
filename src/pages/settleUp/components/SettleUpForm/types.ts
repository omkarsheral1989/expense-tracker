/** What the settle-up form holds. */
export type FormValues = {
  /** The person id of the member who paid. */
  payerId: string
  /** The person id of the member who received the money; undefined until chosen. */
  recipientId?: string
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
  /** Receipt photos chosen on the device, in order; kept in the photo store on save. */
  receipts: File[]
}
