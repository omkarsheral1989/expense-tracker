/** One entry of a currency picker. */
export type CurrencyOption = {
  /** The ISO 4217 code, such as 'INR'. */
  value: string
  /** Code, name and symbol, such as 'INR – Indian Rupee (₹)'. Searched by the picker. */
  label: string
}
