import type { GroupType } from '../db/types.ts'

/**
 * The color of each kind of group, used for its icon tile and for the band at
 * the top of its page. White text and icons sit on top of it. Every type must
 * have an entry.
 */
export const GROUP_TYPE_COLORS: Record<GroupType, string> = {
  trip: '#0891b2',
  home: '#d46b08',
  couple: '#c41d7f',
  other: '#364fc7',
}

/**
 * The color a page is washed with while a group type is chosen (Create group,
 * Edit group). Mixed into a near-black or near-white page, a hue like the
 * trip's cyan reads green, so it leans bluer here; the other types are
 * their own color.
 */
export const GROUP_TYPE_WASH_COLORS: Record<GroupType, string> = {
  ...GROUP_TYPE_COLORS,
  trip: '#0ea5e9',
}
