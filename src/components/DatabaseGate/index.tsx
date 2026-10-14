import type { ReactNode } from 'react'
import { Button, Flex, Result, Spin, Typography } from 'antd'
import { useAuthStore } from '../../stores/useAuthStore'
import type { Profile } from '../../services/googleProfileService/types.ts'
import { useDatabaseSession } from '../../hooks/useDatabaseSession'
import { CenteredMessage } from '../CenteredMessage'

const { Text } = Typography

type Props = {
  children: ReactNode
  /**
   * Shown above the loading, locked and error screens, and not once the data is
   * ready (the page decides then whether it has a header). It keeps Sign out
   * within reach while the data cannot be used. Comes from `SignedInLayout`.
   */
  header?: ReactNode
}

/**
 * Opens the signed-in user's database and shows `children` once it is ready.
 * Until then it shows a loading screen, or explains what went wrong: the app is
 * open in another tab, or the database could not be opened.
 */
export function DatabaseGate({ children, header }: Props) {
  const profile = useAuthStore((state) => state.profile)

  // Signed-out visitors are sent away by `RequireAuth` before this matters.
  return profile ? (
    <OpenDatabase profile={profile} header={header}>
      {children}
    </OpenDatabase>
  ) : null
}

function OpenDatabase({
  profile,
  header,
  children,
}: Props & { profile: Profile }) {
  const { state, retry } = useDatabaseSession(profile.id)
  const signOut = useAuthStore((authState) => authState.signOut)

  function renderLoading() {
    return (
      <CenteredMessage>
        <Flex vertical align="center" gap={16}>
          <Spin size="large" />
          <Text type="secondary">Opening your data…</Text>
        </Flex>
      </CenteredMessage>
    )
  }

  function renderLocked() {
    return (
      <CenteredMessage>
        <Result
          status="warning"
          title="OwnLedger is open in another tab"
          subTitle="Your data can only be open in one tab at a time. Close the other tab or window, then try again."
          extra={<Button type="primary" onClick={retry}>Try again</Button>}
        />
      </CenteredMessage>
    )
  }

  function renderError(error: Error) {
    return (
      <CenteredMessage>
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
      </CenteredMessage>
    )
  }

  function withHeader(screen: ReactNode) {
    return (
      <>
        {header}
        {screen}
      </>
    )
  }

  switch (state.status) {
    case 'ready':
      return children
    case 'locked':
      return withHeader(renderLocked())
    case 'error':
      return withHeader(renderError(state.error))
    case 'loading':
      return withHeader(renderLoading())
  }
}
