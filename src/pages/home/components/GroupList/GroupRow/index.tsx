import { Card, Flex, Typography } from 'antd'
import { Link } from 'react-router'
import { GROUP_TYPE_CONTENT } from '../../../../../components/GroupTypeIcon/content.tsx'
import { useColorScheme } from '../../../../../hooks/useColorScheme'
import { ROUTES } from '../../../../../routes.ts'
import type { CurrencyBalance } from '../../../../../services/expenseService/types.ts'
import type { GroupSummary } from '../../../../../services/groupService/types.ts'
import { GroupBalance } from './GroupBalance'

const { Text } = Typography

/** Width of the colored block holding the group type's icon, at the card's left edge. */
const TYPE_BLOCK_WIDTH = 76

/** Size of the group type's icon inside that block. */
const TYPE_ICON_SIZE = 32

type Props = {
  group: GroupSummary
  /** The user's balance in the group, one entry per currency not settled. */
  balances: CurrencyBalance[]
}

/** One group in the list. The whole row is a link to the group's page. */
export function GroupRow({ group, balances }: Props) {
  const members = `${group.memberCount} ${group.memberCount === 1 ? 'member' : 'members'}`
  const { label, icon, color } = GROUP_TYPE_CONTENT[group.type]
  const scheme = useColorScheme()

  return (
    <Link to={ROUTES.group(group.id)} style={{ display: 'block' }}>
      {/* The type's colored block fills the card's left edge, top to bottom; the card clips its corners. */}
      <Card
        hoverable
        className="group-row-card"
        // No border on a white card in light mode (a transparent one would show the card's white around the colored block); dark mode keeps it, since the card is barely lighter than the page.
        style={{ overflow: 'hidden', borderWidth: scheme === 'light' ? 0 : undefined }}
        styles={{ body: { padding: 0 } }}
      >
        <Flex align="stretch">
          <Flex
            align="center"
            justify="center"
            role="img"
            aria-label={label}
            style={{ flex: 'none', width: TYPE_BLOCK_WIDTH, fontSize: TYPE_ICON_SIZE, color: '#fff', background: color }}
          >
            {icon}
          </Flex>
          <Flex align="center" gap={16} flex={1} style={{ minWidth: 0, padding: 16 }}>
            <Flex vertical flex={1} style={{ minWidth: 0 }}>
              <Text strong ellipsis>
                {group.name}
              </Text>
              <Text type="secondary">
                {members} · {group.defaultCurrency}
              </Text>
            </Flex>
            <GroupBalance balances={balances} />
          </Flex>
        </Flex>
      </Card>
    </Link>
  )
}
