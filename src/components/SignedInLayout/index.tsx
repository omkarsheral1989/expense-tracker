import { Flex } from 'antd'
import { Outlet, useMatch } from 'react-router'
import { ROUTES } from '../../routes.ts'
import { AppHeader } from '../AppHeader'
import { DatabaseGate } from '../DatabaseGate'

/**
 * What every signed-in page sits inside. Only the home page has the header
 * (the logo and the avatar menu with Sign out); the other pages start with
 * their own content and have Back buttons. While the user's data is loading or
 * cannot be opened, every page shows the header, so Sign out stays within reach.
 * The column is at least as high as the screen, so a page can fill what is left
 * below its header (`flex: 1`), for example to center an empty message.
 */
export function SignedInLayout() {
  const onHome = useMatch(ROUTES.home) !== null

  return (
    <Flex vertical style={{ minHeight: '100dvh' }}>
      <DatabaseGate header={<AppHeader />}>
        {onHome && <AppHeader />}
        <Outlet />
      </DatabaseGate>
    </Flex>
  )
}
