/** Marks a file as an OwnLedger backup, and the version of its layout. */
export const BACKUP_APP = 'ownledger'
export const BACKUP_KIND = 'backup'
/** Marks a member's file of a group (ADR-044). */
export const GROUP_FILE_KIND = 'group'
export const BACKUP_FORMAT = 1

/** Rows written in one INSERT, well under Postgres's limit on parameters. */
export const INSERT_CHUNK_SIZE = 200
