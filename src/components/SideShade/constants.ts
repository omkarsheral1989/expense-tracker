import type { ColorScheme } from '../../hooks/useColorScheme'

/** How dark the shade is, per color scheme (black at this opacity). */
export const SHADE_OPACITY: Record<ColorScheme, number> = { light: 0.07, dark: 0.25 }

/** Clear space in px between the column's elements and the shade on each side. */
export const GAP = 28
