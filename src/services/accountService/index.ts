import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { Database } from '../../db/client.ts'
import { notifyAfter } from '../../db/changes.ts'
import { accounts, expensePayments, expenseShares, expenses } from '../../db/schema.ts'
import { currencyService } from '../currencyService'
import { dateService } from '../dateService'
import { logService } from '../logService'
import { moneyService } from '../moneyService'
import { accountSchema, toFieldErrors } from './schemas.ts'
import type {
  AccountErrors,
  AccountInput,
  AccountSpend,
  AccountSummary,
  PaymentMethod,
  PaymentMethodInput,
  Period,
  SaveAccountResult,
  SetPaymentMethodResult,
} from './types.ts'
import { comparableName, inPeriod, monthPeriod, periodOf, rateOf, spendOf } from './utils.ts'

type Reader = Pick<Database, 'select'>

/** The user's live accounts, by name. */
function liveAccounts(db: Reader) {
  return db
    .select()
    .from(accounts)
    .where(isNull(accounts.deletedAt))
    .orderBy(asc(sql`lower(${accounts.name})`))
}

/**
 * What a card spent in its current periods (ADR-061): the user's live expenses
 * paid with it, in the days of the widest period, counted by `spendOf`.
 */
async function spendOfCard(
  db: Reader,
  card: typeof accounts.$inferSelect,
  userId: string,
  today: string,
): Promise<AccountSpend> {
  const cycle = monthPeriod(today, card.statementDay)
  const target =
    card.spendTargetMinor !== null && card.spendTargetPeriod
      ? { ...periodOf(card.spendTargetPeriod, today, card.statementDay), period: card.spendTargetPeriod }
      : null
  const widest: Period = target && target.period === 'quarter' ? target : cycle

  const rows = await db
    .select({
      date: expenses.date,
      currency: expenses.currency,
      paidMinor: expenseShares.paidMinor,
      chargedMinor: expensePayments.chargedMinor,
    })
    .from(expensePayments)
    .innerJoin(expenses, eq(expenses.id, expensePayments.expenseId))
    .innerJoin(
      expenseShares,
      and(eq(expenseShares.expenseId, expenses.id), eq(expenseShares.personId, userId), isNull(expenseShares.deletedAt)),
    )
    .where(
      and(
        eq(expensePayments.accountId, card.id),
        isNull(expensePayments.deletedAt),
        isNull(expenses.deletedAt),
        sql`${expenses.date} between ${widest.start} and ${widest.end}`,
      ),
    )

  const total = (period: Period) =>
    rows
      .filter((row) => inPeriod(row.date, period))
      .reduce((sum, row) => sum + (spendOf(row, card.currency).counted ?? 0), 0)
  const skipped = rows.filter((row) => spendOf(row, card.currency).counted === null).length

  return {
    cycle,
    cycleSpentMinor: total(cycle),
    target,
    targetSpentMinor: target ? total(target) : 0,
    skipped,
  }
}

/** The first account of the user with this name, other than `exceptId` (case and extra spaces do not count). */
async function accountNamed(db: Reader, name: string, exceptId?: string) {
  const rows = await db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(isNull(accounts.deletedAt))
  return rows.find((row) => row.id !== exceptId && comparableName(row.name) === comparableName(name))
}

