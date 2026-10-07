import { Outlet } from 'react-router'
import { AppHeader } from '../AppHeader'
import { DatabaseGate } from '../DatabaseGate'

/**
 * What every signed-in page sits inside: the header, then the page once the
 * user's data is open. The header stays outside the gate so Sign out is
 * available even while the data is loading or cannot be opened.
 */
export function SignedInLayout() {
  return (
    <>
      <AppHeader />
      <DatabaseGate>
        <Outlet />
      </DatabaseGate>
    </>
  )
}
