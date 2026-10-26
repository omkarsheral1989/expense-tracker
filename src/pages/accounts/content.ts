import type { AccountKind, SpendTargetPeriod } from '../../db/types.ts'

/** How each kind of account is called on screen. Every kind must have an entry. */
export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  bank: 'Bank account',
  card: 'Credit card',
}

/** How a spend target's period reads in "per month" and "this month". Every period must have an entry. */
export const SPEND_TARGET_LABELS: Record<SpendTargetPeriod, { per: string; this: string }> = {
  month: { per: 'per month', this: 'this month' },
  quarter: { per: 'per quarter', this: 'this quarter' },
}
