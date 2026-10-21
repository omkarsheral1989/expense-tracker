import type { ExpenseChange, ExpenseEventKind, SplitMethod } from '../../db/types.ts'
import type { ReceiptInput } from '../photoService/types.ts'
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
  /** Receipt photos already kept in the photo store, in order (at most 10). */
  receipts: ReceiptInput[]
}

/** What the settle-up form sends: one member paid another, outside the app. */
export type CreateSettlementInput = {
  /** The person id of the member who paid; null or empty until chosen. */
  payerId: string
  /** The person id of the member who received the money; empty until chosen. */
  recipientId: string
  /** In minor units of `currency`; null when the amount field is empty. */
  amountMinor: number | null
  /** An ISO 4217 code such as 'INR'. */
  currency: string
  /** The day of the payment, 'YYYY-MM-DD'. */
  date: string
  notes: string
  /** Receipt photos already kept in the photo store, in order (at most 10). */
  receipts: ReceiptInput[]
}

export type CreateSettlementField = keyof CreateSettlementInput

/** One message per field, shown beside that field. */
export type CreateSettlementErrors = Partial<Record<CreateSettlementField, string>>

export type CreateSettlementResult =
  | { ok: true; expenseId: string }
  | { ok: false; errors: CreateSettlementErrors }

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
  email: string | null
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
  /** Who received the money; only present on a settlement. */
  recipient?: ExpensePayer
  /** What the user paid towards it, in minor units. */
  yourPaidMinor: number
  /** What the user's own share of it is, in minor units. */
  yourOwedMinor: number
  /** Whether the user paid or has a share. */
  involved: boolean
  /** Who deleted it and when; only present on a deleted expense, which the list still shows as a line. */
  deleted?: { by: ExpensePayer; at: Date }
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
  email: string | null
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
  email: string | null
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
  createdBy: { email: string | null; name: string | null; isYou: boolean }
  /** The user first, then the others A to Z; only those who paid or owe something. */
  shares: ExpenseShareDetails[]
  /** Its receipt photos, in order; the pictures are in the photo store under these ids. */
  receipts: { id: string; mimeType: string }[]
  /** Who saved the latest edit and when; null for an expense that was never edited. */
  lastEdit: ExpenseLastEdit | null
  /** When it was added. */
  createdAt: Date
  /** Who deleted it and when; null for an expense that was not deleted. A deleted one is shown read-only. */
  deleted: { by: ExpensePerson; at: Date } | null
  /** Everything that happened to it, newest first: added, edited, deleted and restored. */
  history: ExpenseHistoryEntry[]
  /**
   * Everyone an entry of the history refers to (who paid, who was in a split),
   * by person id, so that no screen has to look anyone up.
   */
  people: Record<string, ExpensePerson>
}

/** A person as the details page names them. */
export type ExpensePerson = { email: string | null; name: string | null; isYou: boolean }

/** One event of an expense: what happened, who did it, when, and for an edit what it changed. */
export type ExpenseHistoryEntry = {
  /** The event's id, which names this version of the expense. */
  id: string
  kind: ExpenseEventKind
  by: ExpensePerson
  at: Date
  /** What an edit or a reversion changed; empty for the other kinds. */
  changes: ExpenseChange[]
  /** The expense's currency before an edit, to write the old cost in; its own currency for the other kinds. */
  currencyBefore: string
  /** For a 'reverted' entry: when the version it put back was made. */
  restoredFromAt?: Date
}

/** Who saved an expense's latest edit, and when. */
export type ExpenseLastEdit = {
  by: ExpensePerson
  at: Date
}

/** What the edit-expense form needs: an expense as it was saved, in the form's own terms. */
export type ExpenseToEdit = {
  id: string
  description: string
  category: string
  amountMinor: number
  currency: string
  /** 'YYYY-MM-DD'. */
  date: string
  notes: string | null
  /** The person id of the member who paid. */
  paidBy: string
  split: SplitInput
  /** Its receipt photos, in order, as they were stored. */
  receipts: ReceiptInput[]
}

/** What the edit-expense form sends: the same as a new expense. */
export type UpdateExpenseInput = CreateExpenseInput

export type UpdateExpenseResult =
  /** `changed` is false when nothing differed, so nothing was written. */
  | { ok: true; changed: boolean }
  | { ok: false; errors: CreateExpenseErrors }
  /** The expense cannot be edited by this user: unknown, deleted, a payment, another group's, or a group they are not in. */
  | { ok: false; notFound: true }

export type DeleteExpenseResult =
  | { ok: true }
  /** The user cannot delete it: unknown, malformed, already deleted, another group's, or a group they are not in. */
  | { ok: false; notFound: true }

export type RestoreExpenseResult =
  | { ok: true }
  /** The user cannot see it: unknown, malformed, another group's, or a group they are not in. */
  | { ok: false; notFound: true }
  /** It is not deleted (for example someone else restored it a moment ago). */
  | { ok: false; notDeleted: true }

/** The expense as it was right after one event of its history, for the version page. */
export type ExpenseVersion = {
  groupId: string
  expenseId: string
  /** The event: what happened, who did it, when, and what it changed. */
  event: ExpenseHistoryEntry
  /** The expense as it was right after the event. */
  version: {
    description: string
    category: string
    amountMinor: number
    currency: string
    /** 'YYYY-MM-DD'. */
    date: string
    notes: string | null
    method: SplitMethod
    /** The viewer first, then the others A to Z; only those who paid or owed something. */
    shares: ExpenseShareDetails[]
    /** Its receipt photos, in order. */
    receipts: { id: string; mimeType: string }[]
  }
  /** Everyone the event's changes refer to, by person id. */
  people: Record<string, ExpensePerson>
  /** The version equals the expense as it is now, so there is nothing to go back to. */
  isCurrent: boolean
  /** The expense is deleted now: it has to be restored first. */
  expenseDeleted: boolean
  /** The expense is a payment between members, which cannot be edited. */
  isPayment: boolean
}

export type RestoreVersionResult =
  | { ok: true }
  /** The user cannot do this: unknown or malformed id, an event of another expense, another group's, not a member, or a payment. */
  | { ok: false; notFound: true }
  /** The expense is deleted: restore it first. */
  | { ok: false; expenseDeleted: true }
  /** The version equals the expense as it is now. */
  | { ok: false; alreadyCurrent: true }
