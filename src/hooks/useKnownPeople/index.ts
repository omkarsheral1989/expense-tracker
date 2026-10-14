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
export function useKnownPeople(userEmail: string) {
  const [result, setResult] = useState<{
    userEmail: string
    people: KnownPerson[]
  } | null>(null)

  useEffect(() => {
    let cancelled = false

    getDb()
      .then((db) => groupService.listKnownPeople(db, userEmail))
      .catch((): KnownPerson[] => [])
      .then((people) => {
        if (!cancelled) setResult({ userEmail, people })
      })

    return () => {
      cancelled = true
    }
  }, [userEmail])

  const add = useCallback(
    (person: KnownPerson) => {
      setResult((current) => {
        const people = current?.userEmail === userEmail ? current.people : []
        const label = (entry: KnownPerson) => groupService.displayName(entry).toLowerCase()
        return {
          userEmail,
          people: [...people, person].sort((a, b) => label(a).localeCompare(label(b))),
        }
      })
    },
    [userEmail],
  )

  const loaded = result?.userEmail === userEmail
  return { people: loaded ? result.people : [], loading: !loaded, add }
}
