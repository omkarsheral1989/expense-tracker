import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type Database } from '../../../db/client.ts'
import { accounts, expensePayments } from '../../../db/schema.ts'
import { addTestExpense, personIdOf } from '../../../testing/expenses.ts'
import { createTestGroup } from '../../../testing/groups.ts'
import { accountService } from '../../accountService'
import { backupService } from '../index.ts'
import type { BackupFile } from '../types.ts'

// The user's accounts and the payment method of each expense are private (ADR-061): they are in the backup, merged like
// every other row, and never in a group's file. Two devices: `source` makes a backup, `target` restores it.
let sourcePg: PGlite
let targetPg: PGlite
let source: Database
let target: Database

const TABLES = 'expense_payments, accounts, expense_events, expense_photos, expense_shares, expenses, group_members, groups, people, sync_status'

beforeAll(async () => {
  sourcePg = new PGlite()
  targetPg = new PGlite()
  source = await createDatabase(sourcePg)
  target = await createDatabase(targetPg)
})

afterAll(async () => {
  await sourcePg.close()
  await targetPg.close()
})

beforeEach(async () => {
  await sourcePg.exec(`truncate ${TABLES} cascade`)
  await targetPg.exec(`truncate ${TABLES} cascade`)
})

const omkar = { email: 'omkar@gmail.com', name: 'Omkar' }

/** On the source: a group, a card, an expense paid with it (charged in another currency). */
async function sourceData() {
  const group = await createTestGroup(source, omkar, { name: 'Goa trip', type: 'trip', defaultCurrency: 'GBP' })
  if (!group.ok) throw new Error('group not created')
  const userId = await personIdOf(source, omkar.email)
  const card = await accountService.createAccount(source, userId, { kind: 'card', name: 'HDFC Regalia', currency: 'INR', statementDay: 15, creditLimitMinor: 5_000_000 })
  if (!card.ok) throw new Error('card not created')
  const expenseId = await addTestExpense(source, omkar.email, group.groupId, { description: 'Dinner' })
  await accountService.setPaymentMethod(source, userId, expenseId, { accountId: card.accountId, chargedMinor: 84_125 })
  return { groupId: group.groupId, userId, accountId: card.accountId, expenseId }
}

async function backupOfSource(): Promise<BackupFile> {
  const file = backupService.parse(JSON.stringify(await backupService.exportAll(source, await personIdOf(source, omkar.email))))
  if (!file) throw new Error('the backup was refused')
  return file
}

describe('accounts in a backup', () => {
  it('are written, with the payment method of each expense, and read back', async () => {
    const { accountId, expenseId } = await sourceData()

    const file = await backupOfSource()

    expect(file.rows.accounts).toEqual([expect.objectContaining({ id: accountId, name: 'HDFC Regalia', kind: 'card', currency: 'INR', statementDay: 15, creditLimitMinor: 5_000_000 })])
    expect(file.rows.expensePayments).toEqual([expect.objectContaining({ expenseId, accountId, chargedMinor: 84_125 })])
  })

  it('come back on an empty device, and the expense shows its payment method', async () => {
    const { expenseId } = await sourceData()

    await backupService.importAll(target, await backupOfSource())

    expect(await accountService.getPaymentMethod(target, expenseId)).toMatchObject({ accountName: 'HDFC Regalia', accountKind: 'card', chargedMinor: 84_125 })
  })

  it('are read from a backup written before they existed (no lists in it)', async () => {
    await sourceData()
    const written = JSON.parse(JSON.stringify(await backupService.exportAll(source, await personIdOf(source, omkar.email))))
    delete written.rows.accounts
    delete written.rows.expensePayments

    const file = backupService.parse(JSON.stringify(written))

    expect(file?.rows.accounts).toEqual([])
    expect(file?.rows.expensePayments).toEqual([])
  })

  it('keep the newer version of an account on either side', async () => {
    const { accountId, userId } = await sourceData()
    await backupService.importAll(target, await backupOfSource())
    // The target renames it later; the source renames it earlier than that.
    await target.update(accounts).set({ name: 'Newer name', updatedAt: new Date('2030-01-01T00:00:00Z') }).where(eq(accounts.id, accountId))
    await source.update(accounts).set({ name: 'Older name', updatedAt: new Date('2029-01-01T00:00:00Z') }).where(eq(accounts.id, accountId))

    await backupService.importAll(target, await backupOfSource())
    expect((await target.select().from(accounts).where(eq(accounts.id, accountId)))[0].name).toBe('Newer name')

    // And the other way: a newer version in the backup replaces the device's.
    await source.update(accounts).set({ name: 'Newest name', updatedAt: new Date('2031-01-01T00:00:00Z'), updatedBy: userId }).where(eq(accounts.id, accountId))
    await backupService.importAll(target, await backupOfSource())
    expect((await target.select().from(accounts).where(eq(accounts.id, accountId)))[0].name).toBe('Newest name')
  })

  it('make one payment method per expense, even when two devices each made one under another id', async () => {
    const { expenseId, accountId } = await sourceData()
    await backupService.importAll(target, await backupOfSource())
    // The target made its own row for the same expense (another id), later than the backup's.
    const [ours] = await target.select().from(expensePayments).where(eq(expensePayments.expenseId, expenseId))
    await target.delete(expensePayments).where(eq(expensePayments.id, ours.id))
    await target.insert(expensePayments).values({
      id: crypto.randomUUID(), expenseId, accountId, chargedMinor: 99_000, updatedBy: ours.updatedBy, updatedAt: new Date('2032-01-01T00:00:00Z'),
    })

    await backupService.importAll(target, await backupOfSource())

    const rows = await target.select().from(expensePayments).where(eq(expensePayments.expenseId, expenseId))
    expect(rows).toHaveLength(1)
    expect(rows[0].chargedMinor).toBe(99_000)
  })

  it('bring back a cleared payment method as cleared', async () => {
    const { expenseId, userId } = await sourceData()
    await accountService.setPaymentMethod(source, userId, expenseId, null)

    await backupService.importAll(target, await backupOfSource())

    expect(await accountService.getPaymentMethod(target, expenseId)).toBeNull()
    expect((await target.select().from(expensePayments))[0].deletedAt).not.toBeNull()
  })
})

describe('accounts and a member\'s group file', () => {
  it('are never written into it', async () => {
    const { groupId, userId } = await sourceData()

    const file = await backupService.exportGroup(source, groupId, userId)

    expect(file.rows.accounts).toEqual([])
    expect(file.rows.expensePayments).toEqual([])
    expect(JSON.stringify(file)).not.toContain('HDFC Regalia')
  })

  it('are never taken from one, even a file that holds some', async () => {
    const { groupId, userId } = await sourceData()
    const honest = await backupService.exportGroup(source, groupId, userId)
    const [card] = await source.select().from(accounts)
    const [payment] = await source.select().from(expensePayments)
    const hostile = { ...honest, rows: { ...honest.rows, accounts: [card], expensePayments: [payment] } }
    await targetPg.exec(`truncate ${TABLES} cascade`)

    const read = backupService.parseGroupFile(JSON.stringify(hostile), groupId)
    if (!read) throw new Error('the group file was refused')
    await backupService.importGroup(target, read)

    expect(await target.select().from(accounts)).toEqual([])
    expect(await target.select().from(expensePayments)).toEqual([])
  })
})
