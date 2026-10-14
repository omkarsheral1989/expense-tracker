import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useAuthStore } from '../../stores/useAuthStore'

/** Sends visitors who are neither signed in nor a guest back to the welcome page. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const inApp = useAuthStore((state) => state.profile !== null || state.guest)
  return inApp ? children : <Navigate to="/" replace />
}
