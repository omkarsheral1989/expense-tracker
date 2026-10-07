import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from './authStore.ts'

/** Sends signed-out visitors back to the welcome page. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const profile = useAuth((state) => state.profile)
  return profile ? children : <Navigate to="/" replace />
}
