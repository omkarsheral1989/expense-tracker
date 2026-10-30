import { getDb } from '../../db/client.ts'
import { groupService } from '../../services/groupService'

/** The name of the page's remembered data (`useCachedData`'s `page`). */
export const DELETED_GROUPS_PAGE = 'deletedGroups'

/** The key of one user's deleted groups; a finished sync (`dataVersion`) makes a new one. */
export const deletedGroupsKey = (userId: string, dataVersion: number) => `${userId}:${dataVersion}`

/** The groups the user deleted on this device, most recently deleted first. */
export async function loadDeletedGroups(userId: string) {
  return groupService.listGroups(await getDb(), userId, 'deleted')
}
