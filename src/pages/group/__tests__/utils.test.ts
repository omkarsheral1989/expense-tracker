import { describe, expect, it } from 'vitest'
import { knownGroupFrom } from '../utils.ts'

const ID = '3f2a6c1e-8b7d-4e5f-9a10-b2c3d4e5f607'
const group = { id: ID, name: 'Goa trip', type: 'trip', defaultCurrency: 'INR', memberCount: 3 }

describe('knownGroupFrom', () => {
  it('gives the group the page was opened with, keeping only what the band needs', () => {
    expect(knownGroupFrom({ group: { ...group, lastActivityAt: new Date(), extra: 1 } }, ID)).toEqual(group)
  })

  it.each(['trip', 'home', 'couple', 'other'])('accepts the type %s', (type) => {
    expect(knownGroupFrom({ group: { ...group, type } }, ID)?.type).toBe(type)
  })

  it('gives nothing for a group with another id, so a stale state is never shown', () => {
    expect(knownGroupFrom({ group }, '00000000-0000-4000-8000-000000000000')).toBeNull()
  })

  it.each([
    ['no state', null],
    ['no state at all', undefined],
    ['a state without a group', {}],
    ['a state that is not an object', 'x'],
    ['no name', { group: { ...group, name: undefined } }],
    ['a name that is not text', { group: { ...group, name: 5 } }],
    ['no currency', { group: { ...group, defaultCurrency: undefined } }],
    ['a count that is not a number', { group: { ...group, memberCount: '3' } }],
    ['no count', { group: { ...group, memberCount: undefined } }],
    ['an unknown type', { group: { ...group, type: 'cruise' } }],
    ['no type', { group: { ...group, type: undefined } }],
  ])('gives nothing for %s', (_name, state) => {
    expect(knownGroupFrom(state, ID)).toBeNull()
  })
})
