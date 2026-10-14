/** A name as compared for "already exists": no case, no extra spaces. */
export function comparableName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}
