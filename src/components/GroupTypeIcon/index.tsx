import { Flex, Typography } from 'antd'
import type { GroupType } from '../../db/types.ts'
import { RADIUS } from '../../theme/radius.ts'
import { GROUP_TYPE_CONTENT } from './content.tsx'

const { Text } = Typography

type Props = {
  type: GroupType
  /** Width and height of the tile in pixels. */
  size?: number
  /** Size of the icon on the tile in pixels; half the tile when left out. */
  iconSize?: number
  /** Also write the name of the type ("Trip") under the tile. */
  withLabel?: boolean
  /**
   * Marks the tile and its icon as pieces that travel into the new group's band when Create group opens it (PRD 5.16): the tile is
   * then a square block clipped round by its frame, so the transition rounds it with a clip instead of stretching its corners (ADR-060).
   */
  travels?: boolean
}

/** The colored tile with the icon that stands for a kind of group. */
export function GroupTypeIcon({ type, size = 40, iconSize = size * 0.5, withLabel = false, travels }: Props) {
  const { label, icon, color } = GROUP_TYPE_CONTENT[type]
  const box = { flex: 'none', width: size, height: size, borderRadius: RADIUS.inner, fontSize: iconSize, color: '#fff' } as const

  function renderTile() {
    if (!travels) {
      return (
        <Flex align="center" justify="center" role="img" aria-label={label} style={{ ...box, background: color }}>
          {icon}
        </Flex>
      )
    }
    return (
      <div role="img" aria-label={label} style={{ ...box, overflow: 'hidden' }}>
        <Flex align="center" justify="center" data-vt="block" style={{ width: '100%', height: '100%', background: color }}>
          <span data-vt="icon" style={{ display: 'flex' }}>
            {icon}
          </span>
        </Flex>
      </div>
    )
  }

  const tile = renderTile()

  if (!withLabel) return tile

  return (
    <Flex vertical align="center" gap={6}>
      {tile}
      <Text>{label}</Text>
    </Flex>
  )
}
