import { theme } from 'antd'
import { useColorScheme, type ColorScheme } from '../../hooks/useColorScheme'

/** How much of the tint color is mixed into the page's own background; more in dark mode, where a little color hardly shows on near-black. */
const TINT_PERCENT: Record<ColorScheme, number> = { light: 10, dark: 20 }

type Props = {
  /** The color to wash the page with; undefined leaves the page's own background. */
  color: string | undefined
}

/**
 * A faint wash of one color over the whole page, behind the content. It fades
 * over 400 ms when the color changes.
 */
export function TintedPageBackground({ color }: Props) {
  const { token } = theme.useToken()
  const scheme = useColorScheme()

  return (
    <div
      aria-hidden="true"
      // Fades in place when a group opens from the list, and back (PRD 5.16).
      data-page-tint
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -1,
        pointerEvents: 'none',
        backgroundColor: `color-mix(in srgb, ${color ?? token.colorBgLayout} ${TINT_PERCENT[scheme]}%, ${token.colorBgLayout})`,
        transition: 'background-color 400ms ease',
      }}
    />
  )
}
