/** The router state that opens Settle up with a payment already filled in (PRD 5.21). */
export type SettlePrefill = { payerId: string; recipientId: string; amountMinor: number; currency: string }

/** One line under a person's row, from their point of view. */
export type BalanceLine = {
  currency: string
  /** Whether this person gets money back from the other, or owes it to them. */
  kind: 'getsBack' | 'owes'
  otherId: string
  amountMinor: number
}

/** A person's total in one currency: positive when they are owed, negative when they owe. */
export type PersonTotal = { currency: string; netMinor: number }
