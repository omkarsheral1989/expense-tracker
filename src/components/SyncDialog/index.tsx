import { CheckCircleFilled, ClockCircleOutlined, CloseCircleFilled, LoadingOutlined } from '@ant-design/icons'
import { App, Button, Flex, Typography, theme } from 'antd'
import { getDb } from '../../db/client.ts'
import { useAppNavigate } from '../../hooks/useAppNavigate'
import { useAsyncData } from '../../hooks/useAsyncData'
import { useLeaveWarning } from '../../hooks/useLeaveWarning'
import { ROUTES } from '../../routes.ts'
import { dateService } from '../../services/dateService'
import { syncService } from '../../services/syncService'
import { useSyncStore } from '../../stores/useSyncStore'
import type { SyncScope, SyncStep } from '../../stores/useSyncStore/types.ts'
import { AdaptiveDialog } from '../AdaptiveDialog'

const { Text } = Typography

/** The line and message after a sync that brought in changes by other members (PRD 5.18). */
function newChangesText(count: number) {
  return `${count} new ${count === 1 ? 'change' : 'changes'} in your groups`
}

/** How long the message after closing the dialog stays, long enough to press Open. */
const NEW_CHANGES_MESSAGE_SECONDS = 6

/**
 * The progress of a sync (PRD 5.8): one line per step (the backup,
 * then each group), each with a spinner, a tick, a clock (waiting for the
 * group's creator) or a cross, and what it is doing or what went wrong. Closing
 * it is not possible while a run goes on (the app behind stays dimmed): the
 * footer has Stop instead of Close, which cancels the run safely, since every
 * step can be repeated. Once a run has ended the footer says when the last sync of what it ran finished, and after Drive
 * access ran out it offers Continue. While a run goes on, the browser asks
 * before the tab is closed.
 */
export function SyncDialog() {
  const { dialogOpen, title, steps, scope, running, resume, dataVersion, stopping, newEvents, closeDialog, requestStop } = useSyncStore()
  const { token } = theme.useToken()
  const { message } = App.useApp()
  const navigate = useAppNavigate()
  useLeaveWarning(running)
  const { state } = useAsyncData(() => lastSyncedAt(scope), `${scopeKey(scope)}:${dataVersion}`)
  const lastSynced = !running && state.status === 'ready' ? state.data : null

  function openActivity() {
    closeDialog()
    navigate(ROUTES.activity)
  }

  // Closing after a sync that brought changes leaves a message to open them from.
  function handleClose() {
    closeDialog()
    if (running || newEvents === 0) return
    const key = 'new-changes'
    message.open({
      key,
      type: 'info',
      duration: NEW_CHANGES_MESSAGE_SECONDS,
      content: (
        <>
          {newChangesText(newEvents)}{' '}
          <Button
            type="link"
            size="small"
            onClick={() => {
              message.destroy(key)
              navigate(ROUTES.activity)
            }}
          >
            Open
          </Button>
        </>
      ),
    })
  }

  function renderNewChanges() {
    if (running || newEvents === 0) return null
    return (
      <Flex gap={12} align="center" role="listitem">
        <Text>{newChangesText(newEvents)}</Text>
        <Button type="link" size="small" onClick={openActivity}>
          Open Activity
        </Button>
      </Flex>
    )
  }

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
          {running ? (
            <Button onClick={requestStop} disabled={stopping}>
              {stopping ? 'Stopping…' : 'Stop'}
            </Button>
          ) : (
            <Button onClick={handleClose}>Close</Button>
          )}
        </Flex>
      </Flex>
    )
  }

  return (
    <AdaptiveDialog
      open={dialogOpen}
      onClose={handleClose}
      title={title}
      footer={renderFooter()}
      dismissible={!running}
    >
      <Flex vertical gap={16} role="list" aria-label="Progress">
        {steps.map(renderStep)}
        {renderNewChanges()}
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
