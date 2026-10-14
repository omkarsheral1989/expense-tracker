import { createContext } from 'react'
import type { CurrentUser } from './types.ts'

/** Provided by `DatabaseGate` once the user's data is open (and by tests' `renderPage`). */
export const CurrentUserContext = createContext<CurrentUser | null>(null)
