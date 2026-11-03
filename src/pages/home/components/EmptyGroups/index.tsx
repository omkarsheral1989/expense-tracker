import { Empty, Flex, Typography } from 'antd'
import { ABOVE_FLOATING_BUTTON } from '../../../../components/FloatingPillButton/constants.ts'
import { aboveScreenEdge } from '../../../../theme/safeArea.ts'
import { EMPTY_MESSAGE, PERSONAL_TIP } from './content.ts'

const { Text } = Typography

/**
 * What the home page shows before the user has any group. Its box runs from the
 * heading down to just above the floating Create group button, and the message
 * is centered in it, with a smaller line under it about keeping personal expenses.
 */
export function EmptyGroups() {
  function renderDescription() {
    return (
      <Flex vertical align="center" gap={8}>
        <span>{EMPTY_MESSAGE}</span>
        <Text type="secondary" style={{ maxWidth: 340, fontSize: 13, textWrap: 'balance' }}>
          {PERSONAL_TIP}
        </Text>
      </Flex>
    )
  }

  return (
    <Flex align="center" justify="center" style={{ flex: 1, marginBottom: aboveScreenEdge(ABOVE_FLOATING_BUTTON) }}>
      <Empty description={renderDescription()} />
    </Flex>
  )
}
