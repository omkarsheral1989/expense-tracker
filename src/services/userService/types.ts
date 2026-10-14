/** The user's own person, as found in the data. */
export type ResolvedUser = {
  personId: string
  name: string
  /** Null for a guest who has never signed in. */
  email: string | null
}
