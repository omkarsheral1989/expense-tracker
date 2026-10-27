import { getDb } from '../../db/client.ts'
import { groupService } from '../../services/groupService'
import { totalsService } from '../../services/totalsService'
import type { TotalsRow } from '../../services/totalsService/types.ts'
import { memberColor } from '../../theme/memberColors.ts'

/** The name of the totals page's remembered data (`useCachedData`'s `page`). */
export const TOTALS_PAGE = 'totals'

/** The key of one group's totals for one user. */
export const totalsKey = (userId: string, groupId: string) => `${userId}:${groupId}`

/** What the totals page shows; null when the user cannot see the group. */
export async function loadTotals(userId: string, groupId: string) {
  return totalsService.groupTotals(await getDb(), userId, groupId)
}

/** How a member is named in the lists: "You", or their first name (the part of their email before the "@" when no name is known). */
export function rowName(row: Pick<TotalsRow, 'isYou' | 'name' | 'email'>): string {
  return row.isYou ? 'You' : groupService.shortName(row)
}

/**
 * The color of each member, in the order the colors are given out: the user first, then the others A to Z by name; the same in both
 * donuts and their lists (PRD 5.20).
 */
export function colorsOf(rows: TotalsRow[]): Map<string, string> {
  const label = (row: TotalsRow) => groupService.displayName(row).toLowerCase()
  const ordered = rows.toSorted((a, b) => Number(b.isYou) - Number(a.isYou) || label(a).localeCompare(label(b)) || a.personId.localeCompare(b.personId))
  return new Map(ordered.map((row, index) => [row.personId, memberColor(index)]))
}
