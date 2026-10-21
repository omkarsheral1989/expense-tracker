import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { groups } from '../../../db/schema.ts'
import { setUpTestDatabase } from '../../../testing/database.ts'
import { personIdOf } from '../../../testing/expenses.ts'
import { createFakeDrive } from '../../../testing/fakeDrive.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { backupService } from '../../backupService'
import { DriveAuthError } from '../../driveService'
import { syncService } from '../index.ts'

const testDb = setUpTestDatabase()
const omkar = { email: 'omkar@gmail.com', name: 'Omkar' }

async function aGroup(name = 'Goa trip') {
  const result = await createTestGroup(testDb.db, omkar, { name, type: 'trip', defaultCurrency: 'GBP' })
  if (!result.ok) throw new Error('group not created')
  return { groupId: result.groupId, userId: await personIdOf(testDb.db, omkar.email) }
}

describe('syncService.backUp', () => {
  it('creates OwnLedger/Backup/backup.json the first time, holding the device\'s data', async () => {
    const { userId } = await aGroup()
    const drive = createFakeDrive()

    await syncService.backUp(testDb.db, drive.client, userId)

    const root = drive.named('OwnLedger')
    const folder = drive.named('Backup')
    const file = drive.named('backup.json')
    expect(root).toMatchObject({ folder: true, parentId: undefined, properties: { ownledger: 'root' } })
    expect(folder).toMatchObject({ folder: true, parentId: root?.id, properties: { ownledger: 'backup' } })
    expect(file).toMatchObject({ folder: false, parentId: folder?.id, properties: { ownledger: 'backup-file' } })
    expect(backupService.parse(file!.content!)?.rows.groups.map((group) => group.name)).toEqual(['Goa trip'])
  })

  it('replaces the backup after that, in the same folders', async () => {
    const { userId } = await aGroup()
    const drive = createFakeDrive()
    await syncService.backUp(testDb.db, drive.client, userId)
    await aGroup('Lisbon')

    await syncService.backUp(testDb.db, drive.client, userId)

    expect(drive.files.size).toBe(3)
    const names = backupService.parse(drive.named('backup.json')!.content!)?.rows.groups.map((group) => group.name)
    expect(names?.sort()).toEqual(['Goa trip', 'Lisbon'])
  })

  it('remembers when it finished, and nothing when it failed', async () => {
    const { userId } = await aGroup()
    const drive = createFakeDrive()
    drive.state.expired = true

    await expect(syncService.backUp(testDb.db, drive.client, userId)).rejects.toBeInstanceOf(DriveAuthError)
    expect(await syncService.lastSyncedAt(testDb.db)).toBeNull()

    drive.state.expired = false
    const before = Date.now()
    await syncService.backUp(testDb.db, drive.client, userId)
    expect((await syncService.lastSyncedAt(testDb.db))!.getTime()).toBeGreaterThanOrEqual(before)
  })
})

describe('syncService.restore', () => {
  it('says so when the Drive has no backup, at any level', async () => {
    const drive = createFakeDrive()
    expect(await syncService.restore(testDb.db, drive.client)).toEqual({ ok: false, reason: 'none' })

    const root = await drive.client.createFolder('OwnLedger', 'root')
    expect(await syncService.restore(testDb.db, drive.client)).toEqual({ ok: false, reason: 'none' })

    await drive.client.createFolder('Backup', 'backup', root.id)
    expect(await syncService.restore(testDb.db, drive.client)).toEqual({ ok: false, reason: 'none' })
  })

  it('refuses a backup that is not valid, and changes nothing', async () => {
    const { userId, groupId } = await aGroup()
    const drive = createFakeDrive()
    await syncService.backUp(testDb.db, drive.client, userId)
    drive.named('backup.json')!.content = '{"app":"ownledger"}'
    await testDb.db.update(groups).set({ name: 'Renamed' }).where(eq(groups.id, groupId))

    expect(await syncService.restore(testDb.db, drive.client)).toEqual({ ok: false, reason: 'invalid' })
    expect((await testDb.db.select().from(groups))[0].name).toBe('Renamed')
  })

  it('merges the backup into the device\'s data', async () => {
    const { userId } = await aGroup()
    const drive = createFakeDrive()
    await syncService.backUp(testDb.db, drive.client, userId)
    const file = backupService.parse(drive.named('backup.json')!.content!)!
    // The backup also holds a group the device does not have.
    const lisbonId = crypto.randomUUID()
    file.rows.groups.push({ ...file.rows.groups[0], id: lisbonId, name: 'Lisbon' })
    file.rows.groupMembers.push({ ...file.rows.groupMembers[0], id: crypto.randomUUID(), groupId: lisbonId })
    drive.named('backup.json')!.content = JSON.stringify(file)

    const result = await syncService.restore(testDb.db, drive.client)

    expect(result).toEqual({ ok: true, renamed: new Map() })
    const names = (await testDb.db.select().from(groups)).map((group) => group.name).sort()
    expect(names).toEqual(['Goa trip', 'Lisbon'])
  })
})
