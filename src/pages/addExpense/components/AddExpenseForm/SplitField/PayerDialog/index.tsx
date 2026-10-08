import { CheckOutlined } from '@ant-design/icons'
import { Button, Flex } from 'antd'
import { AdaptiveDialog } from '../../../../../../components/AdaptiveDialog'
import { ComingSoon } from '../../../../../../components/ComingSoon'
import type { GroupMember } from '../../../../../../services/groupService/types.ts'

type Props = {
  open: boolean
  onClose: () => void
  /** The user first, then the others A to Z. */
  members: GroupMember[]
  /** The person id of who paid now; it is marked. */
  value: string
  onPick: (personId: string) => void
}

/** Who paid the expense: one member. Several payers are not possible yet ("Coming soon"). */
export function PayerDialog({ open, onClose, members, value, onPick }: Props) {
  function renderMember(member: GroupMember) {
    const selected = member.personId === value
    return (
      <Button
        key={member.personId}
        type="text"
        block
        aria-pressed={selected}
        onClick={() => onPick(member.personId)}
        style={{ justifyContent: 'space-between', height: 'auto', padding: '10px 12px' }}
      >
        <span>{member.isYou ? 'You' : (member.name ?? member.email)}</span>
        {selected && <CheckOutlined aria-hidden />}
      </Button>
    )
  }

  return (
    <AdaptiveDialog open={open} onClose={onClose} title="Who paid?">
      <Flex vertical gap={2}>
        {members.map(renderMember)}
        <ComingSoon>
          <Button type="text" block disabled style={{ justifyContent: 'flex-start', padding: '10px 12px', height: 'auto' }}>
            Multiple people
          </Button>
        </ComingSoon>
      </Flex>
    </AdaptiveDialog>
  )
}
