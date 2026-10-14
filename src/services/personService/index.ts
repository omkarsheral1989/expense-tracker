import { and, eq, isNull, sql } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import { people } from '../../db/schema.ts'
import { MEMBER_EMAIL_DOMAIN } from './constants.ts'
import { addPersonSchema, toFieldErrors } from './schemas.ts'
import type { AddPersonErrors, AddPersonInput, AddPersonResult } from './types.ts'
import { comparableName } from './utils.ts'

export const personService = {
  /** The domain a member's email must have, when they have one. */
  memberEmailDomain: MEMBER_EMAIL_DOMAIN,

  /**
   * Saves a new person on this device, to be picked as a member of any group.
   * The name is required and must not be one already on this device (ignoring
   * case and extra spaces); the email is optional, must be a Gmail address, and
   * must not be one already on this device. Problems come back as one message
   * per field, to show beside it; only unexpected failures throw.
   */
  async addPerson(
    db: Database,
    adderId: string,
    input: AddPersonInput,
  ): Promise<AddPersonResult> {
    const parsed = addPersonSchema.safeParse(input)
    if (!parsed.success) return { ok: false, errors: toFieldErrors(parsed.error) }

    const { name, email } = parsed.data

    return db.transaction(async (tx): Promise<AddPersonResult> => {
      // Both checks are done in the same transaction as the insert, so nothing
      // can slip in between the check and the save.
      const errors: AddPersonErrors = {}

      if (email) {
        const [sameEmail] = await tx
          .select({ id: people.id, name: people.name })
          .from(people)
          .where(eq(people.email, email))
        if (sameEmail?.id === adderId) {
          errors.email = 'That is your own address. You are added automatically.'
        } else if (sameEmail) {
          errors.email = `${sameEmail.name ?? email} is already in your list with this email.`
        }
      }

      const [sameName] = await tx
        .select({ name: people.name })
        .from(people)
        .where(
          and(
            isNull(people.deletedAt),
            sql`lower(regexp_replace(trim(${people.name}), '\\s+', ' ', 'g')) = ${comparableName(name)}`,
          ),
        )
        .limit(1)
      if (sameName) errors.name = `You already have someone called ${sameName.name}.`

      if (Object.keys(errors).length > 0) return { ok: false, errors }

      const id = crypto.randomUUID()
      await tx.insert(people).values({ id, name, email: email ?? null, updatedBy: adderId })
      return { ok: true, person: { id, name, email: email ?? null } }
    })
  },
}
