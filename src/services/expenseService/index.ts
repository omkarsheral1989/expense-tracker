import { and, asc, desc, eq, inArray, isNull, max, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { displayName } from '../groupService/utils.ts'
import type { Database } from '../../db/client.ts'
import { EXPENSE_EVENT_KINDS } from '../../db/constants.ts'
import {
  expensePhotos,
  expenseEvents,
  expenseShares,
  expenses,
  groupMembers,
  groups,
  people,
} from '../../db/schema.ts'
import type { ExpenseChange, ExpenseEventKind, ExpenseSnapshot } from '../../db/types.ts'
import {
  CATEGORY_GROUPS,
  DEFAULT_CATEGORY,
  RECENT_CURRENCY_COUNT,
  SETTLEMENT_CATEGORY,
  SETTLEMENT_DESCRIPTION,
} from './constants.ts'
import { createExpenseSchema, toFieldErrors } from './schemas.ts'
import type {
  CreateExpenseInput,
  CreateExpenseResult,
  CreateSettlementErrors,
  CreateSettlementInput,
  CreateSettlementResult,
  CurrencyBalance,
  DeleteExpenseResult,
  ExpenseDetails,
  ExpenseHistoryEntry,
  ExpensePerson,
  ExpenseListItem,
  ExpensePayer,
  ExpenseToEdit,
  PersonBalance,
  ExpenseVersion,
  RestoreExpenseResult,
  RestoreVersionResult,
  UpdateExpenseInput,
  UpdateExpenseResult,
} from './types.ts'
import {
  CATEGORIES,
  categoryOf,
  computeShares,
  expenseChanges,
  pairBalances,
  payerOf,
  sameSnapshot,
  sameSplitInput,
  settlementSentence,
  titleOf,
} from './utils.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const expenseService = {
  /** The categories in their groups, as the picker lists them (a settlement's is not offered). */
  categoryGroups: CATEGORY_GROUPS.filter((group) => group.key !== SETTLEMENT_CATEGORY),

  /** The category of a settlement. */
  settlementCategory: SETTLEMENT_CATEGORY,

  /** What the details page calls an expense: its description, or who paid whom for a settlement. */
  titleOf,

  /** Who paid whom in a settlement: "You paid Priya", "Priya paid you". */
  settlementSentence,

  /** Every category, in the picker's order. */
  categories: CATEGORIES,

  /** The category a new expense starts with. */
  defaultCategory: DEFAULT_CATEGORY,

  /** The category with this key; an unknown key reads as the default one. */
  categoryOf,

  /**
   * Adds an expense to a group, with who paid and how it is split, all or
   * nothing. Anything wrong with the input, including a split that does not
   * add up, comes back as one message per field, to show beside it; every
   * problem is reported at once. A user who is not a member of the group, or a
   * group that does not exist, is unexpected (the page only offers groups the
   * user is in) and throws.
   */
  async createExpense(
    db: Database,
    userId: string,
    groupId: string,
    input: CreateExpenseInput,
  ): Promise<CreateExpenseResult> {
    const parsed = createExpenseSchema.safeParse(input)

    return db.transaction(async (tx): Promise<CreateExpenseResult> => {
      const members = await tx
        .select({ personId: groupMembers.personId })
        .from(groupMembers)
        .innerJoin(groups, and(eq(groups.id, groupMembers.groupId), isNull(groups.deletedAt)))
        .where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.deletedAt)))
      const memberIds = members.map((member) => member.personId)
      if (!memberIds.includes(userId)) throw new Error('The user is not a member of this group.')

      const errors = parsed.success ? {} : toFieldErrors(parsed.error)
      // The split can only be checked against a usable amount.
      const amountMinor = parsed.success ? parsed.data.amountMinor : input.amountMinor
      const result =
        typeof amountMinor === 'number' && Number.isSafeInteger(amountMinor) && amountMinor > 0 && !errors.split
          ? computeShares(amountMinor, input.split, input.paidBy, memberIds)
          : null
      if (result && !result.ok) {
        if (result.message === 'Choose who paid.') errors.paidBy ??= result.message
        else errors.split = result.message
      }
      if (!parsed.success || !result?.ok) return { ok: false, errors }

      const { description, category, currency, date, notes, split, receipts } = parsed.data
      const id = crypto.randomUUID()
      const updatedAt = new Date()
      await tx.insert(expenses).values({
        id,
        groupId,
        description,
        category,
        amountMinor: parsed.data.amountMinor,
        currency,
        date,
        notes,
        method: split.method,
        createdBy: userId,
        createdAt: updatedAt,
        updatedBy: userId,
        updatedAt,
      })
      await tx.insert(expenseShares).values(
        result.shares.map((share) => ({
          ...share,
          expenseId: id,
          updatedBy: userId,
          updatedAt,
        })),
      )
      if (receipts.length > 0) {
        await tx.insert(expensePhotos).values(
          receipts.map((receipt, position) => ({
            id: receipt.id,
            expenseId: id,
            position,
            mimeType: receipt.mimeType,
            sizeBytes: receipt.sizeBytes,
            updatedBy: userId,
            updatedAt,
          })),
        )
      }
      await recordEvent(tx, {
        groupId,
        expenseId: id,
        kind: 'added',
        userId,
        at: updatedAt,
        snapshot: {
          description,
          category,
          amountMinor: parsed.data.amountMinor,
          currency,
          date,
          notes,
          method: split.method,
          shares: result.shares,
          photos: receipts.map((receipt, position) => ({ ...receipt, position })),
        },
      })
      return { ok: true, expenseId: id }
    })
  },

  /**
   * Records that one member paid another outside the app ("You paid Priya"),
   * so it counts against what they owe each other. A settlement is saved as an
   * expense in the 'settlement' category: the payer paid all of it and the
   * recipient owes all of it, so balances, the list and the details page work
   * with no extra code. Problems come back as one message per field, like
   * `createExpense`; the payer and the recipient must be different members.
   */
  async createSettlement(
    db: Database,
    userId: string,
    groupId: string,
    input: CreateSettlementInput,
  ): Promise<CreateSettlementResult> {
    const recipientProblem = !input.recipientId
      ? 'Choose who received it.'
      : input.recipientId === input.payerId
        ? 'Choose someone other than the payer.'
        : undefined

    const result = await expenseService.createExpense(db, userId, groupId, {
      description: SETTLEMENT_DESCRIPTION,
      category: SETTLEMENT_CATEGORY,
      amountMinor: input.amountMinor,
      currency: input.currency,
      date: input.date,
      notes: input.notes,
      paidBy: input.payerId,
      // With no usable recipient the split is left empty, which cannot add up,
      // so nothing is saved.
      split: {
        method: 'exact',
        values: recipientProblem ? {} : { [input.recipientId]: input.amountMinor ?? 0 },
      },
      receipts: input.receipts,
    })
    if (result.ok) return result

    const { amountMinor, currency, date, notes, receipts, paidBy, split } = result.errors
    const errors: CreateSettlementErrors = {
      amountMinor,
      currency,
      date,
      notes,
      receipts,
      payerId: paidBy,
      recipientId: recipientProblem ?? (split ? 'Choose someone from the group.' : undefined),
    }
    return {
      ok: false,
      errors: Object.fromEntries(Object.entries(errors).filter(([, message]) => message)),
    }
  },

  /**
   * A group's expenses as one user sees them: newest day first (the most
   * recently added first within a day, so an edit or a deletion never moves
   * one), each with who paid and what the user paid and owes. A deleted
   * expense is still listed, marked with who deleted it and when, so that the
   * list can show it as a line; the balances never count it. Empty for someone
   * who is not in the group.
   */
  async listExpenses(
    db: Database,
    userId: string,
    groupId: string,
  ): Promise<ExpenseListItem[]> {
    // Only for someone in the group.
    const [member] = await db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.personId, userId),
          isNull(groupMembers.deletedAt),
        ),
      )
    if (!member) return []

    const deleter = alias(people, 'deleter')
    const rows = await db
      .select({
        id: expenses.id,
        description: expenses.description,
        category: expenses.category,
        amountMinor: expenses.amountMinor,
        currency: expenses.currency,
        date: expenses.date,
        deletedAt: expenses.deletedAt,
        deleterId: deleter.id,
        deleterEmail: deleter.email,
        deleterName: deleter.name,
      })
      .from(expenses)
      .leftJoin(deleter, eq(deleter.id, expenses.updatedBy))
      .where(eq(expenses.groupId, groupId))
      .orderBy(desc(expenses.date), desc(expenses.createdAt), desc(expenses.id))
    if (rows.length === 0) return []

    const shares = await db
      .select({
        expenseId: expenseShares.expenseId,
        personId: expenseShares.personId,
        paidMinor: expenseShares.paidMinor,
        owedMinor: expenseShares.owedMinor,
        email: people.email,
        name: people.name,
      })
      .from(expenseShares)
      .innerJoin(people, eq(people.id, expenseShares.personId))
      .where(
        and(
          inArray(
            expenseShares.expenseId,
            rows.map((row) => row.id),
          ),
          isNull(expenseShares.deletedAt),
        ),
      )

    return rows.map((row) => {
      const own = shares.filter((share) => share.expenseId === row.id)
      const mine = own.find((share) => share.personId === userId)
      // The one who paid the most; with one payer, simply the payer.
      const payerShare = own
        .filter((share) => share.paidMinor > 0)
        .sort((a, b) => b.paidMinor - a.paidMinor)[0]
      const payer: ExpensePayer | null = payerShare
        ? {
            personId: payerShare.personId,
            email: payerShare.email,
            name: payerShare.name,
            isYou: payerShare.personId === userId,
          }
        : null

      // A settlement's recipient is the one who owes it all.
      const recipientShare =
        row.category === SETTLEMENT_CATEGORY
          ? own.filter((share) => share.owedMinor > 0).sort((a, b) => b.owedMinor - a.owedMinor)[0]
          : undefined
      const recipient: ExpensePayer | undefined = recipientShare && {
        personId: recipientShare.personId,
        email: recipientShare.email,
        name: recipientShare.name,
        isYou: recipientShare.personId === userId,
      }

      const { deletedAt, deleterId, deleterEmail, deleterName, ...listed } = row
      return {
        ...listed,
        payer,
        ...(recipient && { recipient }),
        ...(deletedAt && {
          deleted: {
            by: { personId: deleterId ?? '', email: deleterEmail, name: deleterName, isYou: deleterId === userId },
            at: deletedAt,
          },
        }),
        yourPaidMinor: mine?.paidMinor ?? 0,
        yourOwedMinor: mine?.owedMinor ?? 0,
        involved: !!mine && (mine.paidMinor > 0 || mine.owedMinor > 0),
      }
    })
  },

  /**
   * One expense with every member's part, for its details page. A deleted
   * expense is returned too, with who deleted it and when (`deleted`), to be
   * shown read-only. Null when the user cannot see it: an unknown or malformed
   * id, one of another group, or a group the user is not a member of (they all
   * look the same, as for groups).
   */
  async getExpense(
    db: Database,
    userId: string,
    groupId: string,
    expenseId: string,
  ): Promise<ExpenseDetails | null> {
    if (!UUID.test(groupId) || !UUID.test(expenseId)) return null

    const [membership] = await db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .innerJoin(groups, and(eq(groups.id, groupMembers.groupId), isNull(groups.deletedAt)))
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.personId, userId),
          isNull(groupMembers.deletedAt),
        ),
      )
    if (!membership) return null

    const deleter = alias(people, 'deleter')
    const [expense] = await db
      .select({
        id: expenses.id,
        groupId: expenses.groupId,
        description: expenses.description,
        category: expenses.category,
        amountMinor: expenses.amountMinor,
        currency: expenses.currency,
        date: expenses.date,
        notes: expenses.notes,
        method: expenses.method,
        createdById: expenses.createdBy,
        createdByEmail: people.email,
        createdByName: people.name,
        createdAt: expenses.createdAt,
        deletedAt: expenses.deletedAt,
        deleterId: deleter.id,
        deleterEmail: deleter.email,
        deleterName: deleter.name,
      })
      .from(expenses)
      .innerJoin(people, eq(people.id, expenses.createdBy))
      .leftJoin(deleter, eq(deleter.id, expenses.updatedBy))
      .where(and(eq(expenses.id, expenseId), eq(expenses.groupId, groupId)))
    if (!expense) return null

    const rows = await db
      .select({
        personId: expenseShares.personId,
        email: people.email,
        name: people.name,
        paidMinor: expenseShares.paidMinor,
        owedMinor: expenseShares.owedMinor,
      })
      .from(expenseShares)
      .innerJoin(people, eq(people.id, expenseShares.personId))
      .where(and(eq(expenseShares.expenseId, expenseId), isNull(expenseShares.deletedAt)))

    const label = (share: { name: string | null; email: string | null }) => displayName(share).toLowerCase()
    const shares = rows
      .filter((row) => row.paidMinor > 0 || row.owedMinor > 0)
      .map((row) => ({ ...row, isYou: row.personId === userId }))
      .sort((a, b) => Number(b.isYou) - Number(a.isYou) || label(a).localeCompare(label(b)))

    const receipts = await db
      .select({ id: expensePhotos.id, mimeType: expensePhotos.mimeType })
      .from(expensePhotos)
      .where(and(eq(expensePhotos.expenseId, expenseId), isNull(expensePhotos.deletedAt)))
      .orderBy(asc(expensePhotos.position), asc(expensePhotos.id))

    const events = await db
      .select({
        id: expenseEvents.id,
        kind: expenseEvents.kind,
        occurredAt: expenseEvents.occurredAt,
        actorId: expenseEvents.actedBy,
        actorEmail: people.email,
        actorName: people.name,
        changes: expenseEvents.changes,
        snapshot: expenseEvents.snapshot,
        restoredFrom: expenseEvents.restoredFrom,
      })
      .from(expenseEvents)
      .innerJoin(people, eq(people.id, expenseEvents.actedBy))
      .where(eq(expenseEvents.expenseId, expenseId))
    // Newest first; events at the same moment keep the order things happen in.
    const history: ExpenseHistoryEntry[] = events
      .toSorted(
        (a, b) =>
          b.occurredAt.getTime() - a.occurredAt.getTime() ||
          EXPENSE_EVENT_KINDS.indexOf(b.kind) - EXPENSE_EVENT_KINDS.indexOf(a.kind),
      )
      .map((event) => historyEntryOf(event, userId, events.find((other) => other.id === event.restoredFrom)?.occurredAt))
    // Going back to an earlier version changes the expense as an edit does.
    const lastEdit = history.find((entry) => entry.kind === 'edited' || entry.kind === 'reverted')

    const referencedPeople = await peopleReferredBy(db, userId, history.map((entry) => entry.changes))

    const { createdById, createdByEmail, createdByName, deletedAt, deleterId, deleterEmail, deleterName, ...details } = expense
    return {
      ...details,
      deleted: deletedAt
        ? { by: { email: deleterEmail, name: deleterName, isYou: deleterId === userId }, at: deletedAt }
        : null,
      createdBy: { email: createdByEmail, name: createdByName, isYou: createdById === userId },
      shares,
      receipts,
      lastEdit: lastEdit ? { by: lastEdit.by, at: lastEdit.at } : null,
      history,
      people: referencedPeople,
    }
  },

  /**
   * One expense as the edit form needs it: its fields, who paid, how it was
   * split (the method and what was entered for each person) and its photos.
   * Null when the user cannot edit it: the cases of `getExpense`, and a
   * payment between members, which has no edit form yet.
   */
  async getExpenseToEdit(
    db: Database,
    userId: string,
    groupId: string,
    expenseId: string,
  ): Promise<ExpenseToEdit | null> {
    if (!UUID.test(groupId) || !UUID.test(expenseId)) return null
    return db.transaction(async (tx) => {
      const found = await loadEditable(tx, userId, groupId, expenseId)
      if (!found) return null
      const { expense, snapshot } = found
      return {
        id: expenseId,
        description: snapshot.description,
        category: snapshot.category,
        amountMinor: snapshot.amountMinor,
        currency: snapshot.currency,
        date: snapshot.date,
        notes: snapshot.notes,
        paidBy: payerOf(snapshot) ?? expense.createdBy,
        split: {
          method: snapshot.method,
          values: Object.fromEntries(snapshot.shares.map((share) => [share.personId, share.inputValue ?? 0])),
        },
        receipts: snapshot.photos.map(({ id, mimeType, sizeBytes }) => ({ id, mimeType, sizeBytes })),
      }
    })
  },

  /**
   * Saves an edit of an expense: any field, who paid, the split and the
   * photos. The input is the same as for a new expense and checked by the same
   * rules; problems come back as one message per field, all at once. When
   * something changed, one revision is stored with the expense as it was
   * before, who edited it, when, and what changed (never overwritten, so every
   * earlier version stays); when nothing did, nothing is written and `changed`
   * is false. A photo taken off the expense keeps its row (soft-deleted) and
   * its picture in the photo store. The shares are only worked out again when
   * the amount, the payer or the split changed, so editing the notes never
   * moves anyone's part. `{ ok: false, notFound: true }` for an expense the
   * user cannot edit (see `getExpenseToEdit`).
   */
  async updateExpense(
    db: Database,
    userId: string,
    groupId: string,
    expenseId: string,
    input: UpdateExpenseInput,
  ): Promise<UpdateExpenseResult> {
    if (!UUID.test(groupId) || !UUID.test(expenseId)) return { ok: false, notFound: true }
    const parsed = createExpenseSchema.safeParse(input)

    return db.transaction(async (tx): Promise<UpdateExpenseResult> => {
      const found = await loadEditable(tx, userId, groupId, expenseId)
      if (!found) return { ok: false, notFound: true }
      const { snapshot: before, memberIds } = found

      const errors = parsed.success ? {} : toFieldErrors(parsed.error)
      const amountMinor = parsed.success ? parsed.data.amountMinor : input.amountMinor
      const result =
        typeof amountMinor === 'number' && Number.isSafeInteger(amountMinor) && amountMinor > 0 && !errors.split
          ? computeShares(amountMinor, input.split, input.paidBy, memberIds)
          : null
      if (result && !result.ok) {
        if (result.message === 'Choose who paid.') errors.paidBy ??= result.message
        else errors.split = result.message
      }
      if (!parsed.success || !result?.ok) return { ok: false, errors }

      const { description, category, currency, date, notes, split, receipts } = parsed.data
      const known = new Map(before.photos.map((photo) => [photo.id, photo]))
      const newShares = result.shares
      const after: ExpenseSnapshot = {
        description,
        category,
        amountMinor: parsed.data.amountMinor,
        currency,
        date,
        notes,
        method: split.method,
        shares: newShares,
        photos: receipts.map((receipt, position) => ({ ...receipt, position })),
      }
      // Until the amount, the payer or the split changes, everyone keeps the
      // part they had, even if the group has new members since.
      const sharesStay = before.amountMinor === after.amountMinor && sameSplitInput(before, after)
      if (sharesStay) after.shares = before.shares

      const changes = expenseChanges(before, after)
      if (changes.length === 0) return { ok: true, changed: false }

      const editedAt = new Date()
      await recordEvent(tx, { groupId, expenseId, kind: 'edited', userId, at: editedAt, snapshot: after, changes })
      await tx
        .update(expenses)
        .set({
          description,
          category,
          amountMinor: after.amountMinor,
          currency,
          date,
          notes,
          method: split.method,
          updatedBy: userId,
          updatedAt: editedAt,
        })
        .where(eq(expenses.id, expenseId))

      if (!sharesStay) {
        const existing = new Set(before.shares.map((share) => share.personId))
        const stored = new Set(newShares.map((share) => share.personId))
        for (const share of newShares) {
          if (existing.has(share.personId)) {
            await tx
              .update(expenseShares)
              .set({
                paidMinor: share.paidMinor,
                owedMinor: share.owedMinor,
                inputValue: share.inputValue,
                updatedBy: userId,
                updatedAt: editedAt,
              })
              .where(and(eq(expenseShares.expenseId, expenseId), eq(expenseShares.personId, share.personId)))
          } else {
            await tx
              .insert(expenseShares)
              .values({ ...share, expenseId, updatedBy: userId, updatedAt: editedAt })
          }
        }
        // Someone with a part before who is no longer a member gets no part now.
        for (const personId of existing) {
          if (stored.has(personId)) continue
          await tx
            .update(expenseShares)
            .set({ paidMinor: 0, owedMinor: 0, inputValue: null, updatedBy: userId, updatedAt: editedAt })
            .where(and(eq(expenseShares.expenseId, expenseId), eq(expenseShares.personId, personId)))
        }
      }

      const kept = new Set(receipts.map((receipt) => receipt.id))
      const removed = before.photos.filter((photo) => !kept.has(photo.id)).map((photo) => photo.id)
      if (removed.length > 0) {
        await tx
          .update(expensePhotos)
          .set({ deletedAt: editedAt, updatedBy: userId, updatedAt: editedAt })
          .where(and(eq(expensePhotos.expenseId, expenseId), inArray(expensePhotos.id, removed)))
      }
      for (const [position, receipt] of receipts.entries()) {
        const old = known.get(receipt.id)
        if (!old) {
          await tx.insert(expensePhotos).values({
            id: receipt.id,
            expenseId,
            position,
            mimeType: receipt.mimeType,
            sizeBytes: receipt.sizeBytes,
            updatedBy: userId,
            updatedAt: editedAt,
          })
        } else if (old.position !== position) {
          await tx
            .update(expensePhotos)
            .set({ position, updatedBy: userId, updatedAt: editedAt })
            .where(eq(expensePhotos.id, receipt.id))
        }
      }
      return { ok: true, changed: true }
    })
  },

  /**
   * Deletes an expense, or a payment between members (which is an expense in
   * the settlement category): it is marked deleted, by this user and now, and
   * leaves every screen, the balances and the list. Nothing is erased: its
   * split, edit history and photos stay, so it could be brought back later,
   * and the group counts as changed (it moves to the top of the home list).
   * `{ ok: false, notFound: true }` for an expense the user cannot see: an
   * unknown or malformed id, one already deleted, another group's, or a group
   * the user is not in.
   */
  async deleteExpense(
    db: Database,
    userId: string,
    groupId: string,
    expenseId: string,
  ): Promise<DeleteExpenseResult> {
    if (!UUID.test(groupId) || !UUID.test(expenseId)) return { ok: false, notFound: true }

    return db.transaction(async (tx): Promise<DeleteExpenseResult> => {
      const [membership] = await tx
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .innerJoin(groups, and(eq(groups.id, groupMembers.groupId), isNull(groups.deletedAt)))
        .where(
          and(
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.personId, userId),
            isNull(groupMembers.deletedAt),
          ),
        )
      if (!membership) return { ok: false, notFound: true }

      const deletedAt = new Date()
      const deleted = await tx
        .update(expenses)
        .set({ deletedAt, updatedAt: deletedAt, updatedBy: userId })
        .where(and(eq(expenses.id, expenseId), eq(expenses.groupId, groupId), isNull(expenses.deletedAt)))
        .returning({ id: expenses.id })
      if (deleted.length === 0) return { ok: false, notFound: true }

      const stored = await loadSnapshot(tx, groupId, expenseId)
      if (stored) {
        await recordEvent(tx, { groupId, expenseId, kind: 'deleted', userId, at: deletedAt, snapshot: stored.snapshot })
      }
      return { ok: true }
    })
  },

  /**
   * Brings a deleted expense (or payment) back, exactly as it was: its
   * `deleted_at` is cleared, it counts in the balances and the edit page again,
   * and the group counts as changed. A `restored` event is recorded. A user
   * who cannot see the expense (unknown or malformed id, another group's, not
   * a member) gets `{ ok: false, notFound: true }`; an expense that is not
   * deleted (for example restored by someone else a moment ago) gets
   * `{ ok: false, notDeleted: true }`.
   */
  async restoreExpense(
    db: Database,
    userId: string,
    groupId: string,
    expenseId: string,
  ): Promise<RestoreExpenseResult> {
    if (!UUID.test(groupId) || !UUID.test(expenseId)) return { ok: false, notFound: true }

    return db.transaction(async (tx): Promise<RestoreExpenseResult> => {
      const [membership] = await tx
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .innerJoin(groups, and(eq(groups.id, groupMembers.groupId), isNull(groups.deletedAt)))
        .where(
          and(
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.personId, userId),
            isNull(groupMembers.deletedAt),
          ),
        )
      if (!membership) return { ok: false, notFound: true }

      const stored = await loadSnapshot(tx, groupId, expenseId)
      if (!stored) return { ok: false, notFound: true }
      if (stored.expense.deletedAt === null) return { ok: false, notDeleted: true }

      const restoredAt = new Date()
      await tx
        .update(expenses)
        .set({ deletedAt: null, updatedAt: restoredAt, updatedBy: userId })
        .where(eq(expenses.id, expenseId))
      await recordEvent(tx, { groupId, expenseId, kind: 'restored', userId, at: restoredAt, snapshot: stored.snapshot })
      return { ok: true }
    })
  },

  /**
   * The expense as it was right after one event of its history (any event: each
   * holds the whole expense), for the page of that version. It works on a
   * deleted expense and on a payment, and says whether the version is the
   * expense as it is now (`isCurrent`), whether the expense is deleted and
   * whether it is a payment, which decide if it can be put back. Null when the
   * user cannot see it: an unknown or malformed id, an event of another
   * expense, another group's expense, or a group the user is not a member of.
   */
  async getExpenseVersion(
    db: Database,
    userId: string,
    groupId: string,
    expenseId: string,
    eventId: string,
  ): Promise<ExpenseVersion | null> {
    if (!UUID.test(groupId) || !UUID.test(expenseId) || !UUID.test(eventId)) return null

    const [membership] = await db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .innerJoin(groups, and(eq(groups.id, groupMembers.groupId), isNull(groups.deletedAt)))
      .where(
        and(eq(groupMembers.groupId, groupId), eq(groupMembers.personId, userId), isNull(groupMembers.deletedAt)),
      )
    if (!membership) return null

    const stored = await loadSnapshot(db, groupId, expenseId)
    if (!stored) return null

    const events = await db
      .select({
        id: expenseEvents.id,
        kind: expenseEvents.kind,
        occurredAt: expenseEvents.occurredAt,
        actorId: expenseEvents.actedBy,
        actorEmail: people.email,
        actorName: people.name,
        changes: expenseEvents.changes,
        snapshot: expenseEvents.snapshot,
        restoredFrom: expenseEvents.restoredFrom,
      })
      .from(expenseEvents)
      .innerJoin(people, eq(people.id, expenseEvents.actedBy))
      .where(eq(expenseEvents.expenseId, expenseId))
    const event = events.find((one) => one.id === eventId)
    if (!event) return null

    const snapshot = event.snapshot
    const named = await db
      .select({ id: people.id, email: people.email, name: people.name })
      .from(people)
      .where(inArray(people.id, snapshot.shares.length > 0 ? snapshot.shares.map((share) => share.personId) : [event.actorId]))
    const label = (share: { name: string | null; email: string | null }) => displayName(share).toLowerCase()
    const shares = snapshot.shares
      .filter((share) => share.paidMinor > 0 || share.owedMinor > 0)
      .map((share) => {
        const person = named.find((one) => one.id === share.personId)
        return {
          personId: share.personId,
          email: person?.email ?? null,
          name: person?.name ?? null,
          isYou: share.personId === userId,
          paidMinor: share.paidMinor,
          owedMinor: share.owedMinor,
        }
      })
      .sort((a, b) => Number(b.isYou) - Number(a.isYou) || label(a).localeCompare(label(b)))

    return {
      groupId,
      expenseId,
      event: historyEntryOf(event, userId, events.find((other) => other.id === event.restoredFrom)?.occurredAt),
      version: {
        description: snapshot.description,
        category: snapshot.category,
        amountMinor: snapshot.amountMinor,
        currency: snapshot.currency,
        date: snapshot.date,
        notes: snapshot.notes,
        method: snapshot.method,
        shares,
        receipts: snapshot.photos.map((photo) => ({ id: photo.id, mimeType: photo.mimeType })),
      },
      people: await peopleReferredBy(db, userId, [event.changes]),
      isCurrent: sameSnapshot(snapshot, stored.snapshot),
      expenseDeleted: stored.expense.deletedAt !== null,
      isPayment: stored.expense.category === SETTLEMENT_CATEGORY,
    }
  },

  /**
   * Puts an expense back to the version it had right after one event of its
   * history: the fields, who paid, what each person paid, owed and entered
   * (written back as they were, not worked out again), and the photos (rows
   * taken off since are brought back, rows added since are taken off; the
   * pictures never left the device). It counts as activity, records a
   * `reverted` event (the restored state, what changed, and which version it
   * went back to), and the version it replaced stays in the history, so it can
   * be put back the same way. Refused for a deleted expense (`expenseDeleted`:
   * restore it first), a version equal to the current one (`alreadyCurrent`)
   * and, as `notFound`, everything the user cannot do: an unknown or malformed
   * id, an event of another expense, another group's expense, a group they are
   * not in, and a payment between members.
   */
  async restoreVersion(
    db: Database,
    userId: string,
    groupId: string,
    expenseId: string,
    eventId: string,
  ): Promise<RestoreVersionResult> {
    if (!UUID.test(groupId) || !UUID.test(expenseId) || !UUID.test(eventId)) return { ok: false, notFound: true }

    return db.transaction(async (tx): Promise<RestoreVersionResult> => {
      const [membership] = await tx
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .innerJoin(groups, and(eq(groups.id, groupMembers.groupId), isNull(groups.deletedAt)))
        .where(
          and(eq(groupMembers.groupId, groupId), eq(groupMembers.personId, userId), isNull(groupMembers.deletedAt)),
        )
      if (!membership) return { ok: false, notFound: true }

      const stored = await loadSnapshot(tx, groupId, expenseId)
      if (!stored || stored.expense.category === SETTLEMENT_CATEGORY) return { ok: false, notFound: true }
      if (stored.expense.deletedAt !== null) return { ok: false, expenseDeleted: true }

      const [event] = await tx
        .select()
        .from(expenseEvents)
        .where(and(eq(expenseEvents.id, eventId), eq(expenseEvents.expenseId, expenseId)))
      if (!event) return { ok: false, notFound: true }

      const target = event.snapshot
      const current = stored.snapshot
      if (sameSnapshot(target, current)) return { ok: false, alreadyCurrent: true }

      const at = new Date()
      await tx
        .update(expenses)
        .set({
          description: target.description,
          category: target.category,
          amountMinor: target.amountMinor,
          currency: target.currency,
          date: target.date,
          notes: target.notes,
          method: target.method,
          updatedBy: userId,
          updatedAt: at,
        })
        .where(eq(expenses.id, expenseId))

      // Shares: every row of the expense, even one taken off earlier, since a person has one row.
      const shareRows = await tx.select().from(expenseShares).where(eq(expenseShares.expenseId, expenseId))
      const wanted = new Set(target.shares.map((share) => share.personId))
      for (const share of target.shares) {
        const row = shareRows.find((one) => one.personId === share.personId)
        const values = { paidMinor: share.paidMinor, owedMinor: share.owedMinor, inputValue: share.inputValue, deletedAt: null, updatedBy: userId, updatedAt: at }
        if (row) await tx.update(expenseShares).set(values).where(eq(expenseShares.id, row.id))
        else await tx.insert(expenseShares).values({ ...values, expenseId, personId: share.personId })
      }
      // A person with a share now and none in that version had no part then.
      for (const row of shareRows) {
        if (wanted.has(row.personId) || row.deletedAt !== null) continue
        await tx
          .update(expenseShares)
          .set({ paidMinor: 0, owedMinor: 0, inputValue: null, updatedBy: userId, updatedAt: at })
          .where(eq(expenseShares.id, row.id))
      }

      // Photos: the version's, in its order; any other live row is taken off.
      const photoRows = await tx.select().from(expensePhotos).where(eq(expensePhotos.expenseId, expenseId))
      const kept = new Set(target.photos.map((photo) => photo.id))
      for (const [position, photo] of target.photos.entries()) {
        const row = photoRows.find((one) => one.id === photo.id)
        if (row) {
          await tx
            .update(expensePhotos)
            .set({ position, deletedAt: null, updatedBy: userId, updatedAt: at })
            .where(eq(expensePhotos.id, photo.id))
        } else {
          await tx.insert(expensePhotos).values({
            id: photo.id,
            expenseId,
            position,
            mimeType: photo.mimeType,
            sizeBytes: photo.sizeBytes,
            updatedBy: userId,
            updatedAt: at,
          })
        }
      }
      for (const row of photoRows) {
        if (kept.has(row.id) || row.deletedAt !== null) continue
        await tx
          .update(expensePhotos)
          .set({ deletedAt: at, updatedBy: userId, updatedAt: at })
          .where(eq(expensePhotos.id, row.id))
      }

      await recordEvent(tx, {
        groupId,
        expenseId,
        kind: 'reverted',
        userId,
        at,
        snapshot: target,
        changes: expenseChanges(current, target),
        restoredFrom: eventId,
      })
      return { ok: true }
    })
  },

  /**
   * What the user and each other person in a group owe each other, one entry
   * per person and currency that is not settled, in the order of the people's
   * names (or emails) and then currency codes. Worked out from the live shares
   * of the group's live expenses each time, never stored, so edits and synced
   * changes can never leave it out of date. Empty for an unknown user.
   */
  async groupBalances(
    db: Database,
    userId: string,
    groupId: string,
  ): Promise<PersonBalance[]> {
    const rows = await db
      .select({
        expenseId: expenses.id,
        currency: expenses.currency,
        personId: expenseShares.personId,
        paidMinor: expenseShares.paidMinor,
        owedMinor: expenseShares.owedMinor,
      })
      .from(expenseShares)
      .innerJoin(expenses, eq(expenses.id, expenseShares.expenseId))
      .where(
        and(
          eq(expenses.groupId, groupId),
          isNull(expenses.deletedAt),
          isNull(expenseShares.deletedAt),
        ),
      )

    const byExpense = new Map<string, { currency: string; shares: typeof rows }>()
    for (const row of rows) {
      const expense = byExpense.get(row.expenseId) ?? { currency: row.currency, shares: [] }
      expense.shares.push(row)
      byExpense.set(row.expenseId, expense)
    }
    const balances = pairBalances(userId, [...byExpense.values()])
    if (balances.length === 0) return []

    const named = await db
      .select({ id: people.id, email: people.email, name: people.name })
      .from(people)
      .where(inArray(people.id, [...new Set(balances.map((balance) => balance.personId))]))
    const label = (person: { name: string | null; email: string | null }) =>
      displayName(person).toLowerCase()

    return balances
      .map((balance) => {
        const person = named.find((one) => one.id === balance.personId)
        return {
          ...balance,
          email: person?.email ?? null,
          name: person?.name ?? null,
        }
      })
      .sort(
        (a, b) =>
          label(a).localeCompare(label(b)) ||
          a.personId.localeCompare(b.personId) ||
          a.currency.localeCompare(b.currency),
      )
  },

  /**
   * The user's overall balance in each of their groups, per currency: what
   * they paid minus their shares, across the group's live expenses. Groups and
   * currencies that come to zero are left out. Keyed by group id.
   */
  async balancesByGroup(
    db: Database,
    userId: string,
  ): Promise<Record<string, CurrencyBalance[]>> {
    const net = sql<number>`sum(${expenseShares.paidMinor} - ${expenseShares.owedMinor})`.mapWith(Number)
    const rows = await db
      .select({ groupId: expenses.groupId, currency: expenses.currency, amountMinor: net })
      .from(expenseShares)
      .innerJoin(expenses, eq(expenses.id, expenseShares.expenseId))
      .where(
        and(
          eq(expenseShares.personId, userId),
          isNull(expenseShares.deletedAt),
          isNull(expenses.deletedAt),
        ),
      )
      .groupBy(expenses.groupId, expenses.currency)
      .orderBy(asc(expenses.currency))

    const balances: Record<string, CurrencyBalance[]> = {}
    for (const row of rows) {
      if (row.amountMinor === 0) continue
      ;(balances[row.groupId] ??= []).push({ currency: row.currency, amountMinor: row.amountMinor })
    }
    return balances
  },

  /**
   * The currencies of the user's own latest expenses, most recent first, each
   * once: what the currency picker offers as "Recent".
   */
  async recentCurrencies(db: Database, userId: string): Promise<string[]> {
    const lastUsed = max(expenses.updatedAt)
    const rows = await db
      .select({ currency: expenses.currency, lastUsed })
      .from(expenses)
      .where(and(eq(expenses.createdBy, userId), isNull(expenses.deletedAt)))
      .groupBy(expenses.currency)
      .orderBy(desc(lastUsed), expenses.currency)
      .limit(RECENT_CURRENCY_COUNT)
    return rows.map((row) => row.currency)
  },
}

