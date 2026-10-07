import type { ColorScheme } from '../../../../hooks/useColorScheme.ts'

/**
 * Color of the warning icon in the install card, as CSS colors, keyed by the
 * device's color setting. The keys are the two values `useColorScheme()`
 * returns, so the card looks its color up with `WARNING_ICON_COLOR[scheme]`.
 *
 * The default warning amber clashes with the teal card, so light mode uses a
 * deeper orange, and dark mode a lighter one because the card is dark there.
 */
export const WARNING_ICON_COLOR: Record<ColorScheme, string> = {
  light: '#d46b08',
  dark: '#ffa940',
}
