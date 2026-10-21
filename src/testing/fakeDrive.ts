import { DriveAuthError } from '../services/driveService'
import { OWNLEDGER_PROPERTY } from '../services/driveService/constants.ts'
import type { DriveClient, DriveFile } from '../services/driveService/types.ts'

/** A file or folder in the fake Drive, with its parent and its content: text for JSON, a Blob for a picture. */
export type FakeDriveFile = DriveFile & {
  parentId?: string
  content?: string
  blob?: Blob
  folder: boolean
  /** The email of the user who made it. */
  owner: string
  /** Emails it was shared with (as editors); its contents are shared with them too, as in Drive. */
  sharedWith: string[]
  /** For a shortcut, the file it points at. */
  shortcutTo?: string
}

/**
 * An in-memory Google Drive with several users (ADR-044): each user's client
 * sees what they own and what was shared with them, a folder's sharing covering
 * everything inside it, as in Drive. `files` shows what is stored, `shares`
 * every sharing (with whom, which folder), and `state.expired` makes every call
 * fail the way Drive does when access has run out.
 */
export function createFakeDriveWorld() {
  const files = new Map<string, FakeDriveFile>()
  const shares: { fileId: string; email: string }[] = []
  let count = 0
  const state = { expired: false }

  function check() {
    if (state.expired) throw new DriveAuthError()
  }

  function canSee(file: FakeDriveFile, email: string): boolean {
    if (file.owner === email || file.sharedWith.includes(email)) return true
    const parent = file.parentId ? files.get(file.parentId) : undefined
    return parent ? canSee(parent, email) : false
  }

  function summary({ id, name, properties }: FakeDriveFile): DriveFile {
    return { id, name, properties }
  }

  function hasProperties(file: FakeDriveFile, properties: Record<string, string>) {
    return Object.entries(properties).every(([key, value]) => file.properties?.[key] === value)
  }

  function fileFor(email: string, id: string): FakeDriveFile {
    const file = files.get(id)
    if (!file || !canSee(file, email)) throw new Error(`No file ${id}`)
    return file
  }

  function clientFor(email: string): DriveClient {
    function add(file: Omit<FakeDriveFile, 'id' | 'owner' | 'sharedWith'>): DriveFile {
      if (file.parentId) fileFor(email, file.parentId)
      const id = `file-${++count}`
      files.set(id, { ...file, id, owner: email, sharedWith: [] })
      return summary(files.get(id)!)
    }

    return {
      async findOwn(kind, parentId, properties = {}) {
        check()
        const found = [...files.values()].find(
          (file) =>
            file.owner === email &&
            hasProperties(file, { ...properties, [OWNLEDGER_PROPERTY]: kind }) &&
            (!parentId || file.parentId === parentId),
        )
        return found ? summary(found) : null
      },
      async findAll(kind, owner, properties = {}) {
        check()
        return [...files.values()]
          .filter((file) => canSee(file, email))
          .filter((file) => owner === 'any' || (owner === 'me') === (file.owner === email))
          .filter((file) => hasProperties(file, { ...properties, [OWNLEDGER_PROPERTY]: kind }))
          .map(summary)
      },
      async createFolder(name, kind, parentId, properties = {}) {
        check()
        return add({ name, parentId, folder: true, properties: { ...properties, [OWNLEDGER_PROPERTY]: kind } })
      },
      async createJson(name, kind, parentId, content, properties = {}) {
        check()
        return add({
          name,
          parentId,
          folder: false,
          content: JSON.stringify(content),
          properties: { ...properties, [OWNLEDGER_PROPERTY]: kind },
        })
      },
      async updateJson(fileId, content, properties) {
        check()
        const file = fileFor(email, fileId)
        file.content = JSON.stringify(content)
        if (properties) file.properties = { ...file.properties, ...properties }
        return summary(file)
      },
      async download(fileId) {
        check()
        const content = fileFor(email, fileId).content
        if (content === undefined) throw new Error(`No content in ${fileId}`)
        return content
      },
      async listChildren(parentId) {
        check()
        return [...files.values()].filter((file) => file.parentId === parentId && canSee(file, email)).map(summary)
      },
      async createFile(name, kind, parentId, content, properties = {}) {
        check()
        return add({ name, parentId, folder: false, blob: content, properties: { ...properties, [OWNLEDGER_PROPERTY]: kind } })
      },
      async downloadBlob(fileId) {
        check()
        const blob = fileFor(email, fileId).blob
        if (!blob) throw new Error(`No picture in ${fileId}`)
        return blob
      },
      async rename(fileId, name) {
        check()
        const file = fileFor(email, fileId)
        file.name = name
        return summary(file)
      },
      async sharedWith(fileId) {
        check()
        const file = fileFor(email, fileId)
        return [file.owner, ...file.sharedWith]
      },
      async share(fileId, shareEmail) {
        check()
        const file = fileFor(email, fileId)
        if (!file.sharedWith.includes(shareEmail)) file.sharedWith.push(shareEmail)
        shares.push({ fileId, email: shareEmail })
      },
      async createShortcut(name, kind, parentId, targetId, properties = {}) {
        check()
        return add({ name, parentId, folder: false, shortcutTo: targetId, properties: { ...properties, [OWNLEDGER_PROPERTY]: kind } })
      },
    }
  }

  return {
    files,
    shares,
    state,
    clientFor,
    /** The first file with this name, or undefined. */
    named: (name: string) => [...files.values()].find((file) => file.name === name),
  }
}

/** A fake Drive with one user (`email`): their client, with the world's files, state and `named`. */
export function createFakeDrive(email = 'omkar@gmail.com') {
  const world = createFakeDriveWorld()
  return { ...world, client: world.clientFor(email) }
}
