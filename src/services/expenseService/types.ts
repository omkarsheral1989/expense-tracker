import type { SplitMethod } from '../../db/types.ts'
import type { CATEGORY_GROUPS } from './constants.ts'

/** A group of categories, such as 'food'. */
export type CategoryGroupKey = (typeof CATEGORY_GROUPS)[number]['key']

/** One category's stable key, such as 'food.dining_out'. */
export type CategoryKey = (typeof CATEGORY_GROUPS)[number]['categories'][number]['key']

/** A category as the app shows it. */
export type Category = {
  key: CategoryKey
  /** Its own name ("Dining out"); "Other" repeats across groups. */
  label: string
  group: CategoryGroupKey
  /** The group's name ("Food and drink"). */
  groupLabel: string
}

/**
 * How an expense is divided, as the user entered it: the method and, per
 * member (by person id), the number entered for them (see `computeShares`).
 * Members left out count as 0.
 */
export type SplitInput = {
  method: SplitMethod
  values: Readonly<Record<string, number>>
}

/** Every member's part of an expense, or why the split cannot be used. */
export type SplitResult =
  | { ok: true; shares: ShareAmounts[] }
  | { ok: false; message: string }

/** What the add-expense form sends. */
export type CreateExpenseInput = {
  description: string
  category: string
  /** In minor units of `currency`; null when the amount field is empty. */
  amountMinor: number | null
  /** An ISO 4217 code such as 'INR'. */
  currency: string
  /** The day of the expense, 'YYYY-MM-DD'. */
  date: string
  notes: string
  /** The person id of the member who paid. */
  paidBy: string
  split: SplitInput
}

/** The fields of the form a problem can be attached to. */
export type CreateExpenseField = keyof CreateExpenseInput

/** One message per field, shown beside that field. */
export type CreateExpenseErrors = Partial<Record<CreateExpenseField, string>>

export type CreateExpenseResult =
  | { ok: true; expenseId: string }
  | { ok: false; errors: CreateExpenseErrors }

/** Who an expense's payer is, as the list names them. */
export type ExpensePayer = {
  personId: string
  email: string
  name: string | null
  isYou: boolean
}

/** One row of a group's list of expenses, seen by one user. */
export type ExpenseListItem = {
  id: string
  description: string
  category: string
  amountMinor: number
  currency: string
  /** 'YYYY-MM-DD'. */
  date: string
  /** Null only for an expense whose shares record no payment (not expected). */
  payer: ExpensePayer | null
  /** What the user paid towards it, in minor units. */
  yourPaidMinor: number
  /** What the user's own share of it is, in minor units. */
  yourOwedMinor: number
  /** Whether the user paid or has a share. */
  involved: boolean
}

/** One person's part in a new expense. */
export type ShareAmounts = {
  personId: string
  paidMinor: number
  owedMinor: number
  inputValue: number | null
}

/** What the user and one other member owe each other in one currency. */
export type PersonBalance = {
  personId: string
  email: string
  name: string | null
  currency: string
  /** Positive: they owe the user. Negative: the user owes them. Never zero. */
  amountMinor: number
}

/** The user's overall balance in a group in one currency. */
export type CurrencyBalance = {
  currency: string
  /** Positive: the user is owed this. Negative: the user owes it. Never zero. */
  amountMinor: number
}

/** One member's part in an expense, for its details page. */
export type ExpenseShareDetails = {
  personId: string
  email: string
  name: string | null
  isYou: boolean
  paidMinor: number
  owedMinor: number
}

/** Everything the details page shows about one expense. */
export type ExpenseDetails = {
  id: string
  groupId: string
  description: string
  category: string
  amountMinor: number
  currency: string
  /** 'YYYY-MM-DD'. */
  date: string
  notes: string | null
  method: SplitMethod
  /** Who added it. */
  createdBy: { email: string; name: string | null; isYou: boolean }
  /** The user first, then the others A to Z; only those who paid or owe something. */
  shares: ExpenseShareDetails[]
}
