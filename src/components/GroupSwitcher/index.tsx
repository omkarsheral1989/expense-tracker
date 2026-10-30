import { Icon } from '../Icon'
import { Button, Dropdown, Flex, Typography } from 'antd'
import { GroupLabel } from '../GroupLabel'
import { GroupTypeIcon } from '../GroupTypeIcon'
import { currencyService } from '../../services/currencyService'
import type { GroupSummary } from '../../services/groupService/types.ts'
import { RADIUS } from '../../theme/radius.ts'

type GroupSummaryFields = Pick<GroupSummary, 'id' | 'name' | 'type'> & Partial<Pick<GroupSummary, 'defaultCurrency' | 'memberCount'>> & {
    /** The group's members, when it is read in full: their number stands in for `memberCount`. */
    members?: readonly unknown[]
  }

const { Text } = Typography

type Props = { group: GroupSummaryFields } & (
  | {
      /** The group the expense is being added to can be changed. */
      disabled?: false
      /** Every group of the user, the current one included. */
      groups: readonly GroupSummaryFields[]
      /** Called with the id of another group the user chose. */
      onSwitch: (groupId: string) => void
    }
  | {
      /**
       * True when the expense cannot move to another group (editing one): the same
       * button, switched off, with no menu, so `groups` and `onSwitch` are not needed.
       */
      disabled: true
    }
)

/**
 * The group the expense belongs to, with the group's icon and name. With other
 * groups to choose from it is a full-width dropdown (as wide as the form's
 * column) that opens a menu of them as wide as itself, the current one ticked;
 * with only this group it is a plain label, since there is nothing to switch to.
 */
export function GroupSwitcher(props: Props) {
  const { group } = props

  // The same content as a row of the menu, with the arrow at the far right, like a field. Taller than the 40 px
  // controls (like a row of the menu: a 40 px tile and 10 px of padding), since it holds two lines beside a 40 px tile.
  function renderButton(label: string, disabled: boolean) {
    return (
      <Button
        block
        disabled={disabled}
        aria-label={label}
        style={{
          borderRadius: RADIUS.card,
          justifyContent: 'space-between',
          height: 'auto',
          padding: 10,
          textAlign: 'left',
          // A switched-off pill takes the page's own background, so it reads as sunk into the page next to the white (light) or
          // dark grey (dark) of a working one; Ant Design's own disabled fill is hardly different from that in dark mode.
          background: disabled ? 'var(--ant-color-bg-layout)' : undefined,
        }}
      >
        <span style={{ display: 'flex', flex: 1, minWidth: 0 }}>{renderRow(group, false)}</span>
        <Icon name="chevronDown" style={{ fontSize: 12 }} />
      </Button>
    )
  }

  // One row of the menu, and the content of the button: the type's colored tile, the name, "₹ · 3 members" under it and, in the menu, a tick on the current group.
  function renderRow(entry: GroupSummaryFields, inMenu = true) {
    const currency = entry.defaultCurrency && (currencyService.symbol(entry.defaultCurrency, navigator.language) ?? entry.defaultCurrency)
    const count = entry.memberCount ?? entry.members?.length
    const members = count === undefined ? null : `${count} ${count === 1 ? 'member' : 'members'}`
    const details = [currency, members].filter(Boolean).join(' · ')
    return (
      <Flex align="center" gap={12} style={{ height: 40 }}>
        <GroupTypeIcon type={entry.type} size={40} iconSize={24} />
        <Flex vertical flex={1} style={{ minWidth: 0 }}>
          <Text ellipsis strong={inMenu && entry.id === group.id}>
            {entry.name}
          </Text>
          {details && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {details}
            </Text>
          )}
        </Flex>
        {inMenu && entry.id === group.id && <Icon name="check" style={{ fontSize: 18 }} />}
      </Flex>
    )
  }

  if (props.disabled) return renderButton(`Group: ${group.name}`, true)

  const { groups, onSwitch } = props
  if (groups.length <= 1) return <GroupLabel group={group} />

  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items: groups.map((entry) => ({
          key: entry.id,
          label: renderRow(entry),
          style: { height: 'auto', padding: 10 },
        })),
        selectable: true,
        selectedKeys: [group.id],
        // A long list scrolls instead of running off the screen.
        // The card radius, so the 10 px tiles sit closer to its corners than they do to the usual 24 px.
        style: { maxHeight: 320, overflowY: 'auto', borderRadius: RADIUS.card },
        onClick: ({ key }) => {
          if (key !== group.id) onSwitch(key)
        },
      }}
    >
      {renderButton(`Group: ${group.name}. Choose another group`, false)}
    </Dropdown>
  )
}
