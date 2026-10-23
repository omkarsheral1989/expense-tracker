import { useEffect, type ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useAuthStore } from '../../stores/useAuthStore'

type Props = {
  children: ReactNode
  /** Called when a visitor who is neither signed in nor a guest is turned away. */
  onDenied?: () => void
}

/** Sends visitors who are neither signed in nor a guest back to the welcome page. */
export function RequireAuth({ children, onDenied }: Props) {
  const inApp = useAuthStore((state) => state.profile !== null || state.guest)

  useEffect(() => {
    if (!inApp) onDenied?.()
  }, [inApp, onDenied])

  return inApp ? children : <Navigate to="/" replace />
}
