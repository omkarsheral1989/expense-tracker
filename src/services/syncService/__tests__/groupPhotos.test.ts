import 'fake-indexeddb/auto'
import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDatabase, type Database } from '../../../db/client.ts'
import { expensePhotos, people } from '../../../db/schema.ts'
import { createFakeDriveWorld } from '../../../testing/fakeDrive.ts'
import { DriveAuthError } from '../../driveService'
import { expenseService } from '../../expenseService'
import { groupService } from '../../groupService'
import { personService } from '../../personService'
import { photoService } from '../../photoService'
import type { PhotoStore } from '../../photoService/types.ts'
import { syncService } from '../index.ts'
import type { PhotoDirection, PhotoProgress } from '../types.ts'

// Two devices, Omkar's (`a`) and Priya's (`b`), each with its data and photo store.
let pgA: PGlite
let pgB: PGlite
let a: Database
let b: Database
let storeA: PhotoStore
let storeB: PhotoStore
let world: ReturnType<typeof createFakeDriveWorld>

const TABLES = 'expense_photos, expense_shares, expenses, group_members, groups, people, sync_status'

beforeAll(async () => {
  pgA = new PGlite()
  pgB = new PGlite()
  a = await createDatabase(pgA)
  b = await createDatabase(pgB)
})

afterAll(async () => {
  await pgA.close()
  await pgB.close()
})

beforeEach(async () => {
  await pgA.exec(`truncate ${TABLES} cascade`)
  await pgB.exec(`truncate ${TABLES} cascade`)
  world = createFakeDriveWorld()
  storeA = photoService.open(crypto.randomUUID())
  storeB = photoService.open(crypto.randomUUID())
})

afterEach(() => vi.restoreAllMocks())

const omkarDrive = () => world.clientFor('omkar@gmail.com')
const priyaDrive = () => world.clientFor('priya@gmail.com')

/** A picture whose bytes say which one it is. */
const picture = (label: string) => new Blob([label], { type: 'image/jpeg' })

async function self(db: Database, email: string, name: string) {
  const id = crypto.randomUUID()
  await db.insert(people).values({ id, email, name, updatedBy: id })
  return id
}

/** An expense in the group with photos kept in `store`; returns the photo ids. */
async function expenseWithPhotos(db: Database, store: PhotoStore, userId: string, groupId: string, labels: string[]) {
  const receipts = labels.map(() => ({ id: crypto.randomUUID(), mimeType: 'image/jpeg', sizeBytes: 5 }))
  for (const [index, receipt] of receipts.entries()) await store.savePhoto(receipt.id, picture(labels[index]), picture('thumb'))
  const group = await groupService.getGroup(db, userId, groupId)
  const values = Object.fromEntries(group!.members.map((member) => [member.personId, 1]))
  const result = await expenseService.createExpense(db, userId, groupId, {
    description: labels.join(' '), category: 'general', amountMinor: 1000, currency: 'GBP', date: '2026-10-20',
    notes: '', paidBy: userId, split: { method: 'equal', values }, receipts,
  })
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return { expenseId: result.expenseId, ids: receipts.map((receipt) => receipt.id) }
}

/** Omkar's Goa trip with Priya, synced by him once (so its folder exists). */
async function goaTrip() {
  const omkar = await self(a, 'omkar@gmail.com', 'Omkar')
  const priya = await personService.addPerson(a, omkar, { name: 'Priya Shah', email: 'priya@gmail.com' })
  if (!priya.ok) throw new Error('person not added')
  const group = await groupService.createGroup(a, omkar, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberIds: [priya.person.id] })
  if (!group.ok) throw new Error('group not created')
  await syncService.syncGroup(a, omkarDrive(), omkar, group.groupId)
  return { omkar, groupId: group.groupId }
}

/** Priya's device takes the group in; returns her person id there. */
async function priyaJoins(groupId: string) {
  let priya: string = await self(b, 'priya@gmail.com', 'Priya Shah')
  const { renamed } = await syncService.findSharedGroups(b, priyaDrive(), 'priya@gmail.com')
  priya = renamed.get(priya) ?? priya
  const result = await syncService.syncGroup(b, priyaDrive(), priya, groupId)
  return result.status === 'synced' ? (result.renamed.get(priya) ?? priya) : priya
}

