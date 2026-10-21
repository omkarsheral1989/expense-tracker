import { Divider, Flex } from 'antd'
import type { GroupMember } from '../../../../../services/groupService/types.ts'
import { MemberRow } from './MemberRow'

type Props = {
  /** The user first, then the others A to Z, already in the order to show. */
  members: GroupMember[]
  /** Members who have synced the group, so are not Pending. */
  syncedIds: ReadonlySet<string>
}

export function MemberList({ members, syncedIds }: Props) {
  return (
    <Flex vertical>
      {members.map((member, index) => (
        <div key={member.personId}>
          {index > 0 && <Divider style={{ margin: '12px 0' }} />}
          <MemberRow member={member} synced={syncedIds.has(member.personId)} />
        </div>
      ))}
    </Flex>
  )
}
