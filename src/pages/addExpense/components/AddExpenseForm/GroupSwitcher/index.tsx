import { DownOutlined } from '@ant-design/icons'
import { Button, Dropdown, Tag } from 'antd'
import { GROUP_TYPE_CONTENT } from '../../../../../components/GroupTypeIcon/content.tsx'
import type { GroupSummary } from '../../../../../services/groupService/types.ts'
import { PILL_RADIUS } from '../../../../../theme/radius.ts'

/** The space between two rows of the menu. */
const MENU_ROW_GAP = 8

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
        items: groups.map((entry, index) => ({
          key: entry.id,
          icon: GROUP_TYPE_CONTENT[entry.type].icon,
          label: entry.name,
          // A gap between rows, so a highlighted row never touches the next one.
          style: { marginTop: index === 0 ? 0 : MENU_ROW_GAP },
        })),
        selectable: true,
        selectedKeys: [group.id],
        // A long list scrolls instead of running off the screen. The padding keeps
        // the highlighted row off the menu's rounded edge: Ant Design's 4 px is too
        // little next to the 24 px corners, and 12 px (24 minus the rows' own 12 px
        // corners) makes the highlight's corners follow the menu's.
        style: { maxHeight: 320, overflowY: 'auto', padding: 12 },
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
