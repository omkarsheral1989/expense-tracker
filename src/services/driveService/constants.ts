/** Drive's REST API for metadata, and its upload endpoint for file contents. */
export const DRIVE_API = 'https://www.googleapis.com/drive/v3/files'
export const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files'

export const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'
export const SHORTCUT_MIME_TYPE = 'application/vnd.google-apps.shortcut'

/** The Drive property that tags everything the app creates (ADR-044), and its values. */
export const OWNLEDGER_PROPERTY = 'ownledger'
export const DRIVE_ITEM_KINDS = {
  root: 'root',
  backup: 'backup',
  backupFile: 'backup-file',
  backupPhotos: 'backup-photos',
  backupPhoto: 'backup-photo',
  groups: 'groups',
  group: 'group',
  memberFile: 'member-file',
  groupShortcut: 'group-shortcut',
  groupPhotos: 'group-photos',
  groupPhoto: 'group-photo',
} as const

/** The Drive properties that hold a photo's, group's and person's id on the app's files. */
export const PHOTO_ID_PROPERTY = 'ownledgerPhotoId'
export const GROUP_ID_PROPERTY = 'ownledgerGroupId'
export const PERSON_ID_PROPERTY = 'ownledgerPersonId'
/** On a member's shortcut: the folder it points at, so a shortcut to a lost folder is not taken for the new one's. */
export const FOLDER_ID_PROPERTY = 'ownledgerFolderId'

/** The folder names people see in their Drive. The app never finds anything by name. */
export const ROOT_FOLDER_NAME = 'OwnLedger'
export const BACKUP_FOLDER_NAME = 'Backup'
export const BACKUP_FILE_NAME = 'backup.json'
export const BACKUP_PHOTOS_FOLDER_NAME = 'photos'
export const GROUPS_FOLDER_NAME = 'Groups'
export const GROUP_PHOTOS_FOLDER_NAME = 'photos'

/** How long to wait before each retry of a request Drive refused for a moment (ADR-044): 3 retries. */
export const RETRY_DELAYS_MS = [1000, 2000, 4000]

/** Google's reasons for a refusal that is worth retrying, and the one for a full Drive. */
export const RATE_LIMIT_REASONS = ['rateLimitExceeded', 'userRateLimitExceeded']
export const DRIVE_FULL_REASON = 'storageQuotaExceeded'

/** Full Drive access (ADR-009), asked for on the first Sync, with the basic scopes to check whose Drive it is. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'
