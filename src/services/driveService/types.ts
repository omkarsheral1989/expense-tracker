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

/** Drive's API for one access token: the calls the app makes, nothing else. */
export type DriveClient = {
  /** The app's file or folder of this kind owned by the user, under `parentId` when given, or null. */
  findOwn(kind: DriveItemKind, parentId?: string): Promise<DriveFile | null>
  /** A new folder, tagged with its kind. */
  createFolder(name: string, kind: DriveItemKind, parentId?: string): Promise<DriveFile>
  /** A new JSON file, tagged with its kind. */
  createJson(name: string, kind: DriveItemKind, parentId: string, content: unknown): Promise<DriveFile>
  /** Replaces a file's content with JSON. */
  updateJson(fileId: string, content: unknown): Promise<DriveFile>
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
}
