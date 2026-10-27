/**
 * The colors of the members in the totals page's donuts and lists (PRD 5.20): each member has one, taken in order (the user first,
 * then the others A to Z), the same in both donuts. Distinct from each other and readable on the light and the dark page; a
 * group with more members than colors starts over.
 */
export const MEMBER_COLORS: readonly string[] = [
  '#0d9488', // teal, the app's own color
  '#f97316', // orange
  '#6366f1', // indigo
  '#e11d48', // rose
  '#0ea5e9', // sky
  '#a855f7', // purple
  '#eab308', // amber
  '#22c55e', // green
  '#64748b', // slate
  '#ec4899', // pink
]

/** The color of the member at this place in the order. */
export function memberColor(index: number): string {
  return MEMBER_COLORS[index % MEMBER_COLORS.length]
}
