import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { personIdForEmail } from '../ids.ts'

describe('personIdForEmail', () => {
  it('is the same every time, whatever the case or spaces', () => {
    expect(personIdForEmail('omkar@gmail.com')).toBe(personIdForEmail('omkar@gmail.com'))
    expect(personIdForEmail(' Omkar@Gmail.com ')).toBe(personIdForEmail('omkar@gmail.com'))
  })

  it('differs for different emails', () => {
    const ids = ['a@gmail.com', 'b@gmail.com', 'priya@gmail.com', 'priya2@gmail.com'].map(personIdForEmail)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('is a valid UUID, as zod and Postgres require', () => {
    for (const email of ['a@gmail.com', 'omkar@gmail.com', 'x']) {
      expect(z.uuid().safeParse(personIdForEmail(email)).success).toBe(true)
    }
  })
})
