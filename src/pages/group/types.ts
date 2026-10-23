import type { GroupSummary } from '../../services/groupService/types.ts'

/**
 * What the home list already knows about a group, handed to the group page
 * through the router's state when a row is opened, so the page can show it
 * while the rest loads (ADR-052).
 */
export type KnownGroup = Pick<GroupSummary, 'id' | 'name' | 'type' | 'defaultCurrency' | 'memberCount'>

/** The router state the home list gives the group page. */
export type GroupPageState = { group: KnownGroup }
