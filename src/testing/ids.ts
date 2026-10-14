/**
 * A person id worked out from an email, the same every time. In a test the
 * signed-in user (`useAuthStore`'s profile) and the people the test helpers
 * save for that email then have the same id without a database lookup. The id
 * is a valid UUID (version 4 and variant bits set), as zod's `uuid()` requires.
 */
export function personIdForEmail(email: string): string {
  const text = email.trim().toLowerCase()
  let hex = ''
  // Four 32-bit FNV-1a hashes with different seeds make 128 bits.
  for (let seed = 0; seed < 4; seed++) {
    let hash = (0x811c9dc5 ^ (seed * 0x9e3779b1)) >>> 0
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    hex += hash.toString(16).padStart(8, '0')
  }
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
