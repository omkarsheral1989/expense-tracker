import { Tag } from 'antd'
import type { GroupSummary } from '../../services/groupService/types.ts'
import { ICON_ONLY_SIZE } from '../../theme/controlHeight.ts'
import { PILL_RADIUS } from '../../theme/radius.ts'
import { GROUP_TYPE_CONTENT } from '../GroupTypeIcon/content.tsx'

type Props = {
  group: Pick<GroupSummary, 'name' | 'type'>
}

/** A group's icon and name in a small pill, as plain text (nothing to choose). */
export function GroupLabel({ group }: Props) {
  return (
    <Tag
      icon={<span style={{ display: 'flex', fontSize: ICON_ONLY_SIZE }}>{GROUP_TYPE_CONTENT[group.type].icon}</span>}
      style={{ borderRadius: PILL_RADIUS, paddingInline: 10, fontSize: 14, lineHeight: '26px', margin: 0 }}
    >
      {group.name}
    </Tag>
  )
}
