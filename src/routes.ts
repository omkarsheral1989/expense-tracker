/** Every address of the app in one place, so a page never spells one out. */
export const ROUTES = {
  welcome: '/',
  /** Where the welcome page's Open OwnLedger button leads: sign in with Google, or continue as a guest. */
  getStarted: '/get-started',
  home: '/home',
  newGroup: '/groups/new',
  /** The page of one group. */
  group: (id: string) => `/groups/${id}`,
  /** The same address as a pattern for the router, with the id as a parameter. */
  groupPattern: '/groups/:id',
  /** Where a group's name, type and default currency are edited. */
  editGroup: (id: string) => `/groups/${id}/edit`,
  /** The same address as a pattern for the router, with the group's id as a parameter. */
  editGroupPattern: '/groups/:id/edit',
  /** Where a payment between two members of a group is recorded. */
  settleUp: (groupId: string) => `/groups/${groupId}/settle`,
  /** The same address as a pattern for the router, with the group's id as a parameter. */
  settleUpPattern: '/groups/:id/settle',
  /** Where an expense is added to a group. */
  newExpense: (groupId: string) => `/groups/${groupId}/expenses/new`,
  /** The same address as a pattern for the router, with the group's id as a parameter. */
  newExpensePattern: '/groups/:id/expenses/new',
  /** The details of one expense of a group. */
  expense: (groupId: string, expenseId: string) => `/groups/${groupId}/expenses/${expenseId}`,
  /** The same address as a pattern for the router. "new" above is matched first. */
  expensePattern: '/groups/:id/expenses/:expenseId',
  /** The expense as it was right after one event of its history, with the way to put it back. */
  expenseVersion: (groupId: string, expenseId: string, eventId: string) =>
    `/groups/${groupId}/expenses/${expenseId}/versions/${eventId}`,
  /** The same address as a pattern for the router. */
  expenseVersionPattern: '/groups/:id/expenses/:expenseId/versions/:eventId',
  /** Where one expense of a group is edited. */
  editExpense: (groupId: string, expenseId: string) => `/groups/${groupId}/expenses/${expenseId}/edit`,
  /** The same address as a pattern for the router. */
  editExpensePattern: '/groups/:id/expenses/:expenseId/edit',
} as const
