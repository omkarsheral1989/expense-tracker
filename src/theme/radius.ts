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
