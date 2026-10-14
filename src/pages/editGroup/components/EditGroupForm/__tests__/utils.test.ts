import { describe, expect, it } from 'vitest'
import type { FormValues } from '../types.ts'
import { hasChanges, toFormFields } from '../utils.ts'

const initial: FormValues = { name: 'Goa trip', type: 'trip', defaultCurrency: 'INR' }

describe('hasChanges', () => {
  it('is false before the form has any values, and for the values it opened with', () => {
    expect(hasChanges(undefined, initial)).toBe(false)
    expect(hasChanges({ ...initial }, initial)).toBe(false)
  })

  it.each([
    ['the name', { name: 'Goa trip 2' }],
    ['the name\'s case', { name: 'goa trip' }],
    ['the type', { type: 'home' }],
    ['the currency', { defaultCurrency: 'EUR' }],
  ] as const)('is true once %s is changed', (_what, change) => {
    expect(hasChanges({ ...initial, ...change }, initial)).toBe(true)
  })

  it('does not count spaces around the name as a change, nor a name that is back to what it was', () => {
    expect(hasChanges({ ...initial, name: '  Goa trip ' }, initial)).toBe(false)
    expect(hasChanges({ ...initial, name: 'Goa' }, initial)).toBe(true)
    expect(hasChanges({ ...initial, name: 'Goa trip' }, initial)).toBe(false)
  })

  it('counts an emptied name as a change', () => {
    expect(hasChanges({ ...initial, name: '' }, initial)).toBe(true)
    expect(hasChanges({ type: 'trip', defaultCurrency: 'INR' }, initial)).toBe(true)
  })
})

describe('toFormFields', () => {
  it('gives each field its message, and clears the fields with no problem', () => {
    expect(toFormFields({ name: 'Enter a group name.' })).toEqual([
      { name: 'name', errors: ['Enter a group name.'] },
      { name: 'type', errors: [] },
      { name: 'defaultCurrency', errors: [] },
    ])
  })

  it('clears everything when there are no problems', () => {
    expect(toFormFields({}).every((field) => field.errors?.length === 0)).toBe(true)
  })
})
