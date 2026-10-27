import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type Database } from '../../../db/client.ts'
import { groups, people } from '../../../db/schema.ts'
import { createFakeDriveWorld } from '../../../testing/fakeDrive.ts'
import { expenseService } from '../../expenseService'
import { groupService } from '../../groupService'
import { personService } from '../../personService'
import { userService } from '../../userService'
import { syncService } from '../index.ts'

// Two devices: Omkar's (`a`) and Priya's (`b`), each with its own data and its own Drive client.
let pgA: PGlite
let pgB: PGlite
let a: Database
let b: Database
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
})

const omkarDrive = () => world.clientFor('omkar@gmail.com')
const priyaDrive = () => world.clientFor('priya@gmail.com')

/** The user's own person on a device. */
async function self(db: Database, email: string, name: string, id: string = crypto.randomUUID()) {
  await db.insert(people).values({ id, email, name, updatedBy: id })
  return id
}

async function addPerson(db: Database, adderId: string, name: string, email: string) {
  // The add-member dialog sends an empty email for a person without one.
  const result = await personService.addPerson(db, adderId, { name, email })
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.person.id
}

async function addExpense(db: Database, userId: string, groupId: string, description: string, amountMinor: number) {
  const group = await groupService.getGroup(db, userId, groupId)
  const values = Object.fromEntries(group!.members.map((member) => [member.personId, 1]))
  const result = await expenseService.createExpense(db, userId, groupId, {
    description,
    category: 'general',
    amountMinor,
    currency: 'GBP',
    date: '2026-10-20',
    notes: '',
    paidBy: userId,
    split: { method: 'equal', values },
    receipts: [],
  })
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
}

/** On Omkar's device: Goa trip, with Priya (an email) and Sam (none), and a dinner. */
async function omkarsGroup() {
  const omkar = await self(a, 'omkar@gmail.com', 'Omkar')
  const priya = await addPerson(a, omkar, 'Priya Shah', 'priya@gmail.com')
  const sam = await addPerson(a, omkar, 'Sam', '')
  const group = await groupService.createGroup(a, omkar, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberIds: [priya, sam] })
  if (!group.ok) throw new Error('group not created')
  await addExpense(a, omkar, group.groupId, 'Dinner', 3000)
  return { omkar, priya, sam, groupId: group.groupId }
}

/** The files of a kind in the fake Drive. */
function filesOf(kind: string) {
  return [...world.files.values()].filter((file) => file.properties?.ownledger === kind)
}

async function descriptions(db: Database, userId: string, groupId: string) {
  return (await expenseService.listExpenses(db, userId, groupId)).map((expense) => expense.description).sort()
}

