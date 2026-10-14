// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEVICE_KEY } from '../constants.ts'
import { deviceService } from '../index.ts'

const priya = { id: 'g-priya', email: 'priya@gmail.com', name: 'Priya' }
const omkar = { id: 'g-omkar', email: 'omkar@gmail.com', name: 'Omkar' }

function stored() {
  return JSON.parse(localStorage.getItem(DEVICE_KEY) ?? 'null')
}

describe('deviceService', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  describe('read', () => {
    it('is null before anyone has used the app on this device', () => {
      expect(deviceService.read()).toBeNull()
    })

    it('is null for a record that is damaged or not a record', () => {
      for (const raw of ['not json', '{}', '{"datasetId":""}', '{"datasetId":"d","userPersonId":5,"owner":null}', 'null']) {
        localStorage.setItem(DEVICE_KEY, raw)
        expect(deviceService.read()).toBeNull()
      }
    })

    it('is null when storage cannot be read', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked')
      })
      expect(deviceService.read()).toBeNull()
    })
  })

  describe('forGuest', () => {
    it('starts a new dataset with a fresh person for the guest, and no owner', () => {
      const record = deviceService.forGuest()

      expect(record.owner).toBeNull()
      expect(record.datasetId).toMatch(/^[0-9a-f-]{36}$/)
      expect(record.userPersonId).toMatch(/^[0-9a-f-]{36}$/)
      expect(record.userPersonId).not.toBe(record.datasetId)
      expect(stored()).toEqual(record)
    })

    it('gives the same dataset every time, so Continue as a guest opens what is already there', () => {
      const first = deviceService.forGuest()
      expect(deviceService.forGuest()).toEqual(first)
    })

    it('opens the data of an account that has signed out, owner and all', () => {
      deviceService.forGoogle(omkar)

      const record = deviceService.forGuest()

      expect(record.datasetId).toBe(omkar.id)
      expect(record.owner).toEqual({ accountId: omkar.id, email: omkar.email })
    })
  })

  describe('forGoogle', () => {
    it('uses the account\'s own database as the data when nothing is on the device yet', () => {
      const result = deviceService.forGoogle(omkar)

      expect(result).toEqual({
        ok: true,
        record: { datasetId: 'g-omkar', userPersonId: null, owner: { accountId: 'g-omkar', email: 'omkar@gmail.com' } },
      })
      expect(stored()).toEqual(result.ok && result.record)
    })

    it('makes the account the owner of a guest\'s data, keeping its dataset and person', () => {
      const guest = deviceService.forGuest()

      const result = deviceService.forGoogle(omkar)

      expect(result).toEqual({
        ok: true,
        record: { datasetId: guest.datasetId, userPersonId: guest.userPersonId, owner: { accountId: 'g-omkar', email: 'omkar@gmail.com' } },
      })
    })

    it('lets the owner sign in again, and again', () => {
      deviceService.forGoogle(omkar)
      const second = deviceService.forGoogle({ ...omkar, name: 'Omkar S.' })
      expect(second.ok).toBe(true)
      expect(deviceService.read()?.datasetId).toBe('g-omkar')
    })

    it('refuses a different account, naming the owner, and changes nothing', () => {
      deviceService.forGoogle(omkar)
      const before = stored()

      expect(deviceService.forGoogle(priya)).toEqual({ ok: false, ownerEmail: 'omkar@gmail.com' })
      expect(stored()).toEqual(before)
    })

    it('refuses a different account for a guest\'s data that an account already owns', () => {
      deviceService.forGuest()
      deviceService.forGoogle(omkar)

      expect(deviceService.forGoogle(priya)).toEqual({ ok: false, ownerEmail: 'omkar@gmail.com' })
    })
  })

  describe('setUserPersonId', () => {
    it('remembers who the user\'s person is', () => {
      deviceService.forGoogle(omkar)

      const record = deviceService.setUserPersonId('person-1')

      expect(record?.userPersonId).toBe('person-1')
      expect(deviceService.read()?.userPersonId).toBe('person-1')
      expect(deviceService.read()?.owner?.email).toBe('omkar@gmail.com')
    })

    it('does nothing when there is no record', () => {
      expect(deviceService.setUserPersonId('person-1')).toBeNull()
      expect(localStorage.getItem(DEVICE_KEY)).toBeNull()
    })
  })

  it('still works for this visit when storage cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(deviceService.forGuest().owner).toBeNull()
    expect(deviceService.forGoogle(omkar).ok).toBe(true)
  })
})
