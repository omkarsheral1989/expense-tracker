import { Avatar, Flex, Tag, theme, Typography } from 'antd'
import { groupService } from '../../../../../../services/groupService'
import type { GroupMember } from '../../../../../../services/groupService/types.ts'

const { Text } = Typography

type Props = {
  member: GroupMember
}

/**
 * One member: an avatar with their initial, their name (or their email when no
 * name is known) with the email under it ("No email" for a member without one),
 * and a tag. The user is tagged "You";
 * everyone else is "Pending" until they have signed in and synced, which cannot
 * happen before sync exists.
 */
export function MemberRow({ member }: Props) {
  const { token } = theme.useToken()
  const label = groupService.displayName(member)

  return (
    <Flex align="center" gap={12}>
      <Avatar style={{ background: token.colorPrimaryBg, color: token.colorPrimary }}>
        {label.charAt(0).toUpperCase()}
      </Avatar>
      <Flex vertical flex={1} style={{ minWidth: 0 }}>
        <Text strong ellipsis>
          {label}
        </Text>
        {member.name && (
          <Text type="secondary" ellipsis>
            {member.email ?? 'No email'}
          </Text>
        )}
      </Flex>
      {member.isYou ? (
        <Tag variant="outlined" style={{ margin: 0 }}>
          You
        </Tag>
      ) : (
        <Tag variant="filled" style={{ margin: 0 }}>
          Pending
        </Tag>
      )}
    </Flex>
  )
}
