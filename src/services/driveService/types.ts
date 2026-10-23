import type { DRIVE_ITEM_KINDS } from './constants.ts'

/** What the app tags a Drive file or folder as ('root', 'backup', 'backup-file'). */
export type DriveItemKind = (typeof DRIVE_ITEM_KINDS)[keyof typeof DRIVE_ITEM_KINDS]

/** A file or folder in Drive, with the fields the app asks for. */
export type DriveFile = {
  id: string
  name: string
  modifiedTime?: string
  properties?: Record<string, string>
}

/** A failure that stops a whole sync run (ADR-044): Drive access ran out, the connection dropped, the user's Drive is full, or the user pressed Stop. */
export type StoppingProblem = 'expired' | 'connection' | 'driveFull' | 'stopped'

/** How the client waits before a retry; tests pass one that does not wait. */
export type ClientOptions = {
  wait?: (ms: number) => Promise<void>
  /** Aborting it stops the request in flight and every one after it, with `DriveStopped`. */
  signal?: AbortSignal
  /** How long a request may take before it counts as a dropped connection; defaults to `REQUEST_TIMEOUT_MS`. */
  timeoutMs?: number
}

/** Whose files a search covers: the user's own, others' shared with the user, or both. */
export type DriveOwner = 'me' | 'others' | 'any'

/** Drive's API for one access token: the calls the app makes, nothing else. */
export type DriveClient = {
  /**
   * The app's file or folder of this kind owned by the user, under `parentId`
   * and with these properties when given (the oldest when there are several), or null.
   */
  findOwn(kind: DriveItemKind, parentId?: string, properties?: Record<string, string>): Promise<DriveFile | null>
  /** Every file or folder of this kind the user can see, by owner and properties, the oldest first. */
  findAll(kind: DriveItemKind, owner: DriveOwner, properties?: Record<string, string>): Promise<DriveFile[]>
  /** A new folder, tagged with its kind and any further properties. */
  createFolder(name: string, kind: DriveItemKind, parentId?: string, properties?: Record<string, string>): Promise<DriveFile>
  /** A new JSON file, tagged with its kind and any further properties. */
  createJson(
    name: string,
    kind: DriveItemKind,
    parentId: string,
    content: unknown,
    properties?: Record<string, string>,
  ): Promise<DriveFile>
  /** Replaces a file's content with JSON, and sets any properties given (others are kept). */
  updateJson(fileId: string, content: unknown, properties?: Record<string, string>): Promise<DriveFile>
  /** A file's content as text. */
  download(fileId: string): Promise<string>
  /** Every file in a folder (not trashed), with its properties, across as many pages as Drive needs. */
  listChildren(parentId: string): Promise<DriveFile[]>
  /** A new file with this content (such as a photo), tagged with its kind and any further properties. */
  createFile(
    name: string,
    kind: DriveItemKind,
    parentId: string,
    content: Blob,
    properties?: Record<string, string>,
  ): Promise<DriveFile>
  /** A file's content as a Blob. */
  downloadBlob(fileId: string): Promise<Blob>
  /** Gives a file or folder another name. */
  rename(fileId: string, name: string): Promise<DriveFile>
  /** The emails a file or folder is shared with (its owner included), lower-cased. */
  sharedWith(fileId: string): Promise<string[]>
  /** Shares a file or folder with someone as an editor; Drive emails them. */
  share(fileId: string, email: string): Promise<void>
  /** A shortcut to `targetId` in `parentId`, tagged with its kind and properties. */
  createShortcut(
    name: string,
    kind: DriveItemKind,
    parentId: string,
    targetId: string,
    properties?: Record<string, string>,
  ): Promise<DriveFile>
}
