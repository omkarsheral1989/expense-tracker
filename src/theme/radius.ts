/**
 * The app uses two corner radii. Small things that sit inside something else
 * (buttons, icon tiles, inputs) use `inner`; containers (cards, panels, the
 * logo tile) use `outer`. Ant Design components get the same values through
 * the theme tokens in ThemeProvider.
 */
export const RADIUS = {
  inner: 12,
  outer: 24,
} as const

/**
 * Fully rounded, for the phone-first pages' chips, pills and round buttons
 * (the group page and the add-expense page). The one deliberate exception to
 * the two radii above (ADR-030).
 */
export const PILL_RADIUS = 999
