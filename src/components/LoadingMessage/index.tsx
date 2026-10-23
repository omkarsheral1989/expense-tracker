import { Flex, Spin, Typography } from 'antd'
import { CenteredMessage } from '../CenteredMessage'

const { Text } = Typography

type Props = {
  /** What is loading, such as "Loading the group"; shown under the spinner with "…" and read out as the status. */
  label: string
  /** Space kept free below the spinner, as for `CenteredMessage` (a page with a floating button). */
  roomBelow?: number
}

/**
 * What every page shows while its data loads: a spinner centered in the space
 * the page has, with a short label under it, the same as "Opening your data…".
 * It replaces the grey skeleton placeholders.
 */
export function LoadingMessage({ label, roomBelow }: Props) {
  return (
    <CenteredMessage roomBelow={roomBelow}>
      <Flex vertical align="center" gap={16} role="status" aria-label={label}>
        <Spin size="large" />
        <Text type="secondary">{label}…</Text>
      </Flex>
    </CenteredMessage>
  )
}
