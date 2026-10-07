import { Flex } from 'antd'
import { useAuthStore } from '../../stores/useAuthStore'
import { CreateGroupForm } from './components/CreateGroupForm'

/** Where a signed-in user starts a new group. */
export function CreateGroupPage() {
  const profile = useAuthStore((state) => state.profile)

  // Signed-out visitors are sent away by `RequireAuth` before this matters.
  if (!profile) return null

  return (
    <Flex justify="center" style={{ padding: '32px 16px' }}>
      <title>Create a group · OwnLedger</title>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <CreateGroupForm creator={{ email: profile.email, name: profile.name }} />
      </div>
    </Flex>
  )
}
