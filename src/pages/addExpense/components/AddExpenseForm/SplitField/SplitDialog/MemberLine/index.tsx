import { Avatar, Flex, theme, Typography } from 'antd'
import type { ReactNode } from 'react'
import type { GroupMember } from '../../../../../../../services/groupService/types.ts'

const { Text } = Typography

type Props = {
  member: GroupMember
  /** Under the name, such as what the member's part comes to ("£3.33"). */
  detail?: string
  /** The member's entry at the end of the line: a tick box, an amount or a number. */
  children: ReactNode
}

/** One member in the split dialog: avatar, name ("You" for the user), and their entry. */
export function MemberLine({ member, detail, children }: Props) {
  const { token } = theme.useToken()
  const label = member.isYou ? 'You' : (member.name ?? member.email)

  return (
    <Flex align="center" gap={12} style={{ minHeight: 48 }}>
      <Avatar style={{ flex: 'none', background: token.colorPrimaryBg, color: token.colorPrimary }}>
        {label.charAt(0).toUpperCase()}
      </Avatar>
      <Flex vertical flex={1} style={{ minWidth: 0 }}>
        <Text ellipsis>{label}</Text>
        {detail && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {detail}
          </Text>
        )}
      </Flex>
      <div style={{ flex: 'none', width: 120, display: 'flex', justifyContent: 'flex-end' }}>{children}</div>
    </Flex>
  )
}
