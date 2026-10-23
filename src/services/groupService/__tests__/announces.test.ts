import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDatabase, type Database } from '../../../db/client.ts'
import { dataChanges } from '../../../db/changes.ts'
import { addTestPerson, ensurePersonId } from '../../../testing/groups.ts'
import { personService } from '../../personService'
import { groupService } from '../index.ts'

let pg: PGlite
let db: Database
const heard = vi.fn()
let stop: () => void

beforeAll(async () => {
  pg = new PGlite()
  db = await createDatabase(pg)
})
afterAll(() => pg.close())
beforeEach(async () => {
  await pg.exec('truncate group_members, groups, people cascade')
  stop = dataChanges.subscribe(heard)
})
afterEach(() => {
  stop()
  heard.mockReset()
})

const omkar = { email: 'omkar@gmail.com', name: 'Omkar Sheral' }

describe('group and person actions tell the app the data changed', () => {
  it('announces after creating and updating a group and adding a member', async () => {
    const userId = await ensurePersonId(db, omkar.email, omkar.name)
    const friend = await addTestPerson(db, omkar, { name: 'Priya Shah', email: 'priya@gmail.com' })

    const created = await groupService.createGroup(db, userId, { name: 'Goa', type: 'trip', defaultCurrency: 'INR', memberIds: [] })
    if (!created.ok) throw new Error('create')
    expect(heard).toHaveBeenCalledTimes(1)
    await groupService.updateGroup(db, userId, created.groupId, { name: 'Goa 2', type: 'home', defaultCurrency: 'GBP' })
    expect(heard).toHaveBeenCalledTimes(2)
    await groupService.addMember(db, userId, created.groupId, friend)
    expect(heard).toHaveBeenCalledTimes(3)
  })

  it('announces after adding and updating a person', async () => {
    const userId = await ensurePersonId(db, omkar.email, omkar.name)
    const added = await personService.addPerson(db, userId, { name: 'Dev Patel', email: 'dev@gmail.com' })
    if (!added.ok) throw new Error('add')
    expect(heard).toHaveBeenCalledTimes(1)

    await personService.updatePerson(db, userId, added.person.id, { localName: 'Dev from work', email: 'dev@gmail.com' })
    expect(heard).toHaveBeenCalledTimes(2)
  })

  it('announces nothing for a refused action or a read', async () => {
    const userId = await ensurePersonId(db, omkar.email, omkar.name)
    await groupService.createGroup(db, userId, { name: '', type: 'trip', defaultCurrency: 'INR', memberIds: [] })
    await personService.addPerson(db, userId, { name: '', email: '' })
    await groupService.listGroups(db, userId)
    await personService.listManaged(db, userId)
    expect(heard).not.toHaveBeenCalled()
  })
})
