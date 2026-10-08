import { TeamOutlined } from '@ant-design/icons'
import { Flex, Tag, Typography } from 'antd'
import { PILL_RADIUS } from '../../../../../theme/radius.ts'

const { Text } = Typography

type Props = {
  groupName: string
}

/**
 * Who the expense is shared with. Expenses are always shared with the whole
 * group, so this is a fixed chip rather than a choice.
 */
export function WithChip({ groupName }: Props) {
  return (
    <Flex align="center" wrap gap={8}>
      <Text>With you and:</Text>
      <Tag
        icon={<TeamOutlined aria-hidden />}
        style={{ borderRadius: PILL_RADIUS, paddingInline: 10, fontSize: 14, lineHeight: '26px', margin: 0 }}
      >
        All of {groupName}
      </Tag>
    </Flex>
  )
}
