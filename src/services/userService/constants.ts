/** What a guest's own person is called until they sign in. */
export const GUEST_NAME = 'Guest'

/**
 * The `updated_at` of a person whose name came from their Google account and
 * not from someone typing it: the earliest time there is, so any typed name is
 * newer and wins a sync (ADR-044, "Names from Google give way").
 */
export const GOOGLE_NAME_TIME = new Date(0)
