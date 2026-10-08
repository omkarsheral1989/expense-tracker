/**
 * How a sentence names another person: their first name ("Priya" for "Priya
 * Shah"), or the part of their email before the "@" with a capital first
 * letter when no name is known ("Sam" for sam@gmail.com).
 */
export function shortName(person: { name: string | null; email: string }): string {
  const first = person.name?.trim().split(/\s+/)[0]
  if (first) return first
  const local = person.email.split('@')[0]
  return local.charAt(0).toUpperCase() + local.slice(1)
}
