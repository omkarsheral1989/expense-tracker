import { useMemo, type ReactNode } from 'react'
import { Button, Flex, Result, Spin, Typography } from 'antd'
import { CurrentUserContext } from '../../hooks/useCurrentUser/context.ts'
import { useAsyncData } from '../../hooks/useAsyncData'
import { useDatabaseSession } from '../../hooks/useDatabaseSession'
import { deviceService } from '../../services/deviceService'
import type { DeviceRecord } from '../../services/deviceService/types.ts'
import type { Profile } from '../../services/googleProfileService/types.ts'
import { userService } from '../../services/userService'
import { useAuthStore } from '../../stores/useAuthStore'
import { useSyncStore } from '../../stores/useSyncStore'
import type { Database } from '../../db/client.ts'
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
 * Opens the device's data (the signed-in account's, or the guest's: it is one
 * set, ADR-035), finds the user's own person in it, and shows `children` once
 * both are ready. Until then it shows a loading screen, or explains what went
 * wrong: the app is open in another tab, the data could not be opened, or the
 * data belongs to another Google account.
 */
export function DatabaseGate({ children, header }: Props) {
  const profile = useAuthStore((state) => state.profile)
  const guest = useAuthStore((state) => state.guest)

  // Visitors with neither are sent away by `RequireAuth` before this matters.
  if (!profile && !guest) return null
  return (
    <OpenDatabase profile={profile} header={header}>
      {children}
    </OpenDatabase>
  )
}

type Opening = Props & { profile: Profile | null }

function OpenDatabase({ profile, header, children }: Opening) {
  // Which data this is. Idempotent: it only writes the record when it changes.
  const device = useMemo(
    () => (profile ? deviceService.forGoogle(profile) : { ok: true as const, record: deviceService.forGuest() }),
    [profile],
  )
  const signOut = useAuthStore((authState) => authState.signOut)

  if (!device.ok) {
    return (
      <>
        {header}
        <CenteredMessage>
          <Result
            status="warning"
            title="This device is already used by another account"
            subTitle={`This device's data belongs to ${device.ownerEmail}. Sign in with that account, or clear the app's data to use another.`}
            extra={<Button type="primary" onClick={signOut}>Sign out</Button>}
          />
        </CenteredMessage>
      </>
    )
  }
  return (
    <OpenData record={device.record} profile={profile} header={header}>
      {children}
    </OpenData>
  )
}

function OpenData({ record, profile, header, children }: Opening & { record: DeviceRecord }) {
  const { state, retry } = useDatabaseSession(record.datasetId)
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
              {profile ? 'Sign out' : 'Exit guest mode'}
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
      return (
        <WithUser db={state.db} record={record} profile={profile} header={header}>
          {children}
        </WithUser>
      )
    case 'locked':
      return withHeader(renderLocked())
    case 'error':
      return withHeader(renderError(state.error))
    case 'loading':
      return withHeader(renderLoading())
  }
}

/** Finds (or adds, or links) the user's own person, then shows the pages as that user. */
function WithUser({ db, record, profile, header, children }: Opening & { db: Database; record: DeviceRecord }) {
  // Found again after a sync, whose merge of the backup may give the user's person another id (ADR-044).
  const dataVersion = useSyncStore((syncState) => syncState.dataVersion)
  const { state, retry } = useAsyncData(async () => {
    const user = await userService.resolve(db, record, profile)
    if (user.personId !== record.userPersonId) deviceService.setUserPersonId(user.personId)
    return user
  }, `${record.datasetId}:${profile?.id ?? 'guest'}:${dataVersion}`, { keepPrevious: true })
  const signOut = useAuthStore((authState) => authState.signOut)

  const value = useMemo(
    () =>
      state.status === 'ready'
        ? { ...state.data, isGuest: profile === null, datasetId: record.datasetId }
        : null,
    [state, profile, record.datasetId],
  )

  if (state.status === 'error') {
    return (
      <>
        {header}
        <CenteredMessage>
          <Result
            status="error"
            title="Couldn't open your data"
            subTitle="Nothing was lost. Try again."
            extra={[
              <Button key="retry" type="primary" onClick={retry}>Try again</Button>,
              <Button key="sign-out" onClick={signOut}>{profile ? 'Sign out' : 'Exit guest mode'}</Button>,
            ]}
          />
        </CenteredMessage>
      </>
    )
  }
  if (!value) {
    return (
      <>
        {header}
        <CenteredMessage>
          <Flex vertical align="center" gap={16}>
            <Spin size="large" />
            <Text type="secondary">Opening your data…</Text>
          </Flex>
        </CenteredMessage>
      </>
    )
  }
  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>
}
