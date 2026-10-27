import { inArray } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import { people } from '../../db/schema.ts'
import { shownName } from '../../db/shownName.ts'
import type { ExpenseChange, ExpenseEventKind, ExpenseSnapshot } from '../../db/types.ts'
import type { ExpenseHistoryEntry, ExpensePerson } from './types.ts'

type Reader = Pick<Database, 'select'>

/** What the history shows of one event: what happened, who did it, when, and what it changed. */
export function historyEntryOf(
  event: {
    id: string
    kind: ExpenseEventKind
    occurredAt: Date
    actorId: string
    actorEmail: string | null
    actorName: string | null
    changes: ExpenseChange[]
    snapshot: ExpenseSnapshot
  },
  userId: string,
  restoredFromAt?: Date,
): ExpenseHistoryEntry {
  return {
    id: event.id,
    kind: event.kind,
    by: { email: event.actorEmail, name: event.actorName, isYou: event.actorId === userId },
    at: event.occurredAt,
    changes: event.changes,
    // What an edit changed the currency from, if it did; otherwise the one it has.
    currencyBefore: String(event.changes.find((change) => change.field === 'currency')?.from ?? event.snapshot.currency),
    ...(restoredFromAt && { restoredFromAt }),
  }
}

/**
 * Everyone the given changes refer to (who paid, who was in a split), by person
 * id, as the viewer sees them, so that no screen has to look anyone up.
 */
export async function peopleReferredBy(db: Reader, userId: string, changeLists: ExpenseChange[][]): Promise<Record<string, ExpensePerson>> {
  const referred = new Set<string>()
  for (const changes of changeLists) {
    for (const change of changes) {
      if (change.field === 'paidBy') {
        for (const id of [change.from, change.to]) if (typeof id === 'string') referred.add(id)
      } else if (change.field === 'split') {
        for (const side of [change.from, change.to]) {
          const values = (side as { values?: Record<string, number> } | null)?.values ?? {}
          for (const id of Object.keys(values)) referred.add(id)
        }
      }
    }
  }
  if (referred.size === 0) return {}
  const found = await db
    .select({ id: people.id, email: people.email, name: shownName(people) })
    .from(people)
    .where(inArray(people.id, [...referred]))
  return Object.fromEntries(found.map((person) => [person.id, { email: person.email, name: person.name, isYou: person.id === userId }]))
}
