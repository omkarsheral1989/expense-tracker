import type { ColorScheme } from '../../../../../hooks/useColorScheme'

/** The color of "you lent" and its amount: money coming back to the user. */
export const LENT_COLOR: Record<ColorScheme, string> = {
  light: '#2f9e44',
  dark: '#51cf66',
}

/** The color of "you borrowed" and its amount: money the user owes. */
export const BORROWED_COLOR: Record<ColorScheme, string> = {
  light: '#e8590c',
  dark: '#ff922b',
}
