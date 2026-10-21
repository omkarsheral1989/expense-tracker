import { CheckCircleFilled, ClockCircleOutlined, CloseCircleFilled, LoadingOutlined } from '@ant-design/icons'
import { Button, Flex, Typography, theme } from 'antd'
import { useSyncStore } from '../../stores/useSyncStore'
import type { SyncStep } from '../../stores/useSyncStore/types.ts'
import { AdaptiveDialog } from '../AdaptiveDialog'

const { Text } = Typography

/**
 * The progress of a sync or restore (PRD 5.8): one line per step (the backup,
 * then each group), each with a spinner, a tick, a clock (waiting for the
 * group's creator) or a cross, and what it is doing or what went wrong. Closing
 * it does not stop the run; pressing Sync again opens it.
 */
export function SyncDialog() {
  const { dialogOpen, title, steps, closeDialog } = useSyncStore()
  const { token } = theme.useToken()

  function renderIcon(step: SyncStep) {
    if (step.status === 'running') return <LoadingOutlined style={{ color: token.colorPrimary }} />
    if (step.status === 'done') return <CheckCircleFilled style={{ color: token.colorSuccess }} />
    if (step.status === 'waiting') return <ClockCircleOutlined style={{ color: token.colorTextSecondary }} />
    return <CloseCircleFilled style={{ color: token.colorError }} />
  }

  function renderStep(step: SyncStep) {
    return (
      <Flex key={step.key} gap={12} align="flex-start" role="listitem">
        <span style={{ fontSize: 20, lineHeight: '22px' }}>{renderIcon(step)}</span>
        <Flex vertical>
          <Text strong>{step.label}</Text>
          <Text type={step.status === 'error' ? 'danger' : 'secondary'}>{step.detail}</Text>
        </Flex>
      </Flex>
    )
  }

  return (
    <AdaptiveDialog
      open={dialogOpen}
      onClose={closeDialog}
      title={title}
      footer={
        <Flex justify="flex-end">
          <Button onClick={closeDialog}>Close</Button>
        </Flex>
      }
    >
      <Flex vertical gap={16} role="list" aria-label="Progress">
        {steps.map(renderStep)}
      </Flex>
    </AdaptiveDialog>
  )
}
