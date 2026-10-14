/** Who is using the app: a Google account or a guest, with their person in the data. */
export type CurrentUser = {
  /** The user's own person in the data; every service call is made as this person. */
  personId: string
  name: string
  /** Null for a guest who has never signed in. */
  email: string | null
  /** Using the app without being signed in with Google. */
  isGuest: boolean
  /** Names the database and photo store the user's data is in. */
  datasetId: string
}
