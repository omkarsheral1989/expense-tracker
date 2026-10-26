import type { AccountKind } from '../../db/types.ts'

/** How each kind of account is called on screen. Every kind must have an entry. */
export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  bank: 'Bank account',
  card: 'Credit card',
}
