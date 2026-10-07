import { describe, expect, it } from 'vitest'
import type { FormValues } from '../types.ts'
import { hasUnsavedInput, toFormFields } from '../utils.ts'

const initial: FormValues = {
  name: '',
  type: 'trip',
  defaultCurrency: 'INR',
  memberEmails: [],
}

describe('hasUnsavedInput', () => {
  it('is false for a form nobody has touched', () => {
    expect(hasUnsavedInput({ ...initial }, initial)).toBe(false)
    expect(hasUnsavedInput(undefined, initial)).toBe(false)
  })

  it('is false when only spaces were typed in the name', () => {
    expect(hasUnsavedInput({ ...initial, name: '   ' }, initial)).toBe(false)
  })

  it('is true once a name is typed', () => {
    expect(hasUnsavedInput({ ...initial, name: 'Goa' }, initial)).toBe(true)
  })

  it('is true when the type or the currency was changed', () => {
    expect(hasUnsavedInput({ ...initial, type: 'home' }, initial)).toBe(true)
    expect(hasUnsavedInput({ ...initial, defaultCurrency: 'USD' }, initial)).toBe(true)
  })

  it('is true once a member is added', () => {
    expect(
      hasUnsavedInput({ ...initial, memberEmails: ['a@gmail.com'] }, initial),
    ).toBe(true)
  })

  it('is false again when a change is undone', () => {
    expect(hasUnsavedInput({ ...initial, type: 'trip', memberEmails: [] }, initial)).toBe(false)
  })

  it('notices a currency being chosen when none was preselected', () => {
    const noRegion: FormValues = { ...initial, defaultCurrency: undefined }
    expect(hasUnsavedInput({ ...noRegion }, noRegion)).toBe(false)
    expect(hasUnsavedInput({ ...noRegion, defaultCurrency: 'EUR' }, noRegion)).toBe(true)
  })
})

describe('toFormFields', () => {
  it('puts each message under its own field', () => {
    expect(toFormFields({ name: 'Enter a group name.', defaultCurrency: 'Choose a currency.' })).toEqual([
      { name: 'name', errors: ['Enter a group name.'] },
      { name: 'type', errors: [] },
      { name: 'defaultCurrency', errors: ['Choose a currency.'] },
      { name: 'memberEmails', errors: [] },
    ])
  })

  it('clears every field when there is nothing to report', () => {
    expect(toFormFields({}).every((field) => field.errors?.length === 0)).toBe(true)
  })
})
