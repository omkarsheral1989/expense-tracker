import { Flex } from 'antd'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { belowStatusBar } from '../../theme/safeArea.ts'
import { CreateGroupForm } from './components/CreateGroupForm'

/** Where a signed-in user starts a new group. */
export function CreateGroupPage() {
  const user = useCurrentUser()

  // Visitors who are not in the app are sent away by `RequireAuth` before this matters.
  if (!user) return null

  return (
    <Flex justify="center" style={{ padding: `${belowStatusBar(32)} 16px 32px` }}>
      <title>Create a group · OwnLedger</title>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <CreateGroupForm creatorId={user.personId} />
      </div>
    </Flex>
  )
}
