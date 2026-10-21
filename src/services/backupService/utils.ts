import type { BackupRows } from './types.ts'

/** Whether `row` is a newer version than `other`: changed later, or at the same moment by the larger person id (ADR-010). */
export function isNewer(
  row: { updatedAt: Date; updatedBy: string },
  other: { updatedAt: Date; updatedBy: string },
): boolean {
  const difference = row.updatedAt.getTime() - other.updatedAt.getTime()
  return difference > 0 || (difference === 0 && row.updatedBy > other.updatedBy)
}

/**
 * The same data written as JSON with every id in `renamed` replaced by its new
 * one, wherever it occurs (columns, and people inside history snapshots). A
 * UUID never occurs by chance, so replacing it in the text is safe. The result
 * is plain JSON: parse it with the schema again.
 */
export function renameIds(data: unknown, renamed: ReadonlyMap<string, string>): unknown {
  let text = JSON.stringify(data)
  for (const [from, to] of renamed) text = text.replaceAll(from, to)
  return JSON.parse(text)
}


const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/** Every id that occurs anywhere in `data`, lower-cased (columns, and people inside history snapshots). */
export function idsIn(data: unknown): Set<string> {
  return new Set((JSON.stringify(data).match(UUID_PATTERN) ?? []).map((id) => id.toLowerCase()))
}

/**
 * Only the rows of one group (ADR-044): the group itself, its memberships and
 * expenses, those expenses' shares, photos and events, and the people any of
 * them names. A member's file is untrusted, so whatever else it holds (other
 * groups, people the group never names) is left out.
 */
export function rowsOfGroup(rows: BackupRows, groupId: string): BackupRows {
  const expenses = rows.expenses.filter((expense) => expense.groupId === groupId)
  const expenseIds = new Set(expenses.map((expense) => expense.id))
  const ofGroup = {
    groups: rows.groups.filter((group) => group.id === groupId),
    groupMembers: rows.groupMembers.filter((member) => member.groupId === groupId),
    expenses,
    expenseShares: rows.expenseShares.filter((share) => expenseIds.has(share.expenseId)),
    expensePhotos: rows.expensePhotos.filter((photo) => expenseIds.has(photo.expenseId)),
    expenseEvents: rows.expenseEvents.filter((event) => event.groupId === groupId && expenseIds.has(event.expenseId)),
  }
  const named = idsIn(ofGroup)
  return { people: rows.people.filter((person) => named.has(person.id.toLowerCase())), ...ofGroup }
}
