import type { AccountKind } from '../db/types.ts'

/** The colored tile behind an account's icon: a bank account is teal, a credit card deep purple. Every kind must have an entry. */
export const ACCOUNT_KIND_COLORS: Record<AccountKind, string> = {
  bank: '#0c8599',
  card: '#7048e8',
}
