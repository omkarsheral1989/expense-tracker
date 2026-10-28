import { Icon } from '../Icon'
import { Button, Dropdown } from 'antd'
import { GroupLabel } from '../GroupLabel'
import { GROUP_TYPE_CONTENT } from '../GroupTypeIcon/content.tsx'
import type { GroupSummary } from '../../services/groupService/types.ts'
import { PILL_RADIUS } from '../../theme/radius.ts'
import { ICON_ONLY_SIZE } from '../../theme/controlHeight.ts'

type GroupSummaryFields = Pick<GroupSummary, 'id' | 'name' | 'type'>

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
  const icon = GROUP_TYPE_CONTENT[group.type].icon

  // Icon and name on the left, the arrow at the far right, like a field.
  function renderButton(label: string, disabled: boolean) {
    return (
      <Button
        block
        disabled={disabled}
        aria-label={label}
        style={{ borderRadius: PILL_RADIUS, justifyContent: 'space-between' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ display: 'flex', fontSize: ICON_ONLY_SIZE }}>{icon}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.name}</span>
        </span>
        <Icon name="chevronDown" style={{ fontSize: 12 }} />
      </Button>
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
          icon: GROUP_TYPE_CONTENT[entry.type].icon,
          label: entry.name,
        })),
        selectable: true,
        selectedKeys: [group.id],
        // A long list scrolls instead of running off the screen.
        style: { maxHeight: 320, overflowY: 'auto' },
        onClick: ({ key }) => {
          if (key !== group.id) onSwitch(key)
        },
      }}
    >
      {renderButton(`Group: ${group.name}. Choose another group`, false)}
    </Dropdown>
  )
}
