import { Flex } from 'antd'
import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router'
import { CenteredMessage } from '../../components/CenteredMessage'
import { FormLoadingShell } from '../../components/FormLoadingShell'
import { knownGroupFrom } from '../group/utils.ts'
import { LoadingMessage } from '../../components/LoadingMessage'
import { LoadError } from '../../components/LoadError'
import { ROUTES } from '../../routes.ts'
import { TintedPageBackground } from '../../components/TintedPageBackground'
import { slide } from '../../hooks/useAppNavigate/utils.ts'
import { GroupNotFound } from '../../components/GroupNotFound'
import { getDb } from '../../db/client.ts'
import { useAsyncData } from '../../hooks/useAsyncData'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { expenseService } from '../../services/expenseService'
import { groupService } from '../../services/groupService'
import { aboveScreenEdge, belowStatusBar, HEADER_TOP_PADDING } from '../../theme/safeArea.ts'
import { SettleUpForm } from './components/SettleUpForm'

/** A column about 560 px wide, centered, like the add-expense page. */
const COLUMN_STYLE = { width: '100%', maxWidth: 560, margin: '0 auto', padding: `${belowStatusBar(HEADER_TOP_PADDING)} 16px ${aboveScreenEdge(24)}` } as const

/** Where a signed-in user records a payment between two members of one of their groups. */
export function SettleUpPage() {
  const user = useCurrentUser()
  const { id = '' } = useParams()
  // What the group's page knew when it opened this one, if it did (ADR-054).
  const known = knownGroupFrom(useLocation().state, id)

  const userId = user?.personId ?? ''
  const datasetId = user?.datasetId ?? ''
  const { state, retry } = useAsyncData(async () => {
    const db = await getDb()
    const group = await groupService.getGroup(db, userId, id)
    if (!group) return null
    return { group, recentCurrencies: await expenseService.recentCurrencies(db, userId) }
  }, `${userId}:${id}`)

  // Opened from the group page's pill while the group is still being read, the pill grows into this page's loading view (PRD 5.16);
  // its header and background must stay the same elements until it has (the browser ends the transition if they leave the page),
  // so the loading view stays until the transition ends, even when the group has been read meanwhile.
  const [morphing, setMorphing] = useState(() => slide.morph !== null && state.status === 'loading')
  useEffect(() => {
    if (!morphing || !slide.morph) return
    let live = true
    void slide.morph.then(() => {
      if (live) setMorphing(false)
    })
    return () => {
      live = false
    }
  }, [morphing])

  // Visitors who are not in the app are sent away by `RequireAuth` before this matters.
  if (!user) return null

  function renderContent() {
    switch (state.status) {
      case 'loading':
        return null
      case 'error':
        return (
          <LoadError title="Couldn't load this group" onRetry={retry} error={state.status === 'error' ? state.error : undefined} backTo={ROUTES.group(id)} />
        )
      case 'ready':
        if (!state.data) {
          return (
            <>
              <title>Group not found · OwnLedger</title>
              <GroupNotFound />
            </>
          )
        }
        return (
          <SettleUpForm
            key={state.data.group.id}
            group={state.data.group}
            datasetId={datasetId}
            userId={userId}
            recentCurrencies={state.data.recentCurrencies}
          />
        )
    }
  }

  if (state.status === 'loading' || (morphing && known)) {
    if (!known) return <LoadingMessage label="Loading the group" />
    return (
      <>
        {/* The plain page background the group page's pill grows into (PRD 5.16). */}
        <TintedPageBackground color={undefined} />
        <title>Settle up · OwnLedger</title>
        <FormLoadingShell heading="Settle up" backTo={ROUTES.group(id)} label="Loading the group" group={known} />
      </>
    )
  }

  // A message (couldn't load, group not found) is centered on the screen; the
  // form and its loading placeholder sit in the column.
  if (state.status === 'error' || (state.status === 'ready' && !state.data)) {
    return <CenteredMessage>{renderContent()}</CenteredMessage>
  }

  return (
    <Flex vertical style={COLUMN_STYLE}>
      <TintedPageBackground color={undefined} />
      {renderContent()}
    </Flex>
  )
}
