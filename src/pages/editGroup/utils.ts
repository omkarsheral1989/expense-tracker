import { getDb } from '../../db/client.ts'
import { groupService } from '../../services/groupService'

/** The name of the edit page's remembered data (`useCachedData`'s `page`). */
export const EDIT_GROUP_PAGE = 'editGroup'

/** The key of one group's edit data for one user. */
export const editGroupKey = (userId: string, groupId: string) => `${userId}:${groupId}`

/** The group the form opens with; null when the user cannot see it (gone, deleted, or not a member). */
export async function loadGroupToEdit(userId: string, groupId: string) {
  return groupService.getGroup(await getDb(), userId, groupId)
}
