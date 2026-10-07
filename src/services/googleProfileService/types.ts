export type Profile = {
  /** Google's stable account id (`sub`). Used to name the per-account database. */
  id: string
  email: string
  name: string
  picture?: string
}
