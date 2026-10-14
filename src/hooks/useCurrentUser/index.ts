import { useContext } from 'react'
import { CurrentUserContext } from './context.ts'
import type { CurrentUser } from './types.ts'

/**
 * The user of the open data, or null outside the signed-in pages. Pages call
 * the services as `user.personId`.
 */
export function useCurrentUser(): CurrentUser | null {
  return useContext(CurrentUserContext)
}
