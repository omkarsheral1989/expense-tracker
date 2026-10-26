import { Flex } from 'antd'
import { expenseService } from '../../services/expenseService'
import { CATEGORY_GROUP_COLORS } from '../../theme/categoryColors.ts'
import { RADIUS } from '../../theme/radius.ts'
import { CATEGORY_ICONS } from './content.tsx'

type Props = {
  /** A category key; an unknown one shows the default category. */
  category: string
  /** Width and height of the tile in pixels. */
  size?: number
  /** Marks the tile and its icon as pieces that travel into the band of the expense's page when the expense opens from the group's list (PRD 5.16); left out elsewhere. */
  travels?: boolean
}

/**
 * The colored tile with the icon of an expense's category, in the color of its
 * group. Screen readers read the category's name ("Food and drink: Dining out").
 */
export function CategoryIcon({ category, size = 40, travels }: Props) {
  const { key, label, group, groupLabel } = expenseService.categoryOf(category)

  const ariaLabel = label === 'Other' ? `${groupLabel}: Other` : label
  const tile = { flex: 'none', width: size, height: size, borderRadius: RADIUS.inner, fontSize: size * 0.5, color: '#fff' } as const

  // A travelling tile is drawn as a square block clipped round by its frame, like a group's block in its card: the browser takes a
  // named piece's picture without its parents' clipping, so the block's picture is square, and the transition rounds it with a clip
  // of its own instead of stretching rounded corners (PRD 5.16, ADR-060).
  if (travels) {
    return (
      <div role="img" aria-label={ariaLabel} style={{ ...tile, overflow: 'hidden' }}>
        <Flex align="center" justify="center" data-vt="block" style={{ width: '100%', height: '100%', background: CATEGORY_GROUP_COLORS[group] }}>
          <span data-vt="icon" style={{ display: 'flex' }}>
            {CATEGORY_ICONS[key]}
          </span>
        </Flex>
      </div>
    )
  }

  return (
    <Flex align="center" justify="center" role="img" aria-label={ariaLabel} style={{ ...tile, background: CATEGORY_GROUP_COLORS[group] }}>
      {CATEGORY_ICONS[key]}
    </Flex>
  )
}
