/**
 * How a sentence names another person: their first name ("Priya" for "Priya
 * Shah"), or the part of their email before the "@" when no name is known.
 * With `sentenceStart`, the first letter is a capital ("Sam" for sam@gmail.com),
 * for a name that opens a sentence.
 */
export function shortName(
  person: { name: string | null; email: string },
  { sentenceStart = false }: { sentenceStart?: boolean } = {},
): string {
  const first = person.name?.trim().split(/\s+/)[0]
  const name = first || person.email.split('@')[0]
  return sentenceStart ? name.charAt(0).toUpperCase() + name.slice(1) : name
}
