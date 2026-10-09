import { Card, Flex, Typography } from 'antd'
import { Link } from 'react-router'
import { GroupTypeIcon } from '../../../../../components/GroupTypeIcon'
import { ROUTES } from '../../../../../routes.ts'
import type { CurrencyBalance } from '../../../../../services/expenseService/types.ts'
import type { GroupSummary } from '../../../../../services/groupService/types.ts'
import { GroupBalance } from './GroupBalance'

const { Text } = Typography

type Props = {
  group: GroupSummary
  /** The user's balance in the group, one entry per currency not settled. */
  balances: CurrencyBalance[]
}

/** One group in the list. The whole row is a link to the group's page. */
export function GroupRow({ group, balances }: Props) {
  const members = `${group.memberCount} ${group.memberCount === 1 ? 'member' : 'members'}`

  return (
    <Link to={ROUTES.group(group.id)} style={{ display: 'block' }}>
      <Card hoverable styles={{ body: { padding: 16 } }}>
        <Flex align="center" gap={16}>
          <GroupTypeIcon type={group.type} size={44} />
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
      </Card>
    </Link>
  )
}
