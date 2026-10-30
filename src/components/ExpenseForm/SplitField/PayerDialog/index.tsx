import { Icon } from '../../../Icon'
import { Button, Flex, Typography } from 'antd'
import { AdaptiveDialog } from '../../../AdaptiveDialog'
import { ComingSoon } from '../../../ComingSoon'
import { PersonAvatar } from '../../../PersonAvatar'
import { groupService } from '../../../../services/groupService'
import type { GroupMember } from '../../../../services/groupService/types.ts'
import { ICON_ONLY_SIZE } from '../../../../theme/controlHeight.ts'

const { Text } = Typography

type Props = {
  open: boolean
  onClose: () => void
  /** The user first, then the others A to Z. */
  members: GroupMember[]
  /** The person id of who paid now; it is marked. */
  value: string
  onPick: (personId: string) => void
}

/** Who paid the expense: one member, with their picture, name and email; the chosen one is ticked and lightly highlighted. Several payers are not possible yet ("Coming soon"). */
export function PayerDialog({ open, onClose, members, value, onPick }: Props) {
  function renderMember(member: GroupMember) {
    const selected = member.personId === value
    const label = member.isYou ? 'You' : groupService.displayName(member)
    return (
      <Button
        key={member.personId}
        type="text"
        block
        aria-pressed={selected}
        onClick={() => onPick(member.personId)}
        style={{
          height: 'auto',
          padding: 10,
          background: selected ? 'var(--ant-color-primary-bg)' : undefined,
        }}
      >
        <Flex align="center" gap={12} flex={1} style={{ minWidth: 0, textAlign: 'left' }}>
          <PersonAvatar name={label} picture={member.picture} style={{ flex: 'none' }} />
          <Flex vertical flex={1} style={{ minWidth: 0 }}>
            <Text ellipsis>{label}</Text>
            <Text type="secondary" ellipsis style={{ fontSize: 12 }}>
              {member.email ?? 'No email'}
            </Text>
          </Flex>
          {selected && <Icon name="check" style={{ fontSize: ICON_ONLY_SIZE, color: 'var(--ant-color-primary)' }} />}
        </Flex>
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