describe('syncService.syncGroup, by the creator', () => {
  it('makes the group\'s folder in OwnLedger/Groups, tagged with the group, and writes the user\'s file there', async () => {
    const { omkar, groupId } = await omkarsGroup()

    const result = await syncService.syncGroup(a, omkarDrive(), omkar, groupId)

    expect(result.status).toBe('synced')
    const [folder] = filesOf('group')
    expect(folder).toMatchObject({ name: 'Goa trip', folder: true, owner: 'omkar@gmail.com', properties: { ownledgerGroupId: groupId } })
    expect(world.files.get(folder.parentId!)).toMatchObject({ name: 'Groups', properties: { ownledger: 'groups' } })
    expect(world.files.get(world.files.get(folder.parentId!)!.parentId!)?.name).toBe('OwnLedger')
    const [file] = filesOf('member-file')
    expect(file).toMatchObject({
      name: 'omkar@gmail.com.json',
      parentId: folder.id,
      properties: { ownledgerGroupId: groupId, ownledgerEmail: 'omkar@gmail.com', ownledgerPersonId: omkar },
    })
  })

  it('writes the whole group and the people it names, and nobody else known on the device', async () => {
    const { omkar, groupId } = await omkarsGroup()
    await addPerson(a, omkar, 'Dev Patel', 'dev@gmail.com')

    await syncService.syncGroup(a, omkarDrive(), omkar, groupId)

    const content = JSON.parse(filesOf('member-file')[0].content!)
    expect(content).toMatchObject({ app: 'ownledger', kind: 'group', format: 1, groupId, writtenBy: omkar })
    expect(content.rows.people.map((person: { name: string }) => person.name).sort()).toEqual(['Omkar', 'Priya Shah', 'Sam'])
    expect(content.rows.expenses.map((expense: { description: string }) => expense.description)).toEqual(['Dinner'])
    expect(content.rows.expenseEvents).toHaveLength(1)
  })

  it('shares the folder with the members who have an email, once, and says with whom', async () => {
    const { omkar, groupId } = await omkarsGroup()

    const first = await syncService.syncGroup(a, omkarDrive(), omkar, groupId)
    const second = await syncService.syncGroup(a, omkarDrive(), omkar, groupId)

    expect(world.shares).toEqual([{ fileId: filesOf('group')[0].id, email: 'priya@gmail.com' }])
    expect(first).toMatchObject({ sharedWith: ['Priya'] })
    expect(second).toMatchObject({ sharedWith: [] })
  })

  it('makes the folder and file even with nobody to share with', async () => {
    const omkar = await self(a, 'omkar@gmail.com', 'Omkar')
    const solo = await groupService.createGroup(a, omkar, { name: 'Solo', type: 'other', defaultCurrency: 'GBP', memberIds: [] })
    if (!solo.ok) throw new Error('group not created')

    expect(await syncService.syncGroup(a, omkarDrive(), omkar, solo.groupId)).toMatchObject({ status: 'synced', sharedWith: [] })
    expect(filesOf('group')).toHaveLength(1)
    expect(filesOf('member-file')).toHaveLength(1)
  })

  it('replaces its file on later syncs, and renames the folder when the group was renamed', async () => {
    const { omkar, groupId } = await omkarsGroup()
    await syncService.syncGroup(a, omkarDrive(), omkar, groupId)
    await groupService.updateGroup(a, omkar, groupId, { name: 'Goa 2026', type: 'trip', defaultCurrency: 'GBP' })

    await syncService.syncGroup(a, omkarDrive(), omkar, groupId)

    expect(filesOf('member-file')).toHaveLength(1)
    expect(filesOf('group')[0].name).toBe('Goa 2026')
  })

  it('remembers when the group last synced', async () => {
    const { omkar, groupId } = await omkarsGroup()
    expect(await syncService.lastGroupSyncAt(a, groupId)).toBeNull()

    const before = Date.now()
    await syncService.syncGroup(a, omkarDrive(), omkar, groupId)

    expect((await syncService.lastGroupSyncAt(a, groupId))!.getTime()).toBeGreaterThanOrEqual(before)
  })
})

