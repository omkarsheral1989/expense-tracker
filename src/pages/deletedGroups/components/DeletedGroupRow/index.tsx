import { Card, Flex, Typography } from 'antd'
import { AppLink } from '../../../../components/AppLink'
import { GROUP_TYPE_CONTENT } from '../../../../components/GroupTypeIcon/content.tsx'
import { ROUTES } from '../../../../routes.ts'
import { currencyService } from '../../../../services/currencyService'
import { dateService } from '../../../../services/dateService'
import type { GroupSummary } from '../../../../services/groupService/types.ts'
import { RADIUS } from '../../../../theme/radius.ts'
import type { GroupPageState } from '../../../group/types.ts'

const { Text } = Typography

/** Width of the colored block holding the group type's icon, and of its icon: as on the home list's rows. */
const TYPE_BLOCK_WIDTH = 76
const TYPE_ICON_SIZE = 32

type Props = {
  group: GroupSummary
}

/**
 * One deleted group: the home list's card (the type's colored block, the name, "£ · 3 members") with the day it was deleted at
 * the end. Opens the group's page, read-only (PRD 5.23).
 */
export function DeletedGroupRow({ group }: Props) {
  const { label, icon, color } = GROUP_TYPE_CONTENT[group.type]
  const members = `${group.memberCount} ${group.memberCount === 1 ? 'member' : 'members'}`
  const currency = currencyService.symbol(group.defaultCurrency, navigator.language) ?? group.defaultCurrency
  const { id, name, type, defaultCurrency, memberCount } = group
  // Back from the group leads here, not to the home page.
  const opened = { group: { id, name, type, defaultCurrency, memberCount }, backTo: ROUTES.deletedGroups }

  return (
    <AppLink to={ROUTES.group(group.id)} state={opened satisfies GroupPageState} style={{ display: 'block' }}>
      <Card hoverable style={{ overflow: 'hidden', borderRadius: RADIUS.cardLarge }} styles={{ body: { padding: 0 } }}>
        <Flex align="stretch">
          <Flex align="center" justify="center" role="img" aria-label={label} style={{ flex: 'none', width: TYPE_BLOCK_WIDTH, fontSize: TYPE_ICON_SIZE, color: '#fff', background: color }}>
            {icon}
          </Flex>
          <Flex align="center" gap={16} flex={1} style={{ minWidth: 0, padding: 16 }}>
            <Flex vertical flex={1} style={{ minWidth: 0 }}>
              <Text strong ellipsis style={{ width: 'fit-content', maxWidth: '100%' }}>
                {group.name}
              </Text>
              <Text type="secondary">
                {currency} · {members}
              </Text>
              {group.deletedSince && (
                <Text type="secondary" style={{ fontSize: 13 }}>
                  Deleted {dateService.formatDate(dateService.toDay(group.deletedSince))}
                </Text>
              )}
            </Flex>
          </Flex>
        </Flex>
      </Card>
    </AppLink>
  )
}
