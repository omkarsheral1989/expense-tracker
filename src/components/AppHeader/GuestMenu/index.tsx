import { GOOGLE_CLIENT_ID } from '../../../config.ts'
import { ConfiguredGuestMenu } from './ConfiguredGuestMenu'
import { NotConfiguredGuestMenu } from './NotConfiguredGuestMenu'

/** The guest's avatar menu (see `GuestMenuView`). */
export function GuestMenu() {
  return GOOGLE_CLIENT_ID ? <ConfiguredGuestMenu /> : <NotConfiguredGuestMenu />
}
