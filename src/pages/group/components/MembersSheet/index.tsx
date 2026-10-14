import { Drawer, Grid } from 'antd'
import type { GroupMember } from '../../../../services/groupService/types.ts'
import { AddMemberRow } from './AddMemberRow'
import { MemberList } from './MemberList'

type Props = {
  open: boolean
  onClose: () => void
  /** The user first, then the others A to Z, already in the order to show. */
  members: GroupMember[]
  groupId: string
  /** The user's person id: they add the new members. */
  userId: string
  /** Called once a member has been added, so the group can be read again. */
  onMemberAdded: () => void
}

/**
 * The members of the group: a sheet that slides up from the bottom on phones
 * and in from the right on wider screens. Its last row adds a member.
 */
export function MembersSheet({ open, onClose, members, groupId, userId, onMemberAdded }: Props) {
  const screens = Grid.useBreakpoint()

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Members (${members.length})`}
      placement={screens.md ? 'right' : 'bottom'}
      size={screens.md ? 'default' : 420}
    >
      <MemberList members={members} />
      <AddMemberRow
        groupId={groupId}
        userId={userId}
        memberIds={members.map((member) => member.personId)}
        onAdded={onMemberAdded}
      />
    </Drawer>
  )
}
