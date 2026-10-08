import { Drawer, Grid } from 'antd'
import type { GroupMember } from '../../../../services/groupService/types.ts'
import { MemberList } from './MemberList'

type Props = {
  open: boolean
  onClose: () => void
  /** The user first, then the others A to Z, already in the order to show. */
  members: GroupMember[]
}

/**
 * The members of the group: a sheet that slides up from the bottom on phones
 * and in from the right on wider screens.
 */
export function MembersSheet({ open, onClose, members }: Props) {
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
    </Drawer>
  )
}
