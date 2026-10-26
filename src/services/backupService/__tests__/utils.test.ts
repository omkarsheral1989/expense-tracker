import { describe, expect, it } from 'vitest'
import type { BackupRows } from '../types.ts'
import { idsIn, isNewer, renameIds, rowsOfGroup } from '../utils.ts'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

describe('isNewer', () => {
  const at = (minute: number, updatedBy: string) => ({ updatedAt: new Date(2026, 9, 21, 10, minute), updatedBy })

  it('takes the version changed later', () => {
    expect(isNewer(at(5, A), at(4, B))).toBe(true)
    expect(isNewer(at(4, B), at(5, A))).toBe(false)
  })

  it('breaks a tie by the larger person id, so every device picks the same one', () => {
    expect(isNewer(at(5, B), at(5, A))).toBe(true)
    expect(isNewer(at(5, A), at(5, B))).toBe(false)
  })

  it('does not count the same version as newer', () => {
    expect(isNewer(at(5, A), at(5, A))).toBe(false)
  })
})

describe('renameIds', () => {
  it('replaces an id everywhere it occurs, also deep inside', () => {
    const data = { personId: A, updatedBy: A, snapshot: { shares: [{ personId: A }, { personId: B }] } }

    expect(renameIds(data, new Map([[A, B]]))).toEqual({
      personId: B,
      updatedBy: B,
      snapshot: { shares: [{ personId: B }, { personId: B }] },
    })
  })

  it('writes dates as text, to be parsed again', () => {
    expect(renameIds({ at: new Date('2026-10-21T10:00:00.000Z') }, new Map())).toEqual({ at: '2026-10-21T10:00:00.000Z' })
  })
})

describe('idsIn', () => {
  it('finds every id in the data, deep inside too, lower-cased', () => {
    expect([...idsIn({ a: A, b: [{ c: B.toUpperCase() }], d: 'not an id' })].sort()).toEqual([A, B])
  })
})

describe('rowsOfGroup', () => {
  const G = '33333333-3333-4333-8333-333333333333'
  const OTHER = '44444444-4444-4444-8444-444444444444'
  const E1 = '55555555-5555-4555-8555-555555555555'
  const E2 = '66666666-6666-4666-8666-666666666666'
  const STRANGER = '77777777-7777-4777-8777-777777777777'
  const at = new Date('2026-10-21T10:00:00Z')
  const sync = (id: string) => ({ id, updatedAt: at, updatedBy: A, deletedAt: null })
  const group = (id: string) => ({ ...sync(id), name: 'G', type: 'trip' as const, defaultCurrency: 'GBP', createdBy: A })
  const expense = (id: string, groupId: string) => ({
    ...sync(id), groupId, description: 'D', category: 'general', amountMinor: 100, currency: 'GBP',
    date: '2026-10-21', notes: null, method: 'equal' as const, createdBy: A, createdAt: at,
  })
  const person = (id: string) => ({ ...sync(id), email: null, name: id.slice(0, 1) })
  const rows: BackupRows = {
    people: [person(A), person(B), person(STRANGER)],
    groups: [group(G), group(OTHER)],
    groupMembers: [{ ...sync(crypto.randomUUID()), groupId: G, personId: A }, { ...sync(crypto.randomUUID()), groupId: OTHER, personId: STRANGER }],
    expenses: [expense(E1, G), expense(E2, OTHER)],
    expenseShares: [
      { ...sync(crypto.randomUUID()), expenseId: E1, personId: B, paidMinor: 0, owedMinor: 100, inputValue: 1 },
      { ...sync(crypto.randomUUID()), expenseId: E2, personId: STRANGER, paidMinor: 100, owedMinor: 100, inputValue: 1 },
    ],
    expensePhotos: [
      { ...sync(crypto.randomUUID()), expenseId: E1, position: 0, mimeType: 'image/jpeg', sizeBytes: 1 },
      { ...sync(crypto.randomUUID()), expenseId: E2, position: 0, mimeType: 'image/jpeg', sizeBytes: 1 },
    ],
    expenseEvents: [],
    // Private to their user (ADR-061): a member's file never brings any.
    accounts: [
      { ...sync(crypto.randomUUID()), kind: 'card' as const, name: 'Card', currency: 'GBP', statementDay: 15, creditLimitMinor: 100, spendTargetMinor: 50, spendTargetPeriod: 'month' as const },
    ],
    expensePayments: [{ ...sync(crypto.randomUUID()), expenseId: E1, accountId: crypto.randomUUID(), chargedMinor: null }],
  }

  it('keeps only the group, its memberships and expenses, and their shares and photos', () => {
    const kept = rowsOfGroup(rows, G)

    expect(kept.groups.map((row) => row.id)).toEqual([G])
    expect(kept.groupMembers.map((row) => row.groupId)).toEqual([G])
    expect(kept.expenses.map((row) => row.id)).toEqual([E1])
    expect(kept.expenseShares.map((row) => row.expenseId)).toEqual([E1])
    expect(kept.expensePhotos.map((row) => row.expenseId)).toEqual([E1])
  })

  it('never takes accounts or payment methods, which are private to their user', () => {
    const kept = rowsOfGroup(rows, G)

    expect(kept.accounts).toEqual([])
    expect(kept.expensePayments).toEqual([])
  })

  it('keeps only the people those rows name', () => {
    expect(rowsOfGroup(rows, G).people.map((row) => row.id).sort()).toEqual([A, B])
  })

  it('keeps an event only when both its group and its expense are the group\'s', () => {
    const event = (groupId: string, expenseId: string) => ({
      ...sync(crypto.randomUUID()), groupId, expenseId, kind: 'added' as const, actedBy: A, occurredAt: at,
      snapshot: { description: 'D', category: 'general', amountMinor: 100, currency: 'GBP', date: '2026-10-21', notes: null, method: 'equal' as const, shares: [], photos: [] },
      changes: [], restoredFrom: null,
    })
    const withEvents = { ...rows, expenseEvents: [event(G, E1), event(G, E2), event(OTHER, E1)] }

    expect(rowsOfGroup(withEvents, G).expenseEvents).toEqual([withEvents.expenseEvents[0]])
  })
})