const accountServiceBase = {
  /**
   * Saves a new account on this device (ADR-061). Problems come back as one
   * message per field; the name must not be one of the user's other accounts.
   * Only unexpected failures throw.
   */
  async createAccount(db: Database, userId: string, input: AccountInput): Promise<SaveAccountResult> {
    const parsed = accountSchema.safeParse(input)
    if (!parsed.success) return { ok: false, errors: toFieldErrors(parsed.error) }

    return db.transaction(async (tx): Promise<SaveAccountResult> => {
      const same = await accountNamed(tx, parsed.data.name)
      if (same) return { ok: false, errors: { name: `You already have an account called ${same.name}.` } }

      const accountId = crypto.randomUUID()
      await tx.insert(accounts).values({ id: accountId, ...parsed.data, updatedBy: userId })
      return { ok: true, accountId }
    })
  },

  /**
   * Changes an account. A card stays a card and a bank account a bank account.
   * The currency cannot change once an expense uses the account. Nothing
   * changed means nothing is written.
   */
  async updateAccount(db: Database, userId: string, accountId: string, input: AccountInput): Promise<SaveAccountResult> {
    const parsed = accountSchema.safeParse(input)
    if (!parsed.success) return { ok: false, errors: toFieldErrors(parsed.error) }

    return db.transaction(async (tx): Promise<SaveAccountResult> => {
      const [account] = await tx
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, accountId), isNull(accounts.deletedAt)))
      if (!account) return { ok: false, notFound: true }

      // The type is not changed here: what was typed for the other type is dropped.
      const next = accountSchema.parse({ ...input, kind: account.kind })
      const errors: AccountErrors = {}

      const same = await accountNamed(tx, next.name, accountId)
      if (same) errors.name = `You already have an account called ${same.name}.`
      if (next.currency !== account.currency) {
        const [used] = await tx
          .select({ id: expensePayments.id })
          .from(expensePayments)
          .where(and(eq(expensePayments.accountId, accountId), isNull(expensePayments.deletedAt)))
          .limit(1)
        if (used) errors.currency = 'Expenses use this account, so its currency cannot change.'
      }
      if (Object.keys(errors).length > 0) return { ok: false, errors }

      const unchanged = (
        ['name', 'currency', 'statementDay', 'creditLimitMinor', 'spendTargetMinor', 'spendTargetPeriod'] as const
      ).every((field) => next[field] === account[field])
      if (unchanged) return { ok: true, accountId }

      const { kind: _kind, ...values } = next
      await tx.update(accounts).set({ ...values, updatedAt: new Date(), updatedBy: userId }).where(eq(accounts.id, accountId))
      return { ok: true, accountId }
    })
  },

  /**
   * Every account of the user, cards first with what they spent in their
   * current periods, then bank accounts, each by name. `today` is a 'YYYY-MM-DD'
   * (the device's day by default).
   */
  async listAccounts(db: Database, userId: string, today: string = dateService.toDay(new Date())): Promise<AccountSummary[]> {
    const rows = await liveAccounts(db)
    const used = new Set(
      (
        await db
          .select({ accountId: expensePayments.accountId })
          .from(expensePayments)
          .where(isNull(expensePayments.deletedAt))
      ).map((row) => row.accountId),
    )
    return Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        kind: row.kind,
        name: row.name,
        currency: row.currency,
        statementDay: row.statementDay,
        creditLimitMinor: row.creditLimitMinor,
        spendTargetMinor: row.spendTargetMinor,
        spendTargetPeriod: row.spendTargetPeriod,
        inUse: used.has(row.id),
        spend: row.kind === 'card' ? await spendOfCard(db, row, userId, today) : null,
      })),
    )
  },

  /** The payment method this device has for an expense, or null. */
  async getPaymentMethod(db: Database, expenseId: string): Promise<PaymentMethod | null> {
    const [row] = await db
      .select({
        accountId: accounts.id,
        accountName: accounts.name,
        accountKind: accounts.kind,
        accountCurrency: accounts.currency,
        chargedMinor: expensePayments.chargedMinor,
      })
      .from(expensePayments)
      .innerJoin(accounts, eq(accounts.id, expensePayments.accountId))
      .where(
        and(eq(expensePayments.expenseId, expenseId), isNull(expensePayments.deletedAt), isNull(accounts.deletedAt)),
      )
    return row ?? null
  },

  /**
   * Sets, changes or clears (`null`) the payment method of an expense the user
   * paid (ADR-061). It is the user's own: no history entry, and the expense and
   * its group are not touched. The charged amount only means something when the
   * account's currency differs from the expense's; for the same currency it is
   * dropped.
   */
  async setPaymentMethod(
    db: Database,
    userId: string,
    expenseId: string,
    input: PaymentMethodInput | null,
  ): Promise<SetPaymentMethodResult> {
    return db.transaction(async (tx): Promise<SetPaymentMethodResult> => {
      const [expense] = await tx
        .select({ currency: expenses.currency, paidMinor: expenseShares.paidMinor })
        .from(expenses)
        .leftJoin(expenseShares, and(eq(expenseShares.expenseId, expenses.id), eq(expenseShares.personId, userId)))
        .where(and(eq(expenses.id, expenseId), isNull(expenses.deletedAt)))
      if (!expense) return { ok: false, notFound: true }

      const [existing] = await tx.select().from(expensePayments).where(eq(expensePayments.expenseId, expenseId))

      if (input === null) {
        if (!existing || existing.deletedAt) return { ok: true, changed: false }
        await tx
          .update(expensePayments)
          .set({ deletedAt: new Date(), updatedAt: new Date(), updatedBy: userId })
          .where(eq(expensePayments.id, existing.id))
        return { ok: true, changed: true }
      }

      if (!expense.paidMinor || expense.paidMinor <= 0) return { ok: false, notFound: true }
      const [account] = await tx
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, input.accountId), isNull(accounts.deletedAt)))
      if (!account) return { ok: false, notFound: true }

      let chargedMinor = input.chargedMinor ?? null
      if (account.currency === expense.currency) chargedMinor = null
      if (chargedMinor !== null && (chargedMinor <= 0 || chargedMinor > moneyService.maxMinor(account.currency))) {
        return { ok: false, errors: { chargedMinor: 'Enter an amount more than 0.' } }
      }

      if (existing && !existing.deletedAt && existing.accountId === account.id && existing.chargedMinor === chargedMinor) {
        return { ok: true, changed: false }
      }
      const values = { accountId: account.id, chargedMinor, deletedAt: null, updatedAt: new Date(), updatedBy: userId }
      if (existing) await tx.update(expensePayments).set(values).where(eq(expensePayments.id, existing.id))
      else await tx.insert(expensePayments).values({ id: crypto.randomUUID(), expenseId, ...values })
      return { ok: true, changed: true }
    })
  },

  /**
   * The exchange rate an expense was paid at, both ways, for display: "US$1 ≈ £0.7850 · £1 ≈ US$1.27" (see `rateOf`).
   * Null when either amount is missing.
   */
  rateLine(expense: { amountMinor: number; currency: string }, charged: { minor: number; currency: string }): string | null {
    const expenseSide = { minor: expense.amountMinor, decimals: moneyService.decimals(expense.currency) }
    const chargedSide = { minor: charged.minor, decimals: moneyService.decimals(charged.currency) }
    const forward = rateOf(expenseSide, chargedSide)
    const backward = rateOf(chargedSide, expenseSide)
    if (!forward || !backward) return null
    // A symbol sits against the number ("£1"); a bare code gets a space ("ANG 1").
    const writing = (code: string, value: string) => {
      const symbol = currencyService.symbol(code, navigator.language)
      return symbol ? `${symbol}${value}` : `${code} ${value}`
    }
    // The two conversions have room between them (em spaces, which a page does not collapse the way it does ordinary ones).
    return `${writing(expense.currency, '1')} ≈ ${writing(charged.currency, forward)} \u2003·\u2003 ${writing(charged.currency, '1')} ≈ ${writing(expense.currency, backward)}`
  },
}

/** accountService with one log line per action (ADR-048). */
export const accountService: typeof accountServiceBase = notifyAfter(
  logService.logActions(logService.scope('account'), accountServiceBase, {
    createAccount: { message: 'Account created', params: ['userId'] },
    updateAccount: { message: 'Account updated', params: ['userId', 'accountId'] },
    setPaymentMethod: { message: 'Payment method set', params: ['userId', 'expenseId'] },
  }),
  ['createAccount', 'updateAccount', 'setPaymentMethod'],
)
