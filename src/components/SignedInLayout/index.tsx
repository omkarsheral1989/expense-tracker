import { Flex } from 'antd'
import { Outlet, useMatch } from 'react-router'
import { ROUTES } from '../../routes.ts'
import { AppHeader } from '../AppHeader'
import { DatabaseGate } from '../DatabaseGate'
import { SideShade } from '../SideShade'
import { SyncDialog } from '../SyncDialog'
import { COLUMN_WIDTH } from './constants.ts'

/**
 * What every signed-in page sits inside. Only the home page has the header
 * (the logo and the avatar menu with Sign out); the other pages start with
 * their own content and have Back buttons. While the user's data is loading or
 * cannot be opened, every page shows the header, so Sign out stays within reach.
 * The column is at least as high as the screen, so a page can fill what is left
 * below its header (`flex: 1`), for example to center an empty message. The
 * sync dialog lives here, so a sync's progress stays reachable on every page.
 * The side shade lives here too, sized to the content column.
 */
export function SignedInLayout() {
  const onHome = useMatch(ROUTES.home) !== null

  return (
    <Flex vertical style={{ minHeight: '100dvh' }}>
      <SideShade columnWidth={COLUMN_WIDTH} />
      <DatabaseGate header={<AppHeader />}>
        {onHome && <AppHeader />}
        <Outlet />
        <SyncDialog />
      </DatabaseGate>
    </Flex>
  )
}
