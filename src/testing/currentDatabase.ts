import type { Database } from '../db/client.ts'

/**
 * The in-memory database a component test runs against. It lives in a file of
 * its own, with no imports besides a type, so that a test's mock of the real
 * database client can read it without a circular import.
 */
export const testDatabase: { current: Database | null } = { current: null }
