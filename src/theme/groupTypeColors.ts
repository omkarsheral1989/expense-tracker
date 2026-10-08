import type { GroupType } from '../db/types.ts'

/**
 * The color of each kind of group, used for its icon tile and for the band at
 * the top of its page. White text and icons sit on top of it. Every type must
 * have an entry.
 */
export const GROUP_TYPE_COLORS: Record<GroupType, string> = {
  trip: '#0d9488',
  home: '#d46b08',
  couple: '#c41d7f',
  other: '#3b5bdb',
}
