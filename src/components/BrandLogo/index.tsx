import { Flex, theme } from 'antd'
import { RADIUS } from '../../theme/radius.ts'
import {
  INSTALLED_ICON_GRADIENT_END_COLOR,
  INSTALLED_ICON_GRADIENT_START_COLOR,
  LARGE_LOGO_SIZE,
  LOGO_GRADIENT_END_COLOR,
  ON_PRIMARY_GLYPH_SCALE,
} from './style.ts'

type Props = {
  /** Width and height of the tile in pixels. */
  size?: number
  /**
   * True on a background of the theme's primary color (the signed-in header):
   * the tile then takes the greens the installed app icon shows on an iPhone,
   * a little lighter than `public/logo.svg`, so it does not blend in. False
   * (the default) is the app icon's own gradient.
   */
  onPrimary?: boolean
}

/** The OwnLedger logo: the wallet drawn in `public/logo.svg` (the app icon) on a teal gradient tile. */
export function BrandLogo({ size = 32, onPrimary = false }: Props) {
  const { token } = theme.useToken()
  const gradientStart = onPrimary ? INSTALLED_ICON_GRADIENT_START_COLOR : token.colorPrimary
  const gradientEnd = onPrimary ? INSTALLED_ICON_GRADIENT_END_COLOR : LOGO_GRADIENT_END_COLOR

  return (
    <Flex
      align="center"
      justify="center"
      aria-hidden="true"
      style={{
        flex: 'none',
        width: size,
        height: size,
        borderRadius: size >= LARGE_LOGO_SIZE ? RADIUS.outer : RADIUS.inner,
        color: '#fff',
        background: `linear-gradient(135deg, ${gradientStart}, ${gradientEnd})`,
        boxShadow: size >= LARGE_LOGO_SIZE ? token.boxShadowSecondary : undefined,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 512 512" focusable="false">
        <g transform={onPrimary ? `translate(256 256) scale(${ON_PRIMARY_GLYPH_SCALE}) translate(-256 -256)` : undefined}>
          <g fill="none" stroke="#fff" strokeWidth="24" strokeLinecap="round" strokeLinejoin="round">
            <rect x="128" y="176" width="256" height="176" rx="32" />
            <rect x="300" y="232" width="84" height="64" rx="16" />
          </g>
          <circle cx="332" cy="264" r="9" fill="#fff" />
        </g>
      </svg>
    </Flex>
  )
}
