import { REQUIRE_INSTALL } from '../../config.ts'
import { useInstall } from '../useInstall'

/**
 * Whether getting started is locked behind installing the app: only on
 * iPhone/iPad (an installed iOS app has its own storage, separate from
 * Safari), only while not installed, and only until the user chooses to skip
 * (until the page is reloaded). Used by the welcome page and the Open
 * OwnLedger page. See `gated` on `InstallCard`.
 */
export function useInstallGate() {
  const install = useInstall()
  const gated =
    REQUIRE_INSTALL && install.platform === 'ios' && !install.installed && !install.skipped
  return { ...install, gated }
}
