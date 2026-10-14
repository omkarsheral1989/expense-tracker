import type { Profile } from '../googleProfileService/types.ts'
import { DEVICE_KEY } from './constants.ts'
import { deviceRecordSchema } from './schemas.ts'
import type { DeviceRecord, GoogleSignInResult } from './types.ts'

function read(): DeviceRecord | null {
  try {
    const raw = localStorage.getItem(DEVICE_KEY)
    if (!raw) return null
    const parsed = deviceRecordSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null // storage blocked, or not valid JSON
  }
}

function write(record: DeviceRecord): DeviceRecord {
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(record))
  } catch {
    // The app still works for this visit; the record is read again next time.
  }
  return record
}

/**
 * What this device knows about its one set of data (ADR-035). The data is not
 * split into guest and signed-in parts: a guest's data becomes the account's
 * when they sign in, and stays on the device after signing out.
 */
export const deviceService = {
  /** The record, or null before anyone has used the app on this device. */
  read,

  /**
   * The record to use as a guest: the existing one (so "Continue as a guest"
   * shows whatever is already on the device), or a new one with a fresh
   * dataset and a fresh id for the guest's person.
   */
  forGuest(): DeviceRecord {
    return (
      read() ??
      write({ datasetId: crypto.randomUUID(), userPersonId: crypto.randomUUID(), owner: null })
    )
  },

  /**
   * The record to use for a Google sign-in. The first account to sign in becomes
   * the owner of the data on the device, guest data included; the same account
   * can sign in again; any other account is refused. With no record yet (or one
   * made before guests existed) the account's own database is the data, as it
   * always was.
   */
  forGoogle(profile: Profile): GoogleSignInResult {
    const owner = { accountId: profile.id, email: profile.email }
    const existing = read()

    if (!existing) {
      return { ok: true, record: write({ datasetId: profile.id, userPersonId: null, owner }) }
    }
    if (existing.owner && existing.owner.accountId !== profile.id) {
      return { ok: false, ownerEmail: existing.owner.email }
    }
    return { ok: true, record: write({ ...existing, owner }) }
  },

  /** Remembers which person is the user once it has been found (or merged). */
  setUserPersonId(userPersonId: string): DeviceRecord | null {
    const existing = read()
    return existing ? write({ ...existing, userPersonId }) : null
  },
}
