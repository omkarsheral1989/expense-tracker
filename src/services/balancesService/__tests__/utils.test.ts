import { describe, expect, it } from 'vitest'
import { simplifyDebts } from '../utils.ts'

const net = (personId: string, netMinor: number) => ({ personId, netMinor })

describe('simplifyDebts', () => {
  it('has nobody pay when everyone is square', () => {
    expect(simplifyDebts([])).toEqual([])
    expect(simplifyDebts([net('a', 0), net('b', 0)])).toEqual([])
  })

  it('has the one person who owes pay the one person who is owed', () => {
    expect(simplifyDebts([net('a', 700), net('b', -700)])).toEqual([{ fromId: 'b', toId: 'a', amountMinor: 700 }])
  })

  it('has the biggest debtor pay the biggest creditor first, as much as they can', () => {
    const transfers = simplifyDebts([net('a', 1000), net('b', 300), net('c', -900), net('d', -400)])

    expect(transfers).toEqual([
      { fromId: 'c', toId: 'a', amountMinor: 900 },
      // The creditor still owed most is paid next: b is owed 300, a only 100.
      { fromId: 'd', toId: 'b', amountMinor: 300 },
      { fromId: 'd', toId: 'a', amountMinor: 100 },
    ])
  })

  it('never has a person both pay and receive, and settles every net exactly', () => {
    const nets = [net('a', 1800), net('b', -600), net('c', -1200), net('d', 250), net('e', -250)]

    const transfers = simplifyDebts(nets)

    const paid = new Set(transfers.map((transfer) => transfer.fromId))
    const received = new Set(transfers.map((transfer) => transfer.toId))
    expect([...paid].filter((id) => received.has(id))).toEqual([])
    for (const { personId, netMinor } of nets) {
      const got = transfers.filter((transfer) => transfer.toId === personId).reduce((sum, transfer) => sum + transfer.amountMinor, 0)
      const gave = transfers.filter((transfer) => transfer.fromId === personId).reduce((sum, transfer) => sum + transfer.amountMinor, 0)
      expect(got - gave).toBe(netMinor)
    }
  })

  it('breaks a tie between equal amounts by person id, so every device finds the same payments', () => {
    const forward = simplifyDebts([net('b', 500), net('a', 500), net('d', -500), net('c', -500)])
    const reversed = simplifyDebts([net('c', -500), net('d', -500), net('a', 500), net('b', 500)])

    expect(forward).toEqual([
      { fromId: 'c', toId: 'a', amountMinor: 500 },
      { fromId: 'd', toId: 'b', amountMinor: 500 },
    ])
    expect(reversed).toEqual(forward)
  })

  it('leaves an unmatched remainder alone when the nets do not add up to zero', () => {
    expect(simplifyDebts([net('a', 500), net('b', -200)])).toEqual([{ fromId: 'b', toId: 'a', amountMinor: 200 }])
  })

  it('does not change what it is given', () => {
    const nets = [net('a', 500), net('b', -500)]
    simplifyDebts(nets)
    expect(nets).toEqual([net('a', 500), net('b', -500)])
  })
})
