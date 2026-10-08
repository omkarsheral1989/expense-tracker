import { Flex, Typography } from 'antd'
import { GroupTypeIcon } from '../../../../components/GroupTypeIcon'
import { GROUP_TYPE_LABELS } from '../../../../db/constants.ts'
import type { GroupDetails } from '../../../../services/groupService/types.ts'

const { Title, Text } = Typography

type Props = {
  group: GroupDetails
}

/** The group's icon and name, with its type and default currency under it. */
export function GroupHeading({ group }: Props) {
  return (
    // `minWidth: 0` lets this row shrink to the screen instead of growing with the
    // name; the name then wraps onto more lines, breaking inside a very long word
    // if it has to.
    <Flex align="center" gap={16} flex={1} style={{ minWidth: 0 }}>
      <GroupTypeIcon type={group.type} size={56} />
      <Flex vertical style={{ minWidth: 0 }}>
        <Title level={3} style={{ margin: 0, overflowWrap: 'anywhere' }}>
          {group.name}
        </Title>
        <Text type="secondary">
          {GROUP_TYPE_LABELS[group.type]} · {group.defaultCurrency}
        </Text>
      </Flex>
    </Flex>
  )
}
