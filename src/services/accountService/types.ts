import type { AccountKind, SpendTargetPeriod } from '../../db/types.ts'

/**
 * What the accounts dialog sends. The card-only fields are left out (or null)
 * for a bank account. Amounts are in minor units of `currency`.
 */
export type AccountInput = {
  kind: AccountKind
  name: string
  currency: string
  statementDay?: number | null
  creditLimitMinor?: number | null
  spendTargetMinor?: number | null
  spendTargetPeriod?: SpendTargetPeriod | null
}

/** The fields of the dialog a problem can be attached to. */
export type AccountField = Exclude<keyof AccountInput, 'kind'>

/** One message per field, shown beside that field. */
export type AccountErrors = Partial<Record<AccountField, string>>

export type SaveAccountResult =
  | { ok: true; accountId: string }
  | { ok: false; errors: AccountErrors }
  /** The account does not exist (or is deleted). */
  | { ok: false; notFound: true }

/** A stretch of days, both ends included, as 'YYYY-MM-DD'. */
export type Period = { start: string; end: string }

/** What a credit card spent in its current periods (PRD 4.10). */
export type AccountSpend = {
  /** The current statement cycle (a month): the figure shown against the credit limit. */
  cycle: Period
  cycleSpentMinor: number
  /** The current period of the spend target; null when the card has no target. */
  target: (Period & { period: SpendTargetPeriod }) | null
  targetSpentMinor: number
  /** Expenses in another currency with no charged amount in the widest of the two periods: they cannot be counted. */
  skipped: number
}

/** One account on the accounts page. */
export type AccountSummary = {
  id: string
  kind: AccountKind
  name: string
  currency: string
  statementDay: number | null
  creditLimitMinor: number | null
  spendTargetMinor: number | null
  spendTargetPeriod: SpendTargetPeriod | null
  /** Some expense uses the account, so its currency can no longer change. */
  inUse: boolean
  /** Only for a credit card. */
  spend: AccountSpend | null
}

/** The payment method of an expense, as the details page and the edit form show it. */
export type PaymentMethod = {
  accountId: string
  accountName: string
  accountKind: AccountKind
  accountCurrency: string
  /** What the account was debited, in its currency; null when not entered. */
  chargedMinor: number | null
}

/** What the expense form sends: the account chosen and, for another currency, what it was debited. */
export type PaymentMethodInput = {
  accountId: string
  chargedMinor?: number | null
}

export type SetPaymentMethodResult =
  /** `changed` is false when the expense already had exactly this. */
  | { ok: true; changed: boolean }
  | { ok: false; errors: { chargedMinor?: string } }
  /** The expense or the account does not exist, or the user did not pay the expense. */
  | { ok: false; notFound: true }