/** What the helpers below need of a database or a transaction. */
type Reader = Pick<Database, 'select'>
type Writer = Pick<Database, 'select' | 'insert'>

/**
 * The expense as it is stored now, with its live shares and photos, whether or
 * not the expense is deleted. Null when there is no such expense in that group.
 */
async function loadSnapshot(tx: Reader, groupId: string, expenseId: string) {
  const [expense] = await tx
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.groupId, groupId)))
  if (!expense) return null

  const shares = await tx
    .select()
    .from(expenseShares)
    .where(and(eq(expenseShares.expenseId, expenseId), isNull(expenseShares.deletedAt)))
  const photos = await tx
    .select()
    .from(expensePhotos)
    .where(and(eq(expensePhotos.expenseId, expenseId), isNull(expensePhotos.deletedAt)))
    .orderBy(asc(expensePhotos.position), asc(expensePhotos.id))

  const snapshot: ExpenseSnapshot = {
    description: expense.description,
    category: expense.category,
    amountMinor: expense.amountMinor,
    currency: expense.currency,
    date: expense.date,
    notes: expense.notes,
    method: expense.method,
    shares: shares.map((share) => ({
      personId: share.personId,
      paidMinor: share.paidMinor,
      owedMinor: share.owedMinor,
      inputValue: share.inputValue,
    })),
    photos: photos.map((photo, position) => ({
      id: photo.id,
      position,
      mimeType: photo.mimeType,
      sizeBytes: photo.sizeBytes,
    })),
  }
  return { expense, snapshot }
}

