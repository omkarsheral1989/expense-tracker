import type { Profile } from '../googleProfileService/types.ts'

/** The Google account that owns the data on this device. */
export type DeviceOwner = {
  /** Google's stable account id. */
  accountId: string
  email: string
}

/**
 * What this device knows about its one set of data: which database and photo
 * store it is in, who the user's person is, and which Google account (if any)
 * owns it. A guest's data has no owner until they sign in.
 */
export type DeviceRecord = {
  /** Names the PGlite database and the photo store. */
  datasetId: string
  /** The id of the user's person in the data; null until it has been found. */
  userPersonId: string | null
  owner: DeviceOwner | null
}

/** What a Google sign-in on this device leads to. */
export type GoogleSignInResult =
  | { ok: true; record: DeviceRecord }
  /** The data belongs to another Google account. */
  | { ok: false; ownerEmail: string }

export type { Profile }
