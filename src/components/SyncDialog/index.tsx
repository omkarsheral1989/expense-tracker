import { CheckCircleFilled, ClockCircleOutlined, CloseCircleFilled, LoadingOutlined } from '@ant-design/icons'
import { Button, Flex, Typography, theme } from 'antd'
import { getDb } from '../../db/client.ts'
import { useAsyncData } from '../../hooks/useAsyncData'
import { useLeaveWarning } from '../../hooks/useLeaveWarning'
import { dateService } from '../../services/dateService'
import { syncService } from '../../services/syncService'
import { useSyncStore } from '../../stores/useSyncStore'
import type { SyncScope, SyncStep } from '../../stores/useSyncStore/types.ts'
import { AdaptiveDialog } from '../AdaptiveDialog'

const { Text } = Typography

/**
 * The progress of a sync (PRD 5.8): one line per step (the backup,
 * then each group), each with a spinner, a tick, a clock (waiting for the
 * group's creator) or a cross, and what it is doing or what went wrong. Closing
 * it does not stop the run; pressing Sync again opens it. Once a run has ended
 * the footer says when the last sync of what it ran finished, and after Drive
 * access ran out it offers Continue. While a run goes on, the browser asks
 * before the tab is closed.
 */
export function SyncDialog() {
  const { dialogOpen, title, steps, scope, running, resume, dataVersion, closeDialog } = useSyncStore()
  const { token } = theme.useToken()
  useLeaveWarning(running)
  const { state } = useAsyncData(() => lastSyncedAt(scope), `${scopeKey(scope)}:${dataVersion}`)
  const lastSynced = !running && state.status === 'ready' ? state.data : null

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

  function renderFooter() {
    return (
      <Flex justify="space-between" align="center" gap={12}>
        <Text type="secondary">
          {lastSynced && `Last synced ${dateService.formatTimeAgo(lastSynced, new Date(), navigator.language)}`}
        </Text>
        <Flex gap={8}>
          {resume && !running && (
            // Called from this click, so Google's window may open.
            <Button type="primary" onClick={resume}>
              Continue
            </Button>
          )}
          <Button onClick={closeDialog}>Close</Button>
        </Flex>
      </Flex>
    )
  }

  return (
    <AdaptiveDialog
      open={dialogOpen}
      onClose={closeDialog}
      title={title}
      footer={renderFooter()}
    >
      <Flex vertical gap={16} role="list" aria-label="Progress">
        {steps.map(renderStep)}
      </Flex>
    </AdaptiveDialog>
  )
}

/** When the last sync of what a run synced finished: everything, or one group. */
async function lastSyncedAt(scope: SyncScope): Promise<Date | null> {
  const db = await getDb()
  return scope.kind === 'group' ? syncService.lastGroupSyncAt(db, scope.groupId) : syncService.lastSyncedAt(db)
}

function scopeKey(scope: SyncScope) {
  return scope.kind === 'group' ? `group:${scope.groupId}` : scope.kind
}