/**
 * Records one event of an expense (ADR-042): who, when, the expense as it is
 * right after it and, for an edit, what changed. Events are only ever inserted.
 */
async function recordEvent(
  tx: Writer,
  event: {
    groupId: string
    expenseId: string
    kind: ExpenseEventKind
    userId: string
    at: Date
    snapshot: ExpenseSnapshot
    changes?: ExpenseChange[]
    /** For a 'reverted' event: the event whose version was put back. */
    restoredFrom?: string
  },
) {
  await tx.insert(expenseEvents).values({
    groupId: event.groupId,
    expenseId: event.expenseId,
    kind: event.kind,
    actedBy: event.userId,
    occurredAt: event.at,
    snapshot: event.snapshot,
    changes: event.changes ?? [],
    restoredFrom: event.restoredFrom ?? null,
    updatedBy: event.userId,
    updatedAt: event.at,
  })
}

/**
 * Reads what an edit needs inside a transaction: the group's live members, and
 * the expense as it is stored, when the user is a live member of the group and
 * the expense is live, in that group and not a payment. Null otherwise.
 */
async function loadEditable(tx: Reader, userId: string, groupId: string, expenseId: string) {
  const members = await tx
    .select({ personId: groupMembers.personId })
    .from(groupMembers)
    .innerJoin(groups, and(eq(groups.id, groupMembers.groupId), isNull(groups.deletedAt)))
    .where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.deletedAt)))
  const memberIds = members.map((member) => member.personId)
  if (!memberIds.includes(userId)) return null

  const stored = await loadSnapshot(tx, groupId, expenseId)
  if (!stored || stored.expense.deletedAt !== null || stored.expense.category === SETTLEMENT_CATEGORY) return null
  return { ...stored, memberIds }
}

