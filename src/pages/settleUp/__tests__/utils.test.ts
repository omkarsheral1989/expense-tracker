import { describe, expect, it } from 'vitest'
import { ROUTES } from '../../../routes.ts'
import { settleBackTo } from '../utils.ts'

const GROUP = '3f2a9c1e-0000-4000-8000-000000000001'

describe('settleBackTo', () => {
  it('leads back to the balances page when it opened Settle up', () => {
    expect(settleBackTo({ settle: {}, from: 'balances' }, GROUP)).toBe(ROUTES.balances(GROUP))
  })

  it('leads back to the group page in every other case', () => {
    expect(settleBackTo(null, GROUP)).toBe(ROUTES.group(GROUP))
    expect(settleBackTo(undefined, GROUP)).toBe(ROUTES.group(GROUP))
    expect(settleBackTo({}, GROUP)).toBe(ROUTES.group(GROUP))
    expect(settleBackTo({ group: { id: GROUP } }, GROUP)).toBe(ROUTES.group(GROUP))
    expect(settleBackTo({ from: 'activity' }, GROUP)).toBe(ROUTES.group(GROUP))
    expect(settleBackTo({ from: 5 }, GROUP)).toBe(ROUTES.group(GROUP))
  })
})
