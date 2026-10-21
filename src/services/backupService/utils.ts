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
