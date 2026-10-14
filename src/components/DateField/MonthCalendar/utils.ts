/** How far a finger must travel sideways, in pixels, to count as a swipe. */
export const SWIPE_DISTANCE = 50

/**
 * The month change a touch gesture asks for: 1 (the next month) for a swipe
 * to the left, -1 (the previous) for a swipe to the right, 0 when it was too
 * short or went more up or down than sideways (a scroll of the sheet).
 */
export function monthChangeOfSwipe(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) <= Math.abs(dy)) return 0
  return dx < 0 ? 1 : -1
}

/**
 * The month change a wheel or trackpad scroll asks for: 1 for scrolling down
 * or right, -1 for up or left, 0 for none. The larger of the two directions wins.
 */
export function monthChangeOfWheel(deltaX: number, deltaY: number): -1 | 0 | 1 {
  const delta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY
  if (delta === 0) return 0
  return delta > 0 ? 1 : -1
}

/** The twelve month names in a language, short ("Jan" to "Dec"). */
export function shortMonthNames(locale: string): string[] {
  const format = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
  return Array.from({ length: 12 }, (_, month) => format.format(new Date(Date.UTC(2026, month, 1))))
}
