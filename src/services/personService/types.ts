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

/** A person saved on this device, for picking as a member. */
export type KnownPerson = {
  id: string
  /** Null for a person added by name only. */
  email: string | null
  name: string | null
  /** The address of their Google picture, once known (ADR-046). */
  picture?: string | null
}

/** A person on the members page, with what the edit dialog needs. */
export type ManagedPerson = {
  id: string
  email: string | null
  /** The name shared with every member (what the person is called elsewhere). */
  sharedName: string | null
  /** What this device calls them instead (ADR-045), or null. */
  localName: string | null
  /** The address of their Google picture, once known (ADR-046). */
  picture: string | null
  /** Nobody has seen them sign in and sync in any group, so their email can still be set. Never true for the user. */
  pending: boolean
  /** The user themself, listed first; only their name can be changed here. */
  isYou: boolean
}

/** What the edit dialog sends: the name this device uses for the person (required), and, while they are pending, their email. */
export type UpdatePersonInput = {
  localName: string
  email?: string
}

export type UpdatePersonField = keyof UpdatePersonInput

export type UpdatePersonErrors = Partial<Record<UpdatePersonField, string>>

export type UpdatePersonResult =
  | { ok: true }
  | { ok: false; errors: UpdatePersonErrors }
  | { ok: false; notFound: true }
