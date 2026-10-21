/** Drive's REST API for metadata, and its upload endpoint for file contents. */
export const DRIVE_API = 'https://www.googleapis.com/drive/v3/files'
export const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files'

export const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'

/** The Drive property that tags everything the app creates (ADR-044), and its values. */
export const OWNLEDGER_PROPERTY = 'ownledger'
export const DRIVE_ITEM_KINDS = {
  root: 'root',
  backup: 'backup',
  backupFile: 'backup-file',
} as const

/** The folder names people see in their Drive. The app never finds anything by name. */
export const ROOT_FOLDER_NAME = 'OwnLedger'
export const BACKUP_FOLDER_NAME = 'Backup'
export const BACKUP_FILE_NAME = 'backup.json'

/** Full Drive access (ADR-009), asked for on the first Sync, with the basic scopes to check whose Drive it is. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'
