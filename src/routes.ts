/** Every address of the app in one place, so a page never spells one out. */
export const ROUTES = {
  welcome: '/',
  home: '/home',
  newGroup: '/groups/new',
  /** The page of one group. */
  group: (id: string) => `/groups/${id}`,
  /** The same address as a pattern for the router, with the id as a parameter. */
  groupPattern: '/groups/:id',
  /** Where an expense is added to a group. */
  newExpense: (groupId: string) => `/groups/${groupId}/expenses/new`,
  /** The same address as a pattern for the router, with the group's id as a parameter. */
  newExpensePattern: '/groups/:id/expenses/new',
} as const
