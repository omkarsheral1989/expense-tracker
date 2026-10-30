import { Card, Flex, Typography } from 'antd'
import { AppLink } from '../../../../components/AppLink'
import { GROUP_TYPE_CONTENT } from '../../../../components/GroupTypeIcon/content.tsx'
import { ROUTES } from '../../../../routes.ts'
import { currencyService } from '../../../../services/currencyService'
import type { GroupPageState, KnownGroup } from '../../../group/types.ts'

const { Text } = Typography

/** Width of the colored block holding the group type's icon, and of its icon: as on the home list's rows. */
const TYPE_BLOCK_WIDTH = 76
const TYPE_ICON_SIZE = 32

type Props = {
  group: KnownGroup
  /** The expense page the card is on: the group page's Back arrow returns to it. */
  backTo: string
}

/** The group an expense is in, as the home list's card shows it (the type's colored block, the name, "£ · 3 members"); opens the group's page. */
export function GroupCard({ group, backTo }: Props) {
  const { label, icon, color } = GROUP_TYPE_CONTENT[group.type]
  const members = `${group.memberCount} ${group.memberCount === 1 ? 'member' : 'members'}`
  const currency = currencyService.symbol(group.defaultCurrency, navigator.language) ?? group.defaultCurrency

  return (
    <AppLink to={ROUTES.group(group.id)} state={{ group, backTo } satisfies GroupPageState} style={{ display: 'block' }}>
      <Card hoverable style={{ overflow: 'hidden' }} styles={{ body: { padding: 0 } }}>
        <Flex align="stretch">
          <Flex align="center" justify="center" role="img" aria-label={label} style={{ flex: 'none', width: TYPE_BLOCK_WIDTH, fontSize: TYPE_ICON_SIZE, color: '#fff', background: color }}>
            {icon}
          </Flex>
          <Flex vertical style={{ minWidth: 0, padding: 16 }}>
            <Text strong ellipsis style={{ width: 'fit-content', maxWidth: '100%' }}>
              {group.name}
            </Text>
            <Text type="secondary">
              {currency} · {members}
            </Text>
          </Flex>
        </Flex>
      </Card>
    </AppLink>
  )
}
