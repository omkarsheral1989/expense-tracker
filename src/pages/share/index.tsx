import { Spin } from 'antd'
import { App as AntApp } from 'antd'
import { useEffect, useRef } from 'react'
import { useAppNavigate } from '../../hooks/useAppNavigate'
import { CenteredMessage } from '../../components/CenteredMessage'
import { MAX_RECEIPTS_PER_EXPENSE } from '../../db/constants.ts'
import { getDb } from '../../db/client.ts'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { sharedFiles } from '../../pwa/sharedFiles.ts'
import { ROUTES } from '../../routes.ts'
import { groupService } from '../../services/groupService'
import { logService } from '../../services/logService'
import { draftFromShare } from './utils.ts'

const log = logService.scope('share')

/**
 * Where the browser lands after another app shared pictures or text with
 * OwnLedger (PRD 5.11). It opens the add-expense page of the most recently
 * active group with the pictures as receipts and the text as notes, or the home
 * page when there is nothing to add or no group to add it to. The held share is
 * removed as soon as it has been taken.
 */
export function SharePage() {
  const user = useCurrentUser()
  const navigate = useAppNavigate()
  const { message } = AntApp.useApp()
  // React runs effects twice in development; a share is taken only once.
  const started = useRef(false)

  const userId = user?.personId
  useEffect(() => {
    if (!userId || started.current) return
    started.current = true

    async function open(userId: string) {
      try {
        const items = await sharedFiles.read()
        if (!items) {
          log.info('Share page opened with nothing held, going home')
          navigate(ROUTES.home, { replace: true })
          return
        }
        const groups = await groupService.listGroups(await getDb(), userId)
        if (groups.length === 0) {
          log.info('Share dropped, the user has no group', { pictures: items.pictures.length })
          message.info('Create a group first to add a shared receipt.')
          navigate(ROUTES.home, { replace: true })
          return
        }
        if (items.leftOut > 0) {
          message.warning(`An expense can have up to ${MAX_RECEIPTS_PER_EXPENSE} photos.`)
        }
        log.info('Share opened in Add expense', {
          groupId: groups[0].id,
          pictures: items.pictures.length,
          leftOut: items.leftOut,
        })
        navigate(ROUTES.newExpense(groups[0].id), { replace: true, state: { draft: draftFromShare(items) } })
      } catch (error) {
        log.error('Share could not be opened', logService.errorFields(error))
        navigate(ROUTES.home, { replace: true })
      } finally {
        await sharedFiles.clear().catch(() => {})
      }
    }
    void open(userId)
  }, [userId, navigate, message])

  return (
    <CenteredMessage>
      <title>Opening your receipt · OwnLedger</title>
      <Spin size="large" aria-label="Opening your receipt" />
    </CenteredMessage>
  )
}
