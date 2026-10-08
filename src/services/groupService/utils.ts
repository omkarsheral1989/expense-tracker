/**
 * How a sentence names another person: their first name ("Priya" for "Priya
 * Shah"), or the part of their email before the "@" when no name is known.
 */
export function shortName(person: { name: string | null; email: string }): string {
  const first = person.name?.trim().split(/\s+/)[0]
  return first || person.email.split('@')[0]
}
