import { useEffect } from 'react'
import { App, Button } from 'antd'
import { useRegisterSW } from 'virtual:pwa-register/react'

const UPDATE_KEY = 'pwa-update'

/**
 * Registers the service worker and tells the user when the app is ready to
 * work offline or when a new version is waiting.
 */
export function PwaUpdatePrompt() {
  const { message, notification } = App.useApp()
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW()

  useEffect(() => {
    if (offlineReady) message.success('OwnLedger is ready to work offline.')
  }, [offlineReady, message])

  useEffect(() => {
    if (!needRefresh) return
    notification.info({
      key: UPDATE_KEY,
      title: 'New version available',
      description: 'Reload to get the latest OwnLedger.',
      duration: 0,
      placement: 'bottom',
      actions: (
        <Button
          type="primary"
          size="small"
          onClick={() => updateServiceWorker(true)}
        >
          Reload
        </Button>
      ),
    })
  }, [needRefresh, notification, updateServiceWorker])

  return null
}
