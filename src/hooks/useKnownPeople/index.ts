import { useEffect, useState } from 'react'
import { getDb } from '../../db/client.ts'
import { groupService } from '../../services/groupService'
import type { KnownPerson } from '../../services/groupService/types.ts'

/**
 * The people the user already shares a group with (never the user), for picking
 * as members. Loaded once when the component mounts, from the open database. If
 * it cannot be read the list is empty, because the user can still type an
 * address.
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

  const loaded = result?.userEmail === userEmail
  return { people: loaded ? result.people : [], loading: !loaded }
}
