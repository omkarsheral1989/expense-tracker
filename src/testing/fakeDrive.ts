import { DriveAuthError } from '../services/driveService'
import { OWNLEDGER_PROPERTY } from '../services/driveService/constants.ts'
import type { DriveClient, DriveFile } from '../services/driveService/types.ts'

/** A file or folder in the fake Drive, with its parent and its content: text for JSON, a Blob for a picture. */
export type FakeDriveFile = DriveFile & { parentId?: string; content?: string; blob?: Blob; folder: boolean }

/**
 * An in-memory Google Drive for one user, with the same calls as the real
 * client (ADR-044). `files` shows what is stored; set `expired` to make every
 * call fail the way Drive does when access has run out.
 */
export function createFakeDrive() {
  const files = new Map<string, FakeDriveFile>()
  let count = 0
  const state = { expired: false }

  function check() {
    if (state.expired) throw new DriveAuthError()
  }

  function add(file: Omit<FakeDriveFile, 'id'>): DriveFile {
    const id = `file-${++count}`
    files.set(id, { ...file, id })
    return { id, name: file.name, properties: file.properties }
  }

  const client: DriveClient = {
    async findOwn(kind, parentId) {
      check()
      const found = [...files.values()].find(
        (file) => file.properties?.[OWNLEDGER_PROPERTY] === kind && (!parentId || file.parentId === parentId),
      )
      return found ? { id: found.id, name: found.name, properties: found.properties } : null
    },
    async createFolder(name, kind, parentId) {
      check()
      return add({ name, parentId, folder: true, properties: { [OWNLEDGER_PROPERTY]: kind } })
    },
    async createJson(name, kind, parentId, content) {
      check()
      return add({ name, parentId, folder: false, content: JSON.stringify(content), properties: { [OWNLEDGER_PROPERTY]: kind } })
    },
    async updateJson(fileId, content) {
      check()
      const file = files.get(fileId)
      if (!file) throw new Error(`No file ${fileId}`)
      file.content = JSON.stringify(content)
      return { id: file.id, name: file.name }
    },
    async download(fileId) {
      check()
      const content = files.get(fileId)?.content
      if (content === undefined) throw new Error(`No file ${fileId}`)
      return content
    },
    async listChildren(parentId) {
      check()
      return [...files.values()]
        .filter((file) => file.parentId === parentId)
        .map(({ id, name, properties }) => ({ id, name, properties }))
    },
    async createFile(name, kind, parentId, content, properties = {}) {
      check()
      return add({ name, parentId, folder: false, blob: content, properties: { ...properties, [OWNLEDGER_PROPERTY]: kind } })
    },
    async downloadBlob(fileId) {
      check()
      const blob = files.get(fileId)?.blob
      if (!blob) throw new Error(`No file ${fileId}`)
      return blob
    },
  }

  return {
    client,
    files,
    state,
    /** The file with this name, or undefined. */
    named: (name: string) => [...files.values()].find((file) => file.name === name),
  }
}
