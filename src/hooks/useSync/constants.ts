import type { DriveTokenProblem } from '../useDriveToken/types.ts'

/** What to tell the user when Drive access could not be had. */
export const DRIVE_TOKEN_MESSAGES: Record<DriveTokenProblem, string> = {
  unavailable: "Couldn't reach Google. Check your connection and try again.",
  denied: 'OwnLedger needs access to your Drive to sync. Press Sync to try again.',
  blocked: 'The sign-in window was blocked. Allow pop-ups and try again.',
  wrongAccount: 'Choose the Google account you signed in with to sync.',
}

export const OFFLINE_MESSAGE = 'Sync needs an internet connection.'
export const EXPIRED_MESSAGE = 'Sign-in to Drive expired. Press Sync to continue.'

export const OUT_OF_SPACE_MESSAGE = 'This device is out of space. Free some space, then restore again.'

/** "1 photo" or "N photos". */
export function photoCount(count: number) {
  return count === 1 ? '1 photo' : `${count} photos`
}
