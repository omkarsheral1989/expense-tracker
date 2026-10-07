import type { ReactNode } from 'react'
import { Button, Flex, Result, Spin, Typography } from 'antd'
import { useAuthStore } from '../../stores/useAuthStore'
import type { Profile } from '../../services/googleProfileService/types.ts'
import { useDatabaseSession } from '../../hooks/useDatabaseSession'

const { Text } = Typography

type Props = {
  children: ReactNode
}

/**
 * Opens the signed-in user's database and shows `children` once it is ready.
 * Until then it shows a loading screen, or explains what went wrong: the app is
 * open in another tab, or the database could not be opened.
 */
export function DatabaseGate({ children }: Props) {
  const profile = useAuthStore((state) => state.profile)

  // Signed-out visitors are sent away by `RequireAuth` before this matters.
  return profile ? (
    <OpenDatabase profile={profile}>{children}</OpenDatabase>
  ) : null
}

function OpenDatabase({
  profile,
  children,
}: Props & { profile: Profile }) {
  const { state, retry } = useDatabaseSession(profile.id)
  const signOut = useAuthStore((authState) => authState.signOut)

  function renderLoading() {
    return (
      <Flex
        vertical
        align="center"
        justify="center"
        gap={16}
        style={{ minHeight: '60vh' }}
      >
        <Spin size="large" />
        <Text type="secondary">Opening your data…</Text>
      </Flex>
    )
  }

  function renderLocked() {
    return (
      <Result
        status="warning"
        title="OwnLedger is open in another tab"
        subTitle="Your data can only be open in one tab at a time. Close the other tab or window, then try again."
        extra={<Button type="primary" onClick={retry}>Try again</Button>}
      />
    )
  }

  function renderError(error: Error) {
    return (
      <Result
        status="error"
        title="Couldn't open your data"
        subTitle={
          <>
            Nothing was lost. Try again, and if it keeps failing, reload the
            page. <Text type="secondary" code>{error.message}</Text>
          </>
        }
        extra={[
          <Button key="retry" type="primary" onClick={retry}>
            Try again
          </Button>,
          <Button key="sign-out" onClick={signOut}>
            Sign out
          </Button>,
        ]}
      />
    )
  }

  switch (state.status) {
    case 'ready':
      return children
    case 'locked':
      return renderLocked()
    case 'error':
      return renderError(state.error)
    case 'loading':
      return renderLoading()
  }
}
