/** What the add-a-member dialog sends. The email is optional and may be in any case. */
export type AddPersonInput = {
  name: string
  email?: string
}

/** The fields of the dialog a problem can be attached to. */
export type AddPersonField = keyof AddPersonInput

/** One message per field, shown beside that field. */
export type AddPersonErrors = Partial<Record<AddPersonField, string>>

export type AddPersonResult =
  | { ok: true; person: KnownPerson }
  | { ok: false; errors: AddPersonErrors }

/** Who is adding the person: the signed-in user. */
export type PersonAdder = {
  email: string
  name: string
}

/** A person saved on this device, for picking as a member. */
export type KnownPerson = {
  id: string
  /** Null for a person added by name only. */
  email: string | null
  name: string | null
}
