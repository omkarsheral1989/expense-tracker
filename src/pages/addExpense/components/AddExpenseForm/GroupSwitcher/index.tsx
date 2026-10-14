import { DownOutlined } from '@ant-design/icons'
import { Button, Dropdown, Tag } from 'antd'
import { GROUP_TYPE_CONTENT } from '../../../../../components/GroupTypeIcon/content.tsx'
import type { GroupSummary } from '../../../../../services/groupService/types.ts'
import { PILL_RADIUS } from '../../../../../theme/radius.ts'

type Props = {
  /** The group the expense is being added to. */
  group: Pick<GroupSummary, 'id' | 'name' | 'type'>
  /** Every group of the user, the current one included. */
  groups: readonly Pick<GroupSummary, 'id' | 'name' | 'type'>[]
  /** Called with the id of another group the user chose. */
  onSwitch: (groupId: string) => void
}

/**
 * The group the expense belongs to, with the group's icon and name. With other
 * groups to choose from it is a full-width dropdown (as wide as the form's
 * column) that opens a menu of them as wide as itself, the current one ticked;
 * with only this group it is a plain label, since there is nothing to switch to.
 */
export function GroupSwitcher({ group, groups, onSwitch }: Props) {
  const icon = GROUP_TYPE_CONTENT[group.type].icon

  if (groups.length <= 1) {
    return (
      <Tag
        icon={icon}
        style={{ borderRadius: PILL_RADIUS, paddingInline: 10, fontSize: 14, lineHeight: '26px', margin: 0 }}
      >
        {group.name}
      </Tag>
    )
  }

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
      <Button
        block
        aria-label={`Group: ${group.name}. Choose another group`}
        // Icon and name on the left, the arrow at the far right, like a field.
        style={{ borderRadius: PILL_RADIUS, justifyContent: 'space-between' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {icon}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.name}</span>
        </span>
        <DownOutlined aria-hidden style={{ fontSize: 12 }} />
      </Button>
    </Dropdown>
  )
}
