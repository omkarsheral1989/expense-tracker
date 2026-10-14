import { eq } from 'drizzle-orm'
import { people } from '../../db/schema.ts'
import type { Transaction } from '../groupService/types.ts'

/** A name as compared for "already exists": no case, no extra spaces. */
export function comparableName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Finds the person with this email, or adds them. Returns their id. Used for
 * the signed-in user, who has an email, when they first create a group.
 */
export async function findOrAddPerson(
  tx: Transaction,
  { email, name }: { email: string; name: string | null },
): Promise<string> {
  const [existing] = await tx
    .select({ id: people.id, name: people.name })
    .from(people)
    .where(eq(people.email, email))

  if (existing) {
    // Keep a person's own name up to date when they sign in.
    if (name && existing.name !== name) {
      await tx
        .update(people)
        .set({ name, updatedAt: new Date(), updatedBy: existing.id })
        .where(eq(people.id, existing.id))
    }
    return existing.id
  }

  // A person who adds themselves is their own `updated_by`.
  const id = crypto.randomUUID()
  await tx.insert(people).values({ id, email, name, updatedBy: id })
  return id
}
