import { Flex, Typography } from 'antd'
import type { AccountKind } from '../../db/types.ts'
import { ACCOUNT_KIND_COLORS } from '../../theme/accountColors.ts'
import { RADIUS } from '../../theme/radius.ts'
import { Icon } from '../Icon'
import { ACCOUNT_KIND_LABELS } from './content.ts'

const { Text } = Typography

type Props = {
  kind: AccountKind
  /** Width and height of the tile in pixels. */
  size?: number
  /** Size of the icon on the tile in pixels; half the tile when left out. */
  iconSize?: number
  /** Also write the name of the type ("Bank account") under the tile. */
  withLabel?: boolean
}

/** The colored tile with the icon that stands for a kind of account. */
export function AccountKindIcon({ kind, size = 40, iconSize = size * 0.5, withLabel = false }: Props) {
  const tile = (
    <Flex
      align="center"
      justify="center"
      role="img"
      aria-label={ACCOUNT_KIND_LABELS[kind]}
      style={{ flex: 'none', width: size, height: size, borderRadius: RADIUS.inner, fontSize: iconSize, color: '#fff', background: ACCOUNT_KIND_COLORS[kind] }}
    >
      <Icon name={kind === 'bank' ? 'bank' : 'creditCard'} />
    </Flex>
  )
  if (!withLabel) return tile

  return (
    <Flex vertical align="center" gap={6}>
      {tile}
      <Text>{ACCOUNT_KIND_LABELS[kind]}</Text>
    </Flex>
  )
}
