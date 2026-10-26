import type { ACCOUNT_KINDS, EXPENSE_EVENT_KINDS, GROUP_TYPES, SPEND_TARGET_PERIODS, SPLIT_METHODS } from './constants.ts'

/** One of the kinds of group a user can create: 'trip', 'home', 'couple' or 'other'. */
export type GroupType = (typeof GROUP_TYPES)[number]

/** A bank account or a credit card: 'bank' or 'card'. */
export type AccountKind = (typeof ACCOUNT_KINDS)[number]

/** How often a credit card's spend target repeats: 'month' or 'quarter'. */
export type SpendTargetPeriod = (typeof SPEND_TARGET_PERIODS)[number]

/** How an expense is divided: 'equal', 'exact', 'percent', 'shares' or 'adjustment'. */
export type SplitMethod = (typeof SPLIT_METHODS)[number]

/** A photo of an expense as it was stored: its id is its key in the photo store. */
export type SnapshotPhoto = {
  id: string
  position: number
  mimeType: string
  sizeBytes: number
}

/** One person's part of an expense as it was stored. */
export type SnapshotShare = {
  personId: string
  paidMinor: number
  owedMinor: number
  inputValue: number | null
}

/**
 * An expense exactly as it was before an edit: every field, the split and the
 * list of photos (ids only; the pictures stay in the photo store).
 */
export type ExpenseSnapshot = {
  description: string
  category: string
  amountMinor: number
  currency: string
  /** 'YYYY-MM-DD'. */
  date: string
  notes: string | null
  method: SplitMethod
  shares: SnapshotShare[]
  photos: SnapshotPhoto[]
}

/** The parts of an expense an edit can change, as the history names them. */
export type ExpenseChangeField =
  | 'description'
  | 'category'
  | 'amount'
  | 'currency'
  | 'date'
  | 'notes'
  | 'paidBy'
  | 'split'
  | 'receipts'

/**
 * One thing an edit changed, with its old and new value: the field's own value
 * for most fields, the paying person's id for `paidBy`, the method and each
 * person's entered value for `split` and the photo ids added and removed for
 * `receipts`.
 */
export type ExpenseChange = {
  field: ExpenseChangeField
  from: unknown
  to: unknown
}

/** What an expense event records: 'added', 'edited', 'deleted', 'restored' or 'reverted'. */
export type ExpenseEventKind = (typeof EXPENSE_EVENT_KINDS)[number]
