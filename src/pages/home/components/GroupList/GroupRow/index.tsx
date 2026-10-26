import { Card, Flex, Typography } from 'antd'
import { AppLink } from '../../../../../components/AppLink'
import { GROUP_TYPE_CONTENT } from '../../../../../components/GroupTypeIcon/content.tsx'
import { currencyService } from '../../../../../services/currencyService'
import { ROUTES } from '../../../../../routes.ts'
import type { CurrencyBalance } from '../../../../../services/expenseService/types.ts'
import type { GroupSummary } from '../../../../../services/groupService/types.ts'
import type { GroupPageState } from '../../../../group/types.ts'
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
  // The currency as the group page's chip shows it ("US$", "₹"), or its code where no symbol tells it apart.
  const currency = currencyService.symbol(group.defaultCurrency, navigator.language) ?? group.defaultCurrency
  const { id, name, type, defaultCurrency, memberCount } = group
  const opened = { group: { id, name, type, defaultCurrency, memberCount } }

  return (
    // The group page opens with what this list already knows about the group (ADR-052).
    <AppLink to={ROUTES.group(group.id)} state={opened satisfies GroupPageState} style={{ display: 'block' }} data-group-row={group.id}>
      {/* The type's colored block fills the card's left edge, top to bottom; the card clips its corners. */}
      <Card
        hoverable
        style={{ overflow: 'hidden' }}
        styles={{ body: { padding: 0 } }}
      >
        <Flex align="stretch">
          <Flex
            align="center"
            justify="center"
            role="img"
            aria-label={label}
            // A piece that travels to the group's page (PRD 5.16).
            data-vt="block"
            style={{ flex: 'none', width: TYPE_BLOCK_WIDTH, fontSize: TYPE_ICON_SIZE, color: '#fff', background: color }}
          >
            <span data-vt="icon" style={{ display: 'flex' }}>
              {icon}
            </span>
          </Flex>
          <Flex align="center" gap={16} flex={1} style={{ minWidth: 0, padding: 16 }}>
            <Flex vertical flex={1} style={{ minWidth: 0 }}>
              <Text strong ellipsis data-vt="name" style={{ width: 'fit-content', maxWidth: '100%' }}>
                {group.name}
              </Text>
              <Text type="secondary">
                {/* Each text sits in a plain box, which grows into the band's chip (PRD 5.16). */}
                <span data-vt="currencyChip" style={{ display: 'inline-block' }}>
                  <span data-vt="currency" style={{ display: 'inline-block' }}>
                    {currency}
                  </span>
                </span>{' '}
                {/* Shrinks into an empty 0 x 0 px piece between the band's chips (PRD 5.16). */}
                <span data-vt="dot" style={{ display: 'inline-block' }}>
                  ·
                </span>{' '}
                <span data-vt="peopleChip" style={{ display: 'inline-block' }}>
                  {/* An empty 0 x 0 px piece, centered on the text's 22 px line, which grows into the members icon of the band's chip (PRD 5.16). */}
                  <span data-vt="peopleIcon" style={{ display: 'inline-block', width: 0, height: 0, verticalAlign: 'top', marginTop: 11 }} />
                  <span data-vt="people" style={{ display: 'inline-block' }}>
                    {members}
                  </span>
                </span>
              </Text>
            </Flex>
            <GroupBalance balances={balances} />
          </Flex>
        </Flex>
      </Card>
    </AppLink>
  )
}
