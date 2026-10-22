import { Flex, Typography } from 'antd'
import type { GroupType } from '../../db/types.ts'
import { RADIUS } from '../../theme/radius.ts'
import { GROUP_TYPE_CONTENT } from './content.tsx'

const { Text } = Typography

type Props = {
  type: GroupType
  /** Width and height of the tile in pixels. */
  size?: number
  /** Also write the name of the type ("Trip") under the tile. */
  withLabel?: boolean
}

/** The colored tile with the icon that stands for a kind of group. */
export function GroupTypeIcon({ type, size = 40, withLabel = false }: Props) {
  const { label, icon, color } = GROUP_TYPE_CONTENT[type]

  const tile = (
    <Flex
      align="center"
      justify="center"
      role="img"
      aria-label={label}
      style={{
        flex: 'none',
        width: size,
        height: size,
        borderRadius: RADIUS.inner,
        fontSize: size * 0.5,
        color: '#fff',
        background: color,
      }}
    >
      {icon}
    </Flex>
  )

  if (!withLabel) return tile

  return (
    <Flex vertical align="center" gap={6}>
      {tile}
      <Text>{label}</Text>
    </Flex>
  )
}
