import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import { expensePhotos, expenses, groupMembers, groups, people, syncStatus } from '../../db/schema.ts'
import { shownName } from '../../db/shownName.ts'
import { backupService } from '../backupService'
import type { GroupFile } from '../backupService/types.ts'
import {
  DRIVE_ITEM_KINDS,
  EMAIL_PROPERTY,
  FOLDER_ID_PROPERTY,
  GROUP_ID_PROPERTY,
  GROUP_PHOTOS_FOLDER_NAME,
  GROUPS_FOLDER_NAME,
  PERSON_ID_PROPERTY,
  ROOT_FOLDER_NAME,
} from '../driveService/constants.ts'
import type { DriveClient, DriveFile, DriveItemKind } from '../driveService/types.ts'
import { groupService } from '../groupService'
import type { PhotoStore } from '../photoService/types.ts'
import { downloadPhotos, photosIn, uploadPhotos } from './photos.ts'
import type { FoundGroup, GroupSyncResult, GroupSyncStep, PhotoDirection, PhotoProgress, PhotosResult } from './types.ts'

async function findOrCreateFolder(drive: DriveClient, kind: DriveItemKind, name: string, parentId?: string) {
  return (await drive.findOwn(kind, parentId)) ?? drive.createFolder(name, kind, parentId)
}

/** The user's `OwnLedger/Groups`, made the first time. */
async function groupsFolder(drive: DriveClient): Promise<DriveFile> {
  const root = await findOrCreateFolder(drive, DRIVE_ITEM_KINDS.root, ROOT_FOLDER_NAME)
  return findOrCreateFolder(drive, DRIVE_ITEM_KINDS.groups, GROUPS_FOLDER_NAME, root.id)
}

/** The group's folder, whoever owns it (the oldest, if a race ever made two), or null. */
async function groupFolder(drive: DriveClient, groupId: string): Promise<DriveFile | null> {
  return (await drive.findAll(DRIVE_ITEM_KINDS.group, 'any', { [GROUP_ID_PROPERTY]: groupId }))[0] ?? null
}

/** The id a person has now, following renames (a person can be renamed more than once in a sync). */
function current(id: string, renamed: ReadonlyMap<string, string>): string {
  let now = id
  while (renamed.has(now)) now = renamed.get(now)!
  return now
}

async function recordStatus(db: Database, scope: string, at: Date) {
  await db
    .insert(syncStatus)
    .values({ scope, lastSyncedAt: at })
    .onConflictDoUpdate({ target: syncStatus.scope, set: { lastSyncedAt: at } })
}

/** A person's first name for a message, or "A member" for one the device does not know. */
async function firstName(db: Database, personId: string): Promise<string> {
  const [person] = await db.select().from(people).where(eq(people.id, personId))
  return person ? groupService.shortName(person) : 'A member'
}

/** The first name of the person with this email, or "A member" when nobody saved on the device has it. */
async function firstNameByEmail(db: Database, email: string | undefined): Promise<string> {
  if (!email) return 'A member'
  const [person] = await db.select().from(people).where(eq(people.email, email.toLowerCase()))
  return person ? groupService.shortName(person) : 'A member'
}

/** The members' files in a group's folder: the valid ones, and the emails of those who wrote the ones that are not. */
async function readMemberFiles(drive: DriveClient, folderId: string, groupId: string) {
  const files = (await drive.listChildren(folderId)).filter(
    (file) => file.properties?.ownledger === DRIVE_ITEM_KINDS.memberFile,
  )
  const valid: GroupFile[] = []
  const unreadable: (string | undefined)[] = []
  for (const file of files) {
    const parsed = backupService.parseGroupFile(await drive.download(file.id), groupId)
    if (parsed) valid.push(parsed)
    else unreadable.push(file.properties?.[EMAIL_PROPERTY])
  }
  return { valid, unreadable }
}

/**
 * Merges the members' files into the device's data, and remembers that each
 * writer has synced (they are no longer Pending). Returns who was renamed.
 */
async function importFiles(db: Database, groupId: string, files: GroupFile[]) {
  const renamed = new Map<string, string>()
  for (const file of files) {
    const result = await backupService.importGroup(db, file)
    for (const [from, to] of result.renamed) renamed.set(from, to)
  }
  for (const file of files) {
    await recordStatus(db, `member:${groupId}:${current(file.writtenBy, renamed)}`, file.writtenAt)
  }
  return renamed
}