/** What the history shows of one event: what happened, who did it, when, and what it changed. */
function historyEntryOf(
  event: {
    id: string
    kind: ExpenseEventKind
    occurredAt: Date
    actorId: string
    actorEmail: string | null
    actorName: string | null
    changes: ExpenseChange[]
    snapshot: ExpenseSnapshot
  },
  userId: string,
  restoredFromAt?: Date,
): ExpenseHistoryEntry {
  return {
    id: event.id,
    kind: event.kind,
    by: { email: event.actorEmail, name: event.actorName, isYou: event.actorId === userId },
    at: event.occurredAt,
    changes: event.changes,
    // What an edit changed the currency from, if it did; otherwise the one it has.
    currencyBefore: String(event.changes.find((change) => change.field === 'currency')?.from ?? event.snapshot.currency),
    ...(restoredFromAt && { restoredFromAt }),
  }
}

/**
 * Everyone the given changes refer to (who paid, who was in a split), by person
 * id, as the viewer sees them, so that no screen has to look anyone up.
 */
async function peopleReferredBy(db: Reader, userId: string, changeLists: ExpenseChange[][]): Promise<Record<string, ExpensePerson>> {
  const referred = new Set<string>()
  for (const changes of changeLists) {
    for (const change of changes) {
      if (change.field === 'paidBy') {
        for (const id of [change.from, change.to]) if (typeof id === 'string') referred.add(id)
      } else if (change.field === 'split') {
        for (const side of [change.from, change.to]) {
          const values = (side as { values?: Record<string, number> } | null)?.values ?? {}
          for (const id of Object.keys(values)) referred.add(id)
        }
      }
    }
  }
  if (referred.size === 0) return {}
  const found = await db
    .select({ id: people.id, email: people.email, name: people.name })
    .from(people)
    .where(inArray(people.id, [...referred]))
  return Object.fromEntries(found.map((person) => [person.id, { email: person.email, name: person.name, isYou: person.id === userId }]))
}
