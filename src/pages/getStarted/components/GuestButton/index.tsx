import { Button } from 'antd'
import { useAuthStore } from '../../../../stores/useAuthStore'

/** Continues without an account; the data stays on this device (ADR-035). */
export function GuestButton() {
  const startGuest = useAuthStore((state) => state.startGuest)

  return (
    <Button size="large" onClick={startGuest}>
      Continue as a guest
    </Button>
  )
}
