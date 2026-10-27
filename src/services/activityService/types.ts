import type { ExpenseHistoryEntry, ExpensePerson } from '../expenseService/types.ts'

/** A person as an Activity row names them: the History's person plus their Google picture (ADR-046). */
export type ActivityPerson = ExpensePerson & { picture: string | null }

/** One event of an expense or payment in one of the user's groups. */
export type ActivityItem = {
  /** The event's id, which names the version it opens. */
  id: string
  /** What happened, who did it, when and what it changed, as the History writes it. */
  entry: ExpenseHistoryEntry
  by: ActivityPerson
  groupId: string
  groupName: string
  expenseId: string
  /** The expense right after the event. */
  description: string
  category: string
  amountMinor: number
  currency: string
  /** For a payment between members: who paid whom. */
  payment: { payer: ExpensePerson; recipient: ExpensePerson } | null
  /** Everyone the event's changes refer to, by person id. */
  people: Record<string, ExpensePerson>
  /** When it reached this device through a sync; null for the user's own actions. */
  arrivedAt: Date | null
}

/** Where the next batch starts: just after this event, newest first. The time is the database's text, to the microsecond. */
export type ActivityCursor = { occurredAt: string; id: string }

export type ActivityPage = {
  items: ActivityItem[]
  /** The cursor for the next batch, or null when there is nothing more. */
  next: ActivityCursor | null
}

export type UnreadState = {
  /** When the user last left the Activity page on this device; null if never. */
  seenAt: Date | null
  /** Another member's event reached this device after that time. */
  hasUnread: boolean
}
