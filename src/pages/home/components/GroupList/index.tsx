import { Flex } from 'antd'
import type { GroupSummary } from '../../../../services/groupService/types.ts'
import { GroupRow } from './GroupRow'

type Props = {
  /** In the order to show them, already sorted. */
  groups: GroupSummary[]
}

export function GroupList({ groups }: Props) {
  return (
    <Flex vertical gap={12}>
      {groups.map((group) => (
        <GroupRow key={group.id} group={group} />
      ))}
    </Flex>
  )
}
