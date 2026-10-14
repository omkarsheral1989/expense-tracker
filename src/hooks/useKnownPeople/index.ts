import { useCallback, useEffect, useState } from 'react'
import { getDb } from '../../db/client.ts'
import { groupService } from '../../services/groupService'
import type { KnownPerson } from '../../services/personService/types.ts'

/**
 * The people saved on this device (never the user), for picking as members.
 * Loaded once when the component mounts, from the open database. If it cannot
 * be read the list is empty, because the user can still add someone new.
 * `add` puts a person who has just been saved into the list, in order.
 */
export function useKnownPeople(userId: string) {
  const [result, setResult] = useState<{
    userId: string
    people: KnownPerson[]
  } | null>(null)

  useEffect(() => {
    let cancelled = false

    getDb()
      .then((db) => groupService.listKnownPeople(db, userId))
      .catch((): KnownPerson[] => [])
      .then((people) => {
        if (!cancelled) setResult({ userId, people })
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  const add = useCallback(
    (person: KnownPerson) => {
      setResult((current) => {
        const people = current?.userId === userId ? current.people : []
        const label = (entry: KnownPerson) => groupService.displayName(entry).toLowerCase()
        return {
          userId,
          people: [...people, person].sort((a, b) => label(a).localeCompare(label(b))),
        }
      })
    },
    [userId],
  )

  const loaded = result?.userId === userId
  return { people: loaded ? result.people : [], loading: !loaded, add }
}
