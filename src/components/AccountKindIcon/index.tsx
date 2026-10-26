import { BankOutlined, CreditCardOutlined } from '@ant-design/icons'
import { Flex, Typography } from 'antd'
import type { AccountKind } from '../../db/types.ts'
import { ACCOUNT_KIND_COLORS } from '../../theme/accountColors.ts'
import { RADIUS } from '../../theme/radius.ts'
import { ACCOUNT_KIND_LABELS } from './content.ts'

const { Text } = Typography

type Props = {
  kind: AccountKind
  /** Width and height of the tile in pixels. */
  size?: number
  /** Also write the name of the type ("Bank account") under the tile. */
  withLabel?: boolean
}

/** The colored tile with the icon that stands for a kind of account. */
export function AccountKindIcon({ kind, size = 40, withLabel = false }: Props) {
  const Icon = kind === 'bank' ? BankOutlined : CreditCardOutlined
  const tile = (
    <Flex
      align="center"
      justify="center"
      role="img"
      aria-label={ACCOUNT_KIND_LABELS[kind]}
      style={{ flex: 'none', width: size, height: size, borderRadius: RADIUS.inner, fontSize: size * 0.5, color: '#fff', background: ACCOUNT_KIND_COLORS[kind] }}
    >
      <Icon aria-hidden />
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
