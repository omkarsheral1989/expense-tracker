import { theme, type ThemeConfig } from 'antd'
import type { ColorScheme } from '../../hooks/useColorScheme'
import { CARD_PADDING } from '../../theme/cardPadding.ts'
import { CONTROL_HEIGHT, ICON_ONLY_SIZE } from '../../theme/controlHeight.ts'
import { RADIUS } from '../../theme/radius.ts'

/** The app's green. */
export const PRIMARY = '#0d9488'

/** The Ant Design theme of the app for a color scheme: its green, its two corner radii (and the card's), its control height. */
export function themeFor(scheme: ColorScheme): ThemeConfig {
  return {
    algorithm:
      scheme === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: PRIMARY,
      colorLink: PRIMARY,
      // Two tiers only: inner for small controls, outer (LG) for containers.
      borderRadius: RADIUS.inner,
      borderRadiusSM: RADIUS.inner,
      borderRadiusXS: RADIUS.inner,
      borderRadiusLG: RADIUS.outer,
      // Every button, input, dropdown and date picker is one height, whatever
      // its size: Ant Design's small, middle and large all come out the same.
      controlHeight: CONTROL_HEIGHT,
      controlHeightSM: CONTROL_HEIGHT,
      controlHeightLG: CONTROL_HEIGHT,
    },
    // "Large" controls would otherwise pick up the outer radius and turn
    // into pills, so keep them on the inner tier.
    components: {
      Button: {
        borderRadiusLG: RADIUS.inner,
        // The icon of an icon-only button (Back, Edit, Delete, Sync, the band's round buttons)
        // is a little larger than the 14 px text size it inherited; the button stays 40 px.
        onlyIconSize: ICON_ONLY_SIZE,
        onlyIconSizeSM: ICON_ONLY_SIZE,
        onlyIconSizeLG: ICON_ONLY_SIZE,
      },
      // Cards have a radius of their own, a little under the other containers', and one padding.
      Card: { borderRadiusLG: RADIUS.card, bodyPadding: CARD_PADDING },
      Input: { borderRadiusLG: RADIUS.inner },
      InputNumber: { borderRadiusLG: RADIUS.inner },
      Select: { borderRadiusLG: RADIUS.inner },
      DatePicker: { borderRadiusLG: RADIUS.inner },
    },
  }
}
