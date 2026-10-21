import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import { groupMembers, groups, people, syncStatus } from '../../db/schema.ts'
import { backupService } from '../backupService'
import type { GroupFile } from '../backupService/types.ts'
import {
  DRIVE_ITEM_KINDS,
  GROUP_ID_PROPERTY,
  GROUPS_FOLDER_NAME,
  PERSON_ID_PROPERTY,
  ROOT_FOLDER_NAME,
} from '../driveService/constants.ts'
import type { DriveClient, DriveFile, DriveItemKind } from '../driveService/types.ts'
import { groupService } from '../groupService'
import type { FoundGroup, GroupSyncResult, GroupSyncStep } from './types.ts'

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
async function firstName(db: Database, personId: string | undefined): Promise<string> {
  if (!personId) return 'A member'
  const [person] = await db.select().from(people).where(eq(people.id, personId))
  return person ? groupService.shortName(person) : 'A member'
}

/** The members' files in a group's folder: the valid ones, and who wrote those that are not. */
async function readMemberFiles(drive: DriveClient, folderId: string, groupId: string) {
  const files = (await drive.listChildren(folderId)).filter(
    (file) => file.properties?.ownledger === DRIVE_ITEM_KINDS.memberFile,
  )
  const valid: GroupFile[] = []
  const unreadable: (string | undefined)[] = []
  for (const file of files) {
    const parsed = backupService.parseGroupFile(await drive.download(file.id), groupId)
    if (parsed) valid.push(parsed)
    else unreadable.push(file.properties?.[PERSON_ID_PROPERTY])
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
    .select({ email: people.email, name: people.name })
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
    const mine = await drive.findOwn(DRIVE_ITEM_KINDS.memberFile, folder.id, { [PERSON_ID_PROPERTY]: me })
    if (mine) await drive.updateJson(mine.id, content)
    else {
      await drive.createJson(`${me}.json`, DRIVE_ITEM_KINDS.memberFile, folder.id, content, {
        [GROUP_ID_PROPERTY]: groupId,
        [PERSON_ID_PROPERTY]: me,
      })
    }

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
      const shortcut = await drive.findOwn(DRIVE_ITEM_KINDS.groupShortcut, parent.id, { [GROUP_ID_PROPERTY]: groupId })
      if (!shortcut) {
        await drive.createShortcut(now.name, DRIVE_ITEM_KINDS.groupShortcut, parent.id, folder.id, {
          [GROUP_ID_PROPERTY]: groupId,
        })
      }
    }

    await recordStatus(db, `group:${groupId}`, new Date())
    return {
      status: 'synced',
      sharedWith,
      unreadable: await Promise.all(unreadable.map((personId) => firstName(db, personId))),
      renamed,
    }
  },

  /**
   * Brings onto the device the groups shared with the user that it does not
   * have: those whose folder holds a valid member's file listing a live
   * member with the user's email. Folders that do not are left alone. Only
   * merges: `syncGroup` then writes the user's file and the shortcut.
   */
  async findSharedGroups(
    db: Database,
    drive: DriveClient,
    userEmail: string,
  ): Promise<{ found: FoundGroup[]; renamed: Map<string, string> }> {
    const known = new Set((await db.select({ id: groups.id }).from(groups)).map((group) => group.id))
    const found: FoundGroup[] = []
    const renamed = new Map<string, string>()

    for (const folder of await drive.findAll(DRIVE_ITEM_KINDS.group, 'others')) {
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
