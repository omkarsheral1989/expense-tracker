import { describe, expect, it } from 'vitest'
import { moneyService } from '../../../services/moneyService'
import type { ActivityItem } from '../../../services/activityService/types.ts'
import { activityDetail, activitySentence, actorName, isNewItem } from '../utils.ts'

const priya = { email: 'priya@gmail.com', name: 'Priya Shah', isYou: false, picture: null }
const you = { email: 'omkar@gmail.com', name: 'Omkar Sheral', isYou: true, picture: null }

function item(overrides: Partial<ActivityItem> & { kind?: ActivityItem['entry']['kind'] } = {}): ActivityItem {
  const { kind = 'added', ...rest } = overrides
  return {
    id: 'event',
    entry: { id: 'event', kind, by: priya, at: new Date('2026-10-20T10:00:00Z'), changes: [], currencyBefore: 'GBP' },
    by: priya,
    groupId: 'g',
    groupName: 'Goa trip',
    expenseId: 'e',
    description: 'Dinner',
    category: 'general',
    amountMinor: 4550,
    currency: 'GBP',
    payment: null,
    people: {},
    arrivedAt: null,
    ...rest,
  }
}

describe('actorName', () => {
  it('says You for the user, the first name for others, and the start of the email without a name', () => {
    expect(actorName(you)).toBe('You')
    expect(actorName(priya)).toBe('Priya')
    expect(actorName({ ...priya, name: null })).toBe('Priya')
    expect(actorName({ ...priya, name: null, email: 'sam.k@gmail.com' })).toBe('Sam.k')
    expect(actorName({ ...priya, name: null, email: null })).toBe('Someone')
  })
})

describe('activitySentence', () => {
  it.each([
    ['added', 'Priya added Dinner'],
    ['edited', 'Priya edited Dinner'],
    ['deleted', 'Priya deleted Dinner'],
    ['restored', 'Priya restored Dinner'],
    ['reverted', 'Priya restored a version of Dinner'],
  ] as const)('words %s', (kind, text) => {
    expect(activitySentence(item({ kind }))).toBe(text)
  })

  it('starts with You for the user\'s own events', () => {
    expect(activitySentence(item({ by: you }))).toBe('You added Dinner')
  })

  it('words a payment with who paid whom and the amount in its own currency', () => {
    const payment = { payer: priya, recipient: { email: 'omkar@gmail.com', name: 'Omkar', isYou: true } }
    expect(activitySentence(item({ payment }))).toBe('Priya added a payment: Priya paid you £45.50')
    expect(activitySentence(item({ payment, kind: 'deleted', by: you }))).toBe('You deleted a payment: Priya paid you £45.50')
    expect(activitySentence(item({ payment, kind: 'reverted' }))).toBe('Priya restored a version of a payment: Priya paid you £45.50')
    const between = { payer: priya, recipient: { email: 'sam@gmail.com', name: 'Sam', isYou: false } }
    expect(activitySentence(item({ payment: between, currency: 'USD' }))).toBe(`Priya added a payment: Priya paid Sam ${moneyService.format(4550, 'USD')}`)
  })
})

describe('activityDetail', () => {
  it('has the group and the amount after the event, and for a payment only the group', () => {
    expect(activityDetail(item())).toBe('Goa trip · £45.50')
    expect(activityDetail(item({ payment: { payer: priya, recipient: you } }))).toBe('Goa trip')
  })
})

describe('isNewItem', () => {
  const seen = new Date('2026-10-20T00:00:00Z')

  it('is new when another member\'s event arrived after the time seen', () => {
    expect(isNewItem(item({ arrivedAt: new Date('2026-10-21T00:00:00Z') }), seen)).toBe(true)
    expect(isNewItem(item({ arrivedAt: new Date('2026-10-19T00:00:00Z') }), seen)).toBe(false)
    expect(isNewItem(item({ arrivedAt: seen }), seen)).toBe(false)
  })

  it('counts everything that arrived on a first visit', () => {
    expect(isNewItem(item({ arrivedAt: new Date('2020-01-01T00:00:00Z') }), null)).toBe(true)
  })

  it('is never new for the user\'s own event, or one that never arrived by a sync', () => {
    expect(isNewItem(item({ by: you, arrivedAt: new Date('2026-10-21T00:00:00Z') }), seen)).toBe(false)
    expect(isNewItem(item({ arrivedAt: null }), null)).toBe(false)
  })
})
