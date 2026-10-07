import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useAuthStore } from '../../stores/useAuthStore'

/** Sends signed-out visitors back to the welcome page. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const profile = useAuthStore((state) => state.profile)
  return profile ? children : <Navigate to="/" replace />
}
