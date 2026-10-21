import { App } from 'antd'
import { SyncIconButton } from '../../SyncIconButton'

type Props = {
  /** Starts the Google sign-in, which makes that account the owner of this device's data. */
  onSignIn: () => void
}

/** A guest's Sync button: it explains that sync needs a Google sign-in, and offers one. */
export function GuestSyncButtonView({ onSignIn }: Props) {
  const { modal } = App.useApp()

  function askToSignIn() {
    modal.confirm({
      title: 'Sign in to sync',
      content:
        'Backup and sync use your Google Drive, so they need a Google sign-in. Your data on this device stays as it is.',
      okText: 'Sign in with Google',
      cancelText: 'Cancel',
      // Called from the button's click, so Google's window may open.
      onOk: onSignIn,
    })
  }

  return <SyncIconButton tip="Sync and back up" onClick={askToSignIn} />
}