/** The group's live members who have an email, with their names. */
function membersWithEmail(db: Database, groupId: string) {
  return db
    .select({ email: people.email, name: shownName(people) })
    .from(groupMembers)
    .innerJoin(people, eq(people.id, groupMembers.personId))
    .where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.deletedAt), isNotNull(people.email)))
}

/** Group sync through the group's shared Drive folder (ADR-044). */
export const groupSync = {
  /**
   * Syncs one group: finds its folder (the creator makes it on their first
   * sync; anyone else waits for that), merges every member's file, writes the
   * user's own, shares the folder with members who have an email and are not
   * shared yet, keeps the folder's name equal to the group's (creator only) and
   * adds a shortcut to it in the user's `OwnLedger/Groups` (everyone else).
   */
  async syncGroup(
    db: Database,
    drive: DriveClient,
    userId: string,
    groupId: string,
    onStep: (step: GroupSyncStep) => void = () => {},
  ): Promise<GroupSyncResult> {
    const [group] = await db.select().from(groups).where(eq(groups.id, groupId))
    if (!group) throw new Error('This group is not on the device.')

    onStep('receiving')
    let folder = await groupFolder(drive, groupId)
    if (!folder) {
      if (group.createdBy !== userId) return { status: 'waiting', creatorName: await firstName(db, group.createdBy) }
      const parent = await groupsFolder(drive)
      folder = await drive.createFolder(group.name, DRIVE_ITEM_KINDS.group, parent.id, { [GROUP_ID_PROPERTY]: groupId })
    }

    const { valid, unreadable } = await readMemberFiles(drive, folder.id, groupId)
    const renamed = await importFiles(db, groupId, valid)
    const me = current(userId, renamed)

    onStep('sending')
    const content = await backupService.exportGroup(db, groupId, me)
    // Found by owner, not by id: the user's id can change in a merge (ADR-044), their file stays the same.
    const [self] = await db.select({ email: people.email }).from(people).where(eq(people.id, me))
    if (!self?.email) throw new Error('Only a person with an email can sync a group.')
    const tags = { [GROUP_ID_PROPERTY]: groupId, [EMAIL_PROPERTY]: self.email, [PERSON_ID_PROPERTY]: me }
    const mine = await drive.findOwn(DRIVE_ITEM_KINDS.memberFile, folder.id)
    if (mine) await drive.updateJson(mine.id, content, tags)
    else await drive.createJson(`${self.email}.json`, DRIVE_ITEM_KINDS.memberFile, folder.id, content, tags)

    const already = new Set(await drive.sharedWith(folder.id))
    const sharedWith: string[] = []
    for (const member of await membersWithEmail(db, groupId)) {
      if (!member.email || already.has(member.email)) continue
      await drive.share(folder.id, member.email)
      sharedWith.push(groupService.shortName(member))
    }

    const [now] = await db.select().from(groups).where(eq(groups.id, groupId))
    if (now.createdBy === me) {
      if (folder.name !== now.name) await drive.rename(folder.id, now.name)
    } else {
      const parent = await groupsFolder(drive)
      // Tagged with the folder too: after a lost folder was made again, the old shortcut points nowhere.
      const tags = { [GROUP_ID_PROPERTY]: groupId, [FOLDER_ID_PROPERTY]: folder.id }
      const shortcut = await drive.findOwn(DRIVE_ITEM_KINDS.groupShortcut, parent.id, tags)
      if (!shortcut) await drive.createShortcut(now.name, DRIVE_ITEM_KINDS.groupShortcut, parent.id, folder.id, tags)
    }

    await recordStatus(db, `group:${groupId}`, new Date())
    return {
      status: 'synced',
      sharedWith,
      unreadable: await Promise.all(unreadable.map((email) => firstNameByEmail(db, email))),
      renamed,
    }
  },

  /**
   * Brings onto the device the groups it does not have whose folder is shared
   * with the user or is their own (a group they created, for example after the
   * app's data was cleared): those whose folder holds a valid member's file
   * listing a live member with the user's email. Folders that do not are left
   * alone. Only merges: `syncGroup` then writes the user's file and, for a
   * folder of someone else's, the shortcut.
   */
  async findSharedGroups(
    db: Database,
    drive: DriveClient,
    userEmail: string,
  ): Promise<{ found: FoundGroup[]; renamed: Map<string, string> }> {
    const known = new Set((await db.select({ id: groups.id }).from(groups)).map((group) => group.id))
    const found: FoundGroup[] = []
    const renamed = new Map<string, string>()

    for (const folder of await drive.findAll(DRIVE_ITEM_KINDS.group, 'any')) {
      const groupId = folder.properties?.[GROUP_ID_PROPERTY]
      if (!groupId || known.has(groupId)) continue
      known.add(groupId)

      const { valid } = await readMemberFiles(drive, folder.id, groupId)
      const includesUser = valid.some((file) => {
        const mine = new Set(file.rows.people.filter((person) => person.email === userEmail).map((person) => person.id))
        return file.rows.groupMembers.some((member) => member.deletedAt === null && mine.has(member.personId))
      })
      if (!includesUser) continue

      for (const [from, to] of await importFiles(db, groupId, valid)) renamed.set(from, to)
      const [group] = await db.select({ name: groups.name }).from(groups).where(eq(groups.id, groupId))
      if (group) found.push({ groupId, name: group.name })
    }
    return { found, renamed }
  },

  /**
   * Moves the group's photos (removed ones and those of deleted expenses
   * included) through `photos/` in its folder, after `syncGroup`: uploads what
   * Drive lacks, then downloads what the device lacks. Only the creator makes
   * that folder; until it exists nothing moves. Failures are counted, and a
   * full device stops the downloads.
   */
  async syncGroupPhotos(
    db: Database,
    drive: DriveClient,
    userId: string,
    groupId: string,
    store: PhotoStore,
    onProgress: (direction: PhotoDirection, progress: PhotoProgress) => void = () => {},
  ): Promise<PhotosResult> {
    const nothing: PhotosResult = { failures: 0, outOfSpace: false }
    const folder = await groupFolder(drive, groupId)
    if (!folder) return nothing

    let photosFolder: DriveFile | null =
      (await drive.findAll(DRIVE_ITEM_KINDS.groupPhotos, 'any', { [GROUP_ID_PROPERTY]: groupId }))[0] ?? null
    if (!photosFolder) {
      const [group] = await db.select({ createdBy: groups.createdBy }).from(groups).where(eq(groups.id, groupId))
      if (group?.createdBy !== userId) return nothing
      photosFolder = await drive.createFolder(GROUP_PHOTOS_FOLDER_NAME, DRIVE_ITEM_KINDS.groupPhotos, folder.id, {
        [GROUP_ID_PROPERTY]: groupId,
      })
    }

    const photos = await db
      .select({ id: expensePhotos.id, mimeType: expensePhotos.mimeType })
      .from(expensePhotos)
      .innerJoin(expenses, eq(expenses.id, expensePhotos.expenseId))
      .where(eq(expenses.groupId, groupId))
    const inDrive = await photosIn(drive, photosFolder.id)
    const sent = await uploadPhotos(drive, store, {
      folderId: photosFolder.id,
      kind: DRIVE_ITEM_KINDS.groupPhoto,
      photos,
      inDrive,
      properties: { [GROUP_ID_PROPERTY]: groupId },
      onProgress: (progress) => onProgress('sending', progress),
    })
    const received = await downloadPhotos(drive, store, {
      photos,
      inDrive,
      onProgress: (progress) => onProgress('receiving', progress),
    })
    return { failures: sent.failures + received.failures, outOfSpace: received.outOfSpace }
  },

  /** When this group last finished syncing on this device, or null. */
  async lastGroupSyncAt(db: Database, groupId: string): Promise<Date | null> {
    const [row] = await db.select().from(syncStatus).where(eq(syncStatus.scope, `group:${groupId}`))
    return row?.lastSyncedAt ?? null
  },

  /** The members of a group whose own file this device has read: they are no longer Pending. */
  async syncedMembers(db: Database, groupId: string): Promise<Set<string>> {
    const prefix = `member:${groupId}:`
    const rows = await db.select({ scope: syncStatus.scope }).from(syncStatus)
    return new Set(rows.filter((row) => row.scope.startsWith(prefix)).map((row) => row.scope.slice(prefix.length)))
  },
}
