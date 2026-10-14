/**
 * How a sentence names another person: their first name ("Priya" for "Priya
 * Shah"), or the part of their email before the "@" with a capital first
 * letter when no name is known ("Sam" for sam@gmail.com).
 */
export function shortName(person: { name: string | null; email: string | null }): string {
  const first = person.name?.trim().split(/\s+/)[0]
  if (first) return first
  const local = person.email?.split('@')[0]
  if (!local) return 'Someone'
  return local.charAt(0).toUpperCase() + local.slice(1)
}

/** How a list names a person: their name, or their email when no name is known. */
export function displayName(person: { name: string | null; email: string | null }): string {
  return person.name ?? person.email ?? 'Someone'
}
