import type { PhotoDirection } from '../../services/syncService/types.ts'
import type { DriveTokenProblem } from '../useDriveToken/types.ts'

/** What to tell the user when Drive access could not be had. */
export const DRIVE_TOKEN_MESSAGES: Record<DriveTokenProblem, string> = {
  unavailable: "Couldn't reach Google. Check your connection and try again.",
  denied: 'OwnLedger needs access to your Drive to sync. Press Sync to try again.',
  blocked: 'The sign-in window was blocked. Allow pop-ups and try again.',
  wrongAccount: 'Choose the Google account you signed in with to sync.',
}

export const OFFLINE_MESSAGE = 'Sync needs an internet connection.'
export const EXPIRED_MESSAGE = 'Sign-in to Drive expired. Press Continue to carry on.'
export const CONNECTION_MESSAGE = 'Lost the connection. Press Sync to try again.'
export const DRIVE_FULL_MESSAGE = 'Your Google Drive is full. Free some space in Drive, then sync again.'

export const OUT_OF_SPACE_MESSAGE = 'This device is out of space. Free some space, then sync again.'

/** What the Backup line says as a full Sync goes on: getting the backup in Drive first, writing it after the groups. */
export const BACKUP_DETAILS = {
  getting: 'Getting your backup…',
  downloading: 'Downloading photos…',
  waiting: 'Waiting for your groups…',
  saving: 'Saving your data…',
  uploading: 'Backing up photos…',
  done: 'Backed up',
  stopped: 'Not backed up: the sync stopped.',
} as const

export const BACKUP_FAILED_MESSAGE = "Couldn't back up. Press Sync to try again."

/** "1 photo" or "N photos". */
export function photoCount(count: number) {
  return count === 1 ? '1 photo' : `${count} photos`
}

export const GROUP_STEP_DETAILS = {
  receiving: 'Getting changes…',
  sending: 'Sending your changes…',
  synced: 'Synced',
} as const

export const GROUP_FAILED_MESSAGE = "Couldn't sync this group. Press Sync to try again."

/** What a group's line says while its photos move, followed by "2 of 5". */
export const GROUP_PHOTO_DETAILS: Record<PhotoDirection, string> = {
  sending: 'Sending photos…',
  receiving: 'Getting photos…',
}

export const SHARED_FAILED_MESSAGE = "Couldn't look for groups shared with you. Press Sync to try again."
