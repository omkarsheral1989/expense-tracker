import { Card, Divider, Flex, Typography } from 'antd'
import type { GroupMember } from '../../../../services/groupService/types.ts'
import { MemberRow } from './MemberRow'

const { Title } = Typography

type Props = {
  /** The user first, then the others A to Z, already in the order to show. */
  members: GroupMember[]
}

export function MemberList({ members }: Props) {
  return (
    <Card>
      <Title level={5} style={{ marginTop: 0 }}>
        Members ({members.length})
      </Title>
      <Flex vertical>
        {members.map((member, index) => (
          <div key={member.personId}>
            {index > 0 && <Divider style={{ margin: '12px 0' }} />}
            <MemberRow member={member} />
          </div>
        ))}
      </Flex>
    </Card>
  )
}
