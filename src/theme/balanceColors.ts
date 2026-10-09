import type { ColorScheme } from '../hooks/useColorScheme'

/** Money coming back to the user: "you lent", "Priya owes you", "you are owed". */
export const OWED_TO_YOU_COLOR: Record<ColorScheme, string> = {
  light: '#2f9e44',
  dark: '#51cf66',
}

/** Money the user owes: "you borrowed", "You owe Priya", "you owe". */
export const YOU_OWE_COLOR: Record<ColorScheme, string> = {
  light: '#e8590c',
  dark: '#ff922b',
}