describe('two devices', () => {
  /** Omkar syncs his group, then Priya's device finds it and syncs it. */
  async function shared() {
    const setup = await omkarsGroup()
    await syncService.syncGroup(a, omkarDrive(), setup.omkar, setup.groupId)
    let priyaOnB = await self(b, 'priya@gmail.com', 'Priya Shah')
    const found = await syncService.findSharedGroups(b, priyaDrive(), 'priya@gmail.com')
    priyaOnB = found.renamed.get(priyaOnB) ?? priyaOnB
    const result = await syncService.syncGroup(b, priyaDrive(), priyaOnB, setup.groupId)
    if (result.status !== 'synced') throw new Error('not synced')
    return { ...setup, found, priyaOnB: result.renamed.get(priyaOnB) ?? priyaOnB }
  }

  it('counts the events by other members a sync brought in, and none of the user\'s own', async () => {
    const setup = await omkarsGroup()
    await syncService.syncGroup(a, omkarDrive(), setup.omkar, setup.groupId)
    const priyaOnB = await self(b, 'priya@gmail.com', 'Priya Shah')

    // A group found for the first time brings in Omkar's one event, which is new to Priya.
    const found = await syncService.findSharedGroups(b, priyaDrive(), 'priya@gmail.com')
    const me = found.renamed.get(priyaOnB) ?? priyaOnB
    expect(found.newEvents).toBe(1)

    // Syncing it again brings in nothing.
    expect(await syncService.syncGroup(b, priyaDrive(), me, setup.groupId)).toMatchObject({ newEvents: 0 })

    // Omkar adds two more; Priya's next sync counts them.
    await addExpense(a, setup.omkar, setup.groupId, 'Taxi', 500)
    await addExpense(a, setup.omkar, setup.groupId, 'Lunch', 800)
    await syncService.syncGroup(a, omkarDrive(), setup.omkar, setup.groupId)
    expect(await syncService.syncGroup(b, priyaDrive(), me, setup.groupId)).toMatchObject({ newEvents: 2 })

    // Priya's own event, read back by Omkar, is not new to Priya: her device's own file brings in nothing of others'.
    await addExpense(b, me, setup.groupId, 'Coffee', 300)
    await syncService.syncGroup(b, priyaDrive(), me, setup.groupId)
    expect(await syncService.syncGroup(b, priyaDrive(), me, setup.groupId)).toMatchObject({ newEvents: 0 })
    expect(await syncService.syncGroup(a, omkarDrive(), setup.omkar, setup.groupId)).toMatchObject({ newEvents: 1 })
  })

  it('does not count the user\'s own events that arrive from their other device', async () => {
    const setup = await omkarsGroup()
    await syncService.syncGroup(a, omkarDrive(), setup.omkar, setup.groupId)
    // Omkar's second device (`b`) finds his own group, and its one event is his own.
    const omkarOnB = await self(b, 'omkar@gmail.com', 'Omkar')
    const found = await syncService.findSharedGroups(b, omkarDrive(), 'omkar@gmail.com')
    expect(found.found).toHaveLength(1)
    expect(found.newEvents).toBe(0)

    // He adds one there; his first device reads it back: also his own.
    const me = found.renamed.get(omkarOnB) ?? omkarOnB
    await addExpense(b, me, setup.groupId, 'Coffee', 300)
    await syncService.syncGroup(b, omkarDrive(), me, setup.groupId)
    expect(await syncService.syncGroup(a, omkarDrive(), setup.omkar, setup.groupId)).toMatchObject({ newEvents: 0 })
  })

  it('keeps the name a member typed for someone, on both devices, over that person\'s Google name', async () => {
    const setup = await omkarsGroup()
    await syncService.syncGroup(a, omkarDrive(), setup.omkar, setup.groupId)
    // Priya signs in on her own device, where the app names her after her Google account.
    let priyaOnB = (await userService.resolve(b, { userPersonId: null }, { id: 'g-priya', email: 'priya@gmail.com', name: 'Priya Samuel' })).personId
    priyaOnB = (await syncService.findSharedGroups(b, priyaDrive(), 'priya@gmail.com')).renamed.get(priyaOnB) ?? priyaOnB
    const result = await syncService.syncGroup(b, priyaDrive(), priyaOnB, setup.groupId)
    if (result.status !== 'synced') throw new Error('not synced')
    priyaOnB = result.renamed.get(priyaOnB) ?? priyaOnB
    // Her next sign-in on that device leaves the typed name alone.
    await userService.resolve(b, { userPersonId: priyaOnB }, { id: 'g-priya', email: 'priya@gmail.com', name: 'Priya Samuel' })
    await syncService.syncGroup(b, priyaDrive(), priyaOnB, setup.groupId)

    await syncService.syncGroup(a, omkarDrive(), setup.omkar, setup.groupId)

    for (const db of [a, b]) {
      const [priya] = await db.select().from(people).where(eq(people.email, 'priya@gmail.com'))
      expect(priya.name).toBe('Priya Shah')
    }
  })

  it('shows a member\'s Google picture to the others once she has synced, and never shares anyone\'s local name', async () => {
    const setup = await omkarsGroup()
    await syncService.syncGroup(a, omkarDrive(), setup.omkar, setup.groupId)
    await a.update(people).set({ localName: 'Sis' }).where(eq(people.email, 'priya@gmail.com'))
    let priyaOnB = (
      await userService.resolve(b, { userPersonId: null }, {
        id: 'g-priya', email: 'priya@gmail.com', name: 'Priya Samuel', picture: 'https://example.com/priya.png',
      })
    ).personId
    priyaOnB = (await syncService.findSharedGroups(b, priyaDrive(), 'priya@gmail.com')).renamed.get(priyaOnB) ?? priyaOnB
    await syncService.syncGroup(b, priyaDrive(), priyaOnB, setup.groupId)

    await syncService.syncGroup(a, omkarDrive(), setup.omkar, setup.groupId)

    const [onA] = await a.select().from(people).where(eq(people.email, 'priya@gmail.com'))
    expect(onA).toMatchObject({ picture: 'https://example.com/priya.png', localName: 'Sis' })
    const [onB] = await b.select().from(people).where(eq(people.email, 'priya@gmail.com'))
    expect(onB.localName).toBeNull()
    for (const file of world.files.values()) {
      if (typeof file.content === 'string') expect(file.content).not.toContain('Sis')
    }
  })

  it('brings a shared group onto the member\'s device, with its expenses', async () => {
    const { groupId, found, priyaOnB } = await shared()

    expect(found.found).toEqual([{ groupId, name: 'Goa trip' }])
    expect((await groupService.listGroups(b, priyaOnB)).map((group) => group.name)).toEqual(['Goa trip'])
    expect(await descriptions(b, priyaOnB, groupId)).toEqual(['Dinner'])
  })

  it('makes the member\'s own person and the one the creator added for her email one person, under the same id on both devices', async () => {
    const { priya, priyaOnB } = await shared()

    expect(priyaOnB).toBe([priya, priyaOnB].sort()[0])
    expect((await b.select().from(people)).filter((person) => person.email === 'priya@gmail.com')).toHaveLength(1)
  })

  it('gives the member a shortcut to the folder in her own OwnLedger/Groups, once', async () => {
    const { groupId, priyaOnB } = await shared()
    await syncService.syncGroup(b, priyaDrive(), priyaOnB, groupId)

    const shortcuts = filesOf('group-shortcut')
    expect(shortcuts).toHaveLength(1)
    expect(shortcuts[0]).toMatchObject({ owner: 'priya@gmail.com', name: 'Goa trip', shortcutTo: filesOf('group')[0].id })
    expect(world.files.get(shortcuts[0].parentId!)).toMatchObject({ name: 'Groups', owner: 'priya@gmail.com' })
  })

  it('carries each member\'s changes to the other, so both have the same expenses and balances', async () => {
    const { omkar, groupId, priyaOnB } = await shared()
    await addExpense(b, priyaOnB, groupId, 'Taxi', 900)
    await syncService.syncGroup(b, priyaDrive(), priyaOnB, groupId)

    const back = await syncService.syncGroup(a, omkarDrive(), omkar, groupId)
    const omkarNow = back.status === 'synced' ? (back.renamed.get(omkar) ?? omkar) : omkar

    expect(await descriptions(a, omkarNow, groupId)).toEqual(['Dinner', 'Taxi'])
    const onA = await expenseService.groupBalances(a, omkarNow, groupId)
    const onB = await expenseService.groupBalances(b, priyaOnB, groupId)
    // Dinner 30.00 split three ways by Omkar, Taxi 9.00 by Priya: Priya owes Omkar 7.00.
    expect(onA.find((balance) => balance.email === 'priya@gmail.com')?.amountMinor).toBe(700)
    expect(onB.find((balance) => balance.email === 'omkar@gmail.com')?.amountMinor).toBe(-700)
  })

  it('takes a rename made by another member, and only the creator renames the folder', async () => {
    const { omkar, groupId, priyaOnB } = await shared()
    await groupService.updateGroup(b, priyaOnB, groupId, { name: 'Goa 2026', type: 'trip', defaultCurrency: 'GBP' })
    await syncService.syncGroup(b, priyaDrive(), priyaOnB, groupId)
    expect(filesOf('group')[0].name).toBe('Goa trip')

    await syncService.syncGroup(a, omkarDrive(), omkar, groupId)

    expect((await a.select().from(groups))[0].name).toBe('Goa 2026')
    expect(filesOf('group')[0].name).toBe('Goa 2026')
  })

  it('remembers who has synced, so they are no longer Pending', async () => {
    const { omkar, groupId, priyaOnB } = await shared()
    expect([...(await syncService.syncedMembers(a, groupId))]).toEqual([])

    await syncService.syncGroup(a, omkarDrive(), omkar, groupId)

    expect([...(await syncService.syncedMembers(a, groupId))].sort()).toEqual([omkar, priyaOnB].sort())
  })

  it('makes a member wait while a group created by someone else has no folder yet, touching nothing', async () => {
    const { omkar } = await shared()
    // A group Priya created that reached Omkar's device before she synced it (for example by a restore).
    const priyaOnA = (await a.select().from(people).where(eq(people.email, 'priya@gmail.com')))[0].id
    const flat = await groupService.createGroup(a, omkar, { name: 'Flat', type: 'home', defaultCurrency: 'GBP', memberIds: [priyaOnA] })
    if (!flat.ok) throw new Error('group not created')
    await a.update(groups).set({ createdBy: priyaOnA }).where(eq(groups.id, flat.groupId))
    const filesBefore = world.files.size

    expect(await syncService.syncGroup(a, omkarDrive(), omkar, flat.groupId)).toEqual({ status: 'waiting', creatorName: 'Priya' })
    expect(world.files.size).toBe(filesBefore)
    expect(await syncService.lastGroupSyncAt(a, flat.groupId)).toBeNull()
  })

  it('skips a member\'s file that is not valid OwnLedger data, naming its writer, and syncs the rest', async () => {
    const { omkar, groupId } = await shared()
    // Omkar's device has read Priya's file once, so it knows her under the id she writes as.
    const before = await syncService.syncGroup(a, omkarDrive(), omkar, groupId)
    const omkarNow = before.status === 'synced' ? (before.renamed.get(omkar) ?? omkar) : omkar
    filesOf('member-file').find((file) => file.owner === 'priya@gmail.com')!.content = '{"app":"ownledger"}'

    const result = await syncService.syncGroup(a, omkarDrive(), omkarNow, groupId)

    expect(result).toMatchObject({ status: 'synced', unreadable: ['Priya'] })
    expect(await syncService.lastGroupSyncAt(a, groupId)).not.toBeNull()
  })

  it('calls the writer of an unreadable file "A member" when the device does not know them', async () => {
    const { omkar, groupId } = await omkarsGroup()
    await syncService.syncGroup(a, omkarDrive(), omkar, groupId)
    await priyaDrive().createJson('x.json', 'member-file', filesOf('group')[0].id, 'not a group', {
      ownledgerGroupId: groupId,
      ownledgerEmail: 'stranger@gmail.com',
    })

    expect(await syncService.syncGroup(a, omkarDrive(), omkar, groupId)).toMatchObject({ unreadable: ['A member'] })
  })

  it('keeps one file per member, named by their email, when their id changes', async () => {
    // Omkar syncs from one device, then from a cleared one, where he gets a new id: here the smaller, so it is kept.
    const oldId = 'ffffffff-ffff-4fff-bfff-ffffffffffff'
    const newId = '00000000-0000-4000-8000-000000000001'
    await self(a, 'omkar@gmail.com', 'Omkar', oldId)
    const group = await groupService.createGroup(a, oldId, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP', memberIds: [] })
    if (!group.ok) throw new Error('group not created')
    await syncService.syncGroup(a, omkarDrive(), oldId, group.groupId)
    await self(b, 'omkar@gmail.com', 'Omkar', newId)

    const { renamed } = await syncService.findSharedGroups(b, omkarDrive(), 'omkar@gmail.com')
    const me = renamed.get(newId) ?? newId
    expect(me).toBe(newId)
    await syncService.syncGroup(b, omkarDrive(), me, group.groupId)

    const files = filesOf('member-file')
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({ name: 'omkar@gmail.com.json', properties: { ownledgerEmail: 'omkar@gmail.com', ownledgerPersonId: newId } })
    expect(JSON.parse(files[0].content!).writtenBy).toBe(newId)
  })

  it('takes nothing from a member\'s file but the rows of its own group', async () => {
    const { omkar, groupId } = await shared()
    const file = filesOf('member-file').find((each) => each.owner === 'priya@gmail.com')!
    const content = JSON.parse(file.content!)
    const otherGroup = crypto.randomUUID()
    content.rows.groups.push({ ...content.rows.groups[0], id: otherGroup, name: 'Sneaky' })
    const stranger = crypto.randomUUID()
    content.rows.people.push({ ...content.rows.people[0], id: stranger, email: 'stranger@gmail.com', name: 'Stranger' })
    file.content = JSON.stringify(content)

    await syncService.syncGroup(a, omkarDrive(), omkar, groupId)

    expect((await a.select().from(groups)).map((group) => group.name)).toEqual(['Goa trip'])
    expect((await a.select().from(people)).some((person) => person.email === 'stranger@gmail.com')).toBe(false)
  })
})

describe('a group folder that is gone from Drive', () => {
  /** Puts the group's folder, and everything in it, in the bin. */
  function binFolder() {
    const folder = filesOf('group')[0]
    for (const [id, file] of world.files) if (id === folder.id || file.parentId === folder.id) world.files.delete(id)
    return folder.id
  }

  it('is made again by the creator\'s next sync and shared again with every member', async () => {
    const { omkar, groupId } = await omkarsGroup()
    await syncService.syncGroup(a, omkarDrive(), omkar, groupId)
    const lost = binFolder()

    const result = await syncService.syncGroup(a, omkarDrive(), omkar, groupId)

    const [folder] = filesOf('group')
    expect(folder.id).not.toBe(lost)
    expect(folder.properties?.ownledgerGroupId).toBe(groupId)
    expect(result).toMatchObject({ status: 'synced', sharedWith: ['Priya'] })
    expect(world.shares.map((share) => share.email)).toEqual(['priya@gmail.com', 'priya@gmail.com'])
    expect(filesOf('member-file').map((file) => file.parentId)).toEqual([folder.id])
  })

  it('brings members back to it: a new shortcut to the new folder, and their data still there', async () => {
    const setup = await omkarsGroup()
    await syncService.syncGroup(a, omkarDrive(), setup.omkar, setup.groupId)
    let priya = await self(b, 'priya@gmail.com', 'Priya Shah')
    priya = (await syncService.findSharedGroups(b, priyaDrive(), 'priya@gmail.com')).renamed.get(priya) ?? priya
    await syncService.syncGroup(b, priyaDrive(), priya, setup.groupId)
    binFolder()
    await syncService.syncGroup(a, omkarDrive(), setup.omkar, setup.groupId)

    await syncService.syncGroup(b, priyaDrive(), priya, setup.groupId)

    const [folder] = filesOf('group')
    const shortcuts = filesOf('group-shortcut')
    expect(shortcuts.at(-1)).toMatchObject({ shortcutTo: folder.id, properties: { ownledgerFolderId: folder.id } })
    expect(shortcuts).toHaveLength(2)
    expect(filesOf('member-file').filter((file) => file.parentId === folder.id).map((file) => file.owner).sort()).toEqual([
      'omkar@gmail.com',
      'priya@gmail.com',
    ])
    expect(await descriptions(b, priya, setup.groupId)).toEqual(['Dinner'])
  })
})

describe('syncService.findSharedGroups', () => {
  it('finds nothing before the creator has synced', async () => {
    await omkarsGroup()
    await self(b, 'priya@gmail.com', 'Priya Shah')

    expect((await syncService.findSharedGroups(b, priyaDrive(), 'priya@gmail.com')).found).toEqual([])
  })

  it('leaves alone a shared folder whose files do not make the user a member', async () => {
    const { omkar, groupId } = await omkarsGroup()
    await syncService.syncGroup(a, omkarDrive(), omkar, groupId)
    // Shared with Dev, who is not in the group's data.
    await omkarDrive().share(filesOf('group')[0].id, 'dev@gmail.com')
    await self(b, 'dev@gmail.com', 'Dev')

    expect((await syncService.findSharedGroups(b, world.clientFor('dev@gmail.com'), 'dev@gmail.com')).found).toEqual([])
    expect(await b.select().from(groups)).toEqual([])
  })

  it('brings back the user\'s own groups from their folders onto a device that does not have them', async () => {
    const { omkar, groupId } = await omkarsGroup()
    await syncService.syncGroup(a, omkarDrive(), omkar, groupId)
    // Omkar's other device, or this one after its data was cleared: a new person id for the same email.
    const omkarAgain = await self(b, 'omkar@gmail.com', 'Omkar')

    const { found, renamed } = await syncService.findSharedGroups(b, omkarDrive(), 'omkar@gmail.com')

    expect(found).toEqual([{ groupId, name: 'Goa trip' }])
    const me = renamed.get(omkarAgain) ?? omkarAgain
    expect(me).toBe([omkar, omkarAgain].sort()[0])
    expect(await descriptions(b, me, groupId)).toEqual(['Dinner'])
    // Syncing it then adds no shortcut: the folder is already in the user's own OwnLedger/Groups.
    expect((await syncService.syncGroup(b, omkarDrive(), me, groupId)).status).toBe('synced')
    expect(filesOf('group-shortcut')).toEqual([])
  })

  it('does not bring in again the user\'s own group already on the device', async () => {
    const { omkar, groupId } = await omkarsGroup()
    await syncService.syncGroup(a, omkarDrive(), omkar, groupId)

    expect((await syncService.findSharedGroups(a, omkarDrive(), 'omkar@gmail.com')).found).toEqual([])
  })

  it('does not bring in again a group already on the device', async () => {
    const { omkar, groupId } = await omkarsGroup()
    await syncService.syncGroup(a, omkarDrive(), omkar, groupId)
    await self(b, 'priya@gmail.com', 'Priya Shah')
    expect((await syncService.findSharedGroups(b, priyaDrive(), 'priya@gmail.com')).found).toHaveLength(1)

    expect((await syncService.findSharedGroups(b, priyaDrive(), 'priya@gmail.com')).found).toEqual([])
  })
})
