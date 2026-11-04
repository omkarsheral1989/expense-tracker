import { useColorScheme } from '../../hooks/useColorScheme'
import { shadeGradient } from './utils.ts'

type Props = {
  /** Width of the centered content column in px; the shade covers what is outside it, with a gap between. */
  columnWidth: number
}

/**
 * A dark veil over the screen on both sides of the content column, so on a wide
 * screen the content stands out from the margins. Nothing shows when the screen
 * is no wider than the column. It lets clicks through.
 */
export function SideShade({ columnWidth }: Props) {
  const scheme = useColorScheme()

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
        background: shadeGradient(columnWidth, scheme),
      }}
    />
  )
}
