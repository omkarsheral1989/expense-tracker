import { useColorScheme, type ColorScheme } from '../../hooks/useColorScheme'

/** How dark the shade is, per color scheme (black at this opacity). */
const SHADE_OPACITY: Record<ColorScheme, number> = { light: 0.07, dark: 0.25 }

/** Clear space in px between the column's elements and the shade on each side. */
const GAP = 28

type Props = {
  /** Width of the centered content column in px; the shade covers what is outside it, with a gap of `GAP` between. */
  columnWidth: number
}

/**
 * A dark veil over the screen on both sides of the content column, so on a wide
 * screen the content stands out from the margins. Nothing shows when the screen
 * is no wider than the column. It lets clicks through.
 */
export function SideShade({ columnWidth }: Props) {
  const scheme = useColorScheme()
  const shade = `rgba(0, 0, 0, ${SHADE_OPACITY[scheme]})`
  const half = columnWidth / 2 + GAP

  return (
    <div
      aria-hidden="true"
      // Stays in place while pages slide or morph: its own picture in a page transition (src/index.css).
      data-side-shade
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1,
        pointerEvents: 'none',
        background: `linear-gradient(to right, ${shade} calc(50% - ${half}px), transparent calc(50% - ${half}px), transparent calc(50% + ${half}px), ${shade} calc(50% + ${half}px))`,
      }}
    />
  )
}
