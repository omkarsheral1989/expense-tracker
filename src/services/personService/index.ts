import { and, eq, isNull, ne, sql } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import { logService } from '../logService'
import { people } from '../../db/schema.ts'
import { MEMBER_EMAIL_DOMAIN } from './constants.ts'
import { shownName } from '../../db/shownName.ts'
import { syncStatus } from '../../db/schema.ts'
import { addPersonSchema, toFieldErrors, toUpdateFieldErrors, updatePersonSchema } from './schemas.ts'
import type {
  AddPersonErrors,
  AddPersonInput,
  AddPersonResult,
  ManagedPerson,
  UpdatePersonErrors,
  UpdatePersonInput,
  UpdatePersonResult,
} from './types.ts'
import { comparableName } from './utils.ts'

const personServiceBase = {
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
        .select({ name: shownName(people) })
        .from(people)
        .where(
          and(
            isNull(people.deletedAt),
            sql`lower(regexp_replace(trim(coalesce(${people.localName}, ${people.name})), '\\s+', ' ', 'g')) = ${comparableName(name)}`,
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

  /**
   * Everyone saved on this device except the user, for the members page, by the
   * name shown (a person with none, by email). `pending` is true until this
   * device has read the person's own file in some group (ADR-044).
   */
  async listManaged(db: Database, userId: string): Promise<ManagedPerson[]> {
    const rows = await db
      .select({ id: people.id, email: people.email, sharedName: people.name, localName: people.localName, picture: people.picture })
      .from(people)
      .where(and(isNull(people.deletedAt), ne(people.id, userId)))
    const scopes = await db.select({ scope: syncStatus.scope }).from(syncStatus)
    const seen = new Set(
      scopes.filter(({ scope }) => scope.startsWith('member:')).map(({ scope }) => scope.slice(scope.lastIndexOf(':') + 1)),
    )
    const label = (person: { localName: string | null; sharedName: string | null; email: string | null }) =>
      (person.localName ?? person.sharedName ?? person.email ?? '').toLowerCase()
    return rows
      .map((row) => ({ ...row, pending: !seen.has(row.id) }))
      .sort((a, b) => label(a).localeCompare(label(b)))
  },

  /**
   * Gives a person the name this device uses for them (required) and, while they are pending, sets their email. The name must
   * not be one shown for anyone else on this device; the email must be a Gmail
   * address nobody else on this device has. Neither moves a group on the home
   * list. Problems come back as one message per field.
   */
  async updatePerson(
    db: Database,
    userId: string,
    personId: string,
    input: UpdatePersonInput,
  ): Promise<UpdatePersonResult> {
    const parsed = updatePersonSchema.safeParse(input)
    if (!parsed.success) return { ok: false, errors: toUpdateFieldErrors(parsed.error) }
    const { email } = parsed.data

    return db.transaction(async (tx): Promise<UpdatePersonResult> => {
      const [person] = await tx
        .select({ id: people.id, email: people.email, name: people.name, localName: people.localName })
        .from(people)
        .where(and(eq(people.id, personId), isNull(people.deletedAt), ne(people.id, userId)))
      if (!person) return { ok: false, notFound: true }

      // A name equal to the shared one is no local name at all.
      const localName =
        person.name && comparableName(parsed.data.localName) === comparableName(person.name)
          ? null
          : parsed.data.localName

      const errors: UpdatePersonErrors = {}
      const set: Partial<typeof people.$inferInsert> = {}

      if (localName !== person.localName) {
        if (localName) {
          const others = await tx
            .select({ name: shownName(people) })
            .from(people)
            .where(and(isNull(people.deletedAt), ne(people.id, personId)))
          const clash = others.find((other) => other.name && comparableName(other.name) === comparableName(localName))
          if (clash) errors.localName = `You already have someone called ${clash.name}.`
        }
        set.localName = localName
      }

      if (email && email !== person.email) {
        const [pending] = await tx
          .select({ scope: syncStatus.scope })
          .from(syncStatus)
          .where(sql`${syncStatus.scope} like ${'member:%:' + personId}`)
          .limit(1)
        const [sameEmail] = await tx
          .select({ id: people.id, name: shownName(people) })
          .from(people)
          .where(eq(people.email, email))
        if (pending) errors.email = 'This person has already signed in, so their email cannot be changed.'
        else if (sameEmail?.id === userId) errors.email = 'That is your own address.'
        else if (sameEmail) errors.email = `${sameEmail.name ?? email} is already in your list with this email.`
        set.email = email
      }

      if (Object.keys(errors).length > 0) return { ok: false, errors }
      if (Object.keys(set).length === 0) return { ok: true }

      // The local name belongs to this device alone, so a change to it alone
      // leaves the person's synced row (and the groups' order) as it is.
      if (set.email !== undefined) Object.assign(set, { updatedAt: new Date(), updatedBy: userId })
      await tx.update(people).set(set).where(eq(people.id, personId))
      return { ok: true }
    })
  },
}

/** personService with one log line per action (ADR-048). */
export const personService: typeof personServiceBase = logService.logActions(logService.scope('person'), personServiceBase, {
  addPerson: { message: 'Person added', params: ['userId'] },
  updatePerson: { message: 'Person updated', params: ['userId', 'personId'] },
})
