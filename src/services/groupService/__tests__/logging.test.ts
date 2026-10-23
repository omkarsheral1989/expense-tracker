import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type Database } from '../../../db/client.ts'
import { addTestPerson, createTestGroup, ensurePersonId } from '../../../testing/groups.ts'
import { captureLogs } from '../../../testing/logs.ts'
import { personService } from '../../personService'
import { groupService } from '../index.ts'

let pg: PGlite
let db: Database
const logs = captureLogs()

beforeAll(async () => {
  pg = new PGlite()
  db = await createDatabase(pg)
})

afterAll(() => pg.close())

beforeEach(async () => {
  await pg.exec('truncate group_members, groups, people cascade')
  logs.clear()
})

const omkar = { email: 'omkar@gmail.com', name: 'Omkar Sheral' }

describe('group and person actions are logged', () => {
  it('logs creating, updating and adding a member, with ids and no names', async () => {
    const userId = await ensurePersonId(db, omkar.email, omkar.name)
    const created = await groupService.createGroup(db, userId, {
      name: 'Secret surprise party',
      type: 'trip',
      defaultCurrency: 'INR',
      memberIds: [],
    })
    if (!created.ok) throw new Error('create')
    const friend = await addTestPerson(db, omkar, { name: 'Priya Shah', email: 'priya@gmail.com' })
    await groupService.updateGroup(db, userId, created.groupId, { name: 'Renamed party', type: 'home', defaultCurrency: 'GBP' })
    await groupService.addMember(db, userId, created.groupId, friend)

    expect(logs.lines.map((line) => [line.level, line.scope, line.message])).toEqual([
      ['info', 'group', 'Group created'],
      ['info', 'group', 'Group updated'],
      ['info', 'group', 'Member added to group'],
    ])
    expect(logs.lines[2].fields).toMatchObject({ userId, groupId: created.groupId, personId: friend, ok: true })
    const text = JSON.stringify(logs.lines)
    for (const secret of ['Secret surprise', 'Renamed', 'Priya', 'priya@gmail.com', 'GBP']) {
      expect(text).not.toContain(secret)
    }
  })

  it('warns when a group is refused', async () => {
    const userId = await ensurePersonId(db, omkar.email, omkar.name)
    await groupService.createGroup(db, userId, { name: '', type: 'trip', defaultCurrency: 'INR', memberIds: [] })
    expect(logs.lines[0]).toMatchObject({ level: 'warn', message: 'Group created: refused' })
    expect(logs.lines[0].fields.fieldErrors).toBeGreaterThanOrEqual(1)
  })

  it('warns when adding someone already in the group', async () => {
    const group = await createTestGroup(db, omkar, { name: 'Trip', type: 'trip', defaultCurrency: 'INR', memberEmails: ['priya@gmail.com'] })
    if (!group.ok) throw new Error('group')
    const userId = await ensurePersonId(db, omkar.email, omkar.name)
    const [, priyaId] = await db.query.groupMembers.findMany({ where: (m, { eq }) => eq(m.groupId, group.groupId) }).then((rows) => rows.map((row) => row.personId))
    logs.clear()

    await groupService.addMember(db, userId, group.groupId, priyaId)

    expect(logs.lines[0]).toMatchObject({ level: 'warn', message: 'Member added to group: refused' })
  })

  it('logs adding and updating a person without their name or email', async () => {
    const userId = await ensurePersonId(db, omkar.email, omkar.name)
    const added = await personService.addPerson(db, userId, { name: 'Dev Patel', email: 'dev@gmail.com' })
    if (!added.ok) throw new Error('add')
    await personService.updatePerson(db, userId, added.person.id, { localName: 'Dev from work', email: 'dev@gmail.com' })

    expect(logs.lines.map((line) => line.message)).toEqual(['Person added', 'Person updated'])
    const text = JSON.stringify(logs.lines)
    for (const secret of ['Dev Patel', 'Dev from work', 'dev@gmail.com']) expect(text).not.toContain(secret)
  })
})