const photoFiles = () => [...world.files.values()].filter((file) => file.properties?.ownledger === 'group-photo')

describe('syncService.syncGroupPhotos', () => {
  it('makes photos/ in the group\'s folder (the creator) and uploads the group\'s photos there, tagged', async () => {
    const { omkar, groupId } = await goaTrip()
    const { ids } = await expenseWithPhotos(a, storeA, omkar, groupId, ['one', 'two'])

    expect(await syncService.syncGroupPhotos(a, omkarDrive(), omkar, groupId, storeA)).toEqual({ failures: 0, outOfSpace: false })

    const folder = [...world.files.values()].find((file) => file.properties?.ownledger === 'group-photos')!
    expect(folder).toMatchObject({ name: 'photos', folder: true, properties: { ownledgerGroupId: groupId } })
    expect(world.files.get(folder.parentId!)?.properties?.ownledger).toBe('group')
    expect(photoFiles().map((file) => file.properties?.ownledgerPhotoId).sort()).toEqual([...ids].sort())
    expect(photoFiles().every((file) => file.parentId === folder.id && file.properties?.ownledgerGroupId === groupId)).toBe(true)
    expect(await photoFiles().find((file) => file.name === `${ids[1]}.jpg`)!.blob!.text()).toBe('two')
  })

  it('includes photos taken off an expense and photos of deleted expenses, and none of other groups', async () => {
    const { omkar, groupId } = await goaTrip()
    const removed = await expenseWithPhotos(a, storeA, omkar, groupId, ['removed'])
    await a.update(expensePhotos).set({ deletedAt: new Date() }).where(eq(expensePhotos.id, removed.ids[0]))
    const deleted = await expenseWithPhotos(a, storeA, omkar, groupId, ['deleted'])
    await expenseService.deleteExpense(a, omkar, groupId, deleted.expenseId)
    const other = await groupService.createGroup(a, omkar, { name: 'Flat', type: 'home', defaultCurrency: 'GBP', memberIds: [] })
    if (!other.ok) throw new Error('group not created')
    await expenseWithPhotos(a, storeA, omkar, other.groupId, ['flat'])

    await syncService.syncGroupPhotos(a, omkarDrive(), omkar, groupId, storeA)

    expect(photoFiles().map((file) => file.properties?.ownledgerPhotoId).sort()).toEqual([removed.ids[0], deleted.ids[0]].sort())
  })

  it('moves nothing before the group has a folder', async () => {
    const omkar = await self(a, 'omkar@gmail.com', 'Omkar')
    const group = await groupService.createGroup(a, omkar, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberIds: [] })
    if (!group.ok) throw new Error('group not created')
    await expenseWithPhotos(a, storeA, omkar, group.groupId, ['one'])

    expect(await syncService.syncGroupPhotos(a, omkarDrive(), omkar, group.groupId, storeA)).toEqual({ failures: 0, outOfSpace: false })
    expect(world.files.size).toBe(0)
  })

  it('leaves making photos/ to the creator: another member moves nothing until it exists', async () => {
    const { groupId } = await goaTrip()
    const priya = await priyaJoins(groupId)
    await expenseWithPhotos(b, storeB, priya, groupId, ['hers'])
    const filesBefore = world.files.size

    expect(await syncService.syncGroupPhotos(b, priyaDrive(), priya, groupId, storeB)).toEqual({ failures: 0, outOfSpace: false })
    expect(world.files.size).toBe(filesBefore)
  })

  it('brings each member\'s photos to the other, with the photo\'s type and a thumbnail', async () => {
    const { omkar, groupId } = await goaTrip()
    const mine = await expenseWithPhotos(a, storeA, omkar, groupId, ['omkar\'s'])
    // As a group's line does: the data first, then the photos.
    await syncService.syncGroup(a, omkarDrive(), omkar, groupId)
    await syncService.syncGroupPhotos(a, omkarDrive(), omkar, groupId, storeA)
    const priya = await priyaJoins(groupId)
    // Drive hands a download back without the picture's type.
    const drive = priyaDrive()
    const downloadBlob = drive.downloadBlob
    vi.spyOn(drive, 'downloadBlob').mockImplementation(async (fileId) => new Blob([await (await downloadBlob(fileId)).text()]))

    await syncService.syncGroupPhotos(b, drive, priya, groupId, storeB)

    const arrived = await storeB.getPhoto(mine.ids[0])
    expect(await arrived!.text()).toBe('omkar\'s')
    expect(arrived!.type).toBe('image/jpeg')
    expect(await storeB.getThumbnail(mine.ids[0])).not.toBeNull()

    const hers = await expenseWithPhotos(b, storeB, priya, groupId, ['priya\'s'])
    await syncService.syncGroup(b, priyaDrive(), priya, groupId)
    await syncService.syncGroupPhotos(b, priyaDrive(), priya, groupId, storeB)
    expect(photoFiles().find((file) => file.properties?.ownledgerPhotoId === hers.ids[0])?.owner).toBe('priya@gmail.com')

    await syncService.syncGroup(a, omkarDrive(), omkar, groupId)
    await syncService.syncGroupPhotos(a, omkarDrive(), omkar, groupId, storeA)
    expect(await (await storeA.getPhoto(hers.ids[0]))!.text()).toBe('priya\'s')
  })

  it('sends what Drive lacks and gets what the device lacks, reporting each way\'s progress', async () => {
    const { omkar, groupId } = await goaTrip()
    const { ids } = await expenseWithPhotos(a, storeA, omkar, groupId, ['one', 'two'])
    await syncService.syncGroupPhotos(a, omkarDrive(), omkar, groupId, storeA)
    await storeA.deletePhoto(ids[0])
    await expenseWithPhotos(a, storeA, omkar, groupId, ['three'])
    const progress: [PhotoDirection, PhotoProgress][] = []

    await syncService.syncGroupPhotos(a, omkarDrive(), omkar, groupId, storeA, (direction, step) => progress.push([direction, step]))

    expect(progress).toEqual([
      ['sending', { current: 1, total: 1 }],
      ['receiving', { current: 1, total: 1 }],
    ])
    expect(await (await storeA.getPhoto(ids[0]))!.text()).toBe('one')
    expect(photoFiles()).toHaveLength(3)
  })

  it('counts photos that fail either way, and carries on with the others', async () => {
    const { omkar, groupId } = await goaTrip()
    const { ids } = await expenseWithPhotos(a, storeA, omkar, groupId, ['one', 'two'])
    await syncService.syncGroupPhotos(a, omkarDrive(), omkar, groupId, storeA)
    await storeA.deletePhoto(ids[0])
    await expenseWithPhotos(a, storeA, omkar, groupId, ['three'])
    const drive = omkarDrive()
    vi.spyOn(drive, 'createFile').mockRejectedValue(new Error('upload failed'))
    vi.spyOn(drive, 'downloadBlob').mockRejectedValue(new Error('download failed'))

    expect(await syncService.syncGroupPhotos(a, drive, omkar, groupId, storeA)).toEqual({ failures: 2, outOfSpace: false })
  })

  it('stops downloading when the device is full', async () => {
    const { omkar, groupId } = await goaTrip()
    const { ids } = await expenseWithPhotos(a, storeA, omkar, groupId, ['one', 'two'])
    await syncService.syncGroupPhotos(a, omkarDrive(), omkar, groupId, storeA)
    for (const id of ids) await storeA.deletePhoto(id)
    vi.spyOn(storeA, 'savePhoto').mockRejectedValue(new DOMException('The quota has been exceeded.', 'QuotaExceededError'))

    expect(await syncService.syncGroupPhotos(a, omkarDrive(), omkar, groupId, storeA)).toEqual({ failures: 0, outOfSpace: true })
  })

  it('stops when Drive access runs out', async () => {
    const { omkar, groupId } = await goaTrip()
    await expenseWithPhotos(a, storeA, omkar, groupId, ['one'])
    const drive = omkarDrive()
    vi.spyOn(drive, 'createFile').mockRejectedValue(new DriveAuthError())

    await expect(syncService.syncGroupPhotos(a, drive, omkar, groupId, storeA)).rejects.toBeInstanceOf(DriveAuthError)
  })
})
