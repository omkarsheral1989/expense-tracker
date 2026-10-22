import { eq } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import { people } from '../../db/schema.ts'
import type { DeviceRecord } from '../deviceService/types.ts'
import type { Profile } from '../googleProfileService/types.ts'
import { GOOGLE_NAME_TIME, GUEST_NAME } from './constants.ts'
import type { ResolvedUser } from './types.ts'
import { mergePeople } from './utils.ts'

export const userService = {
  /** What a guest's own person is called until they sign in. */
  guestName: GUEST_NAME,

  /**
   * Finds the user's own person in the data, adding or updating it as needed,
   * when the data is opened (ADR-035):
   * - a guest gets a person named "Guest" with no email;
   * - signing in with Google gives that person the account's email, and the
   *   account's name unless someone typed a name for them (a typed name always
   *   wins a sync, so a name from Google is saved at `GOOGLE_NAME_TIME`);
   * - if another person already has that email (someone added them as a
   *   member), the guest's person is merged into it, so there is one person;
   * - with no person id on record (data made before guests existed), the person
   *   with the account's email is the user.
   * Safe to repeat: when nothing has changed it only reads. The caller keeps the
   * returned id in the device record.
   */
  async resolve(
    db: Database,
    record: Pick<DeviceRecord, 'userPersonId'>,
    profile: Profile | null,
  ): Promise<ResolvedUser> {
    return db.transaction(async (tx): Promise<ResolvedUser> => {
      let person = record.userPersonId
        ? (await tx.select().from(people).where(eq(people.id, record.userPersonId)))[0]
        : undefined
      if (!person && profile) {
        person = (await tx.select().from(people).where(eq(people.email, profile.email)))[0]
      }

      if (!person) {
        const id = record.userPersonId ?? crypto.randomUUID()
        const name = profile?.name ?? GUEST_NAME
        const email = profile?.email ?? null
        await tx.insert(people).values({ id, name, email, updatedAt: GOOGLE_NAME_TIME, updatedBy: id })
        return { personId: id, name, email }
      }

      if (profile && person.email !== profile.email) {
        const [member] = await tx.select().from(people).where(eq(people.email, profile.email))
        if (member) {
          await mergePeople(tx, person.id, member.id)
          person = member
        } else {
          const [linked] = await tx
            .update(people)
            .set({ email: profile.email, updatedAt: GOOGLE_NAME_TIME, updatedBy: person.id })
            .where(eq(people.id, person.id))
            .returning()
          person = linked
        }
      }

      // A name from Google follows the account; a name someone typed is kept.
      const nameFromGoogle = person.name === null || person.updatedAt.getTime() === GOOGLE_NAME_TIME.getTime()
      if (profile && nameFromGoogle && person.name !== profile.name) {
        await tx
          .update(people)
          .set({ name: profile.name, updatedAt: GOOGLE_NAME_TIME, updatedBy: person.id })
          .where(eq(people.id, person.id))
        person = { ...person, name: profile.name }
      }

      return { personId: person.id, name: person.name ?? GUEST_NAME, email: person.email }
    })
  },
}
