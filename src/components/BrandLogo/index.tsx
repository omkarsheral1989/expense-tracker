import { WalletOutlined } from '@ant-design/icons'
import { Flex, theme } from 'antd'
import { RADIUS } from '../../theme/radius.ts'
import { LARGE_LOGO_SIZE, LOGO_GRADIENT_END_COLOR } from './style.ts'

type Props = {
  /** Width and height of the tile in pixels. */
  size?: number
}

/** The OwnLedger logo: a wallet on a teal gradient tile. */
export function BrandLogo({ size = 32 }: Props) {
  const { token } = theme.useToken()

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
        fontSize: size / 2,
        color: '#fff',
        background: `linear-gradient(135deg, ${token.colorPrimary}, ${LOGO_GRADIENT_END_COLOR})`,
        boxShadow: size >= LARGE_LOGO_SIZE ? token.boxShadowSecondary : undefined,
      }}
    >
      <WalletOutlined />
    </Flex>
  )
}
