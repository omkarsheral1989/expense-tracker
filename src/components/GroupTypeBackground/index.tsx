import type { GroupType } from '../../db/types.ts'
import { GROUP_TYPE_WASH_COLORS } from '../../theme/groupTypeColors.ts'
import { TintedPageBackground } from '../TintedPageBackground'

type Props = {
  /** The group type chosen in the form; the page takes a faint wash of its color. */
  type: GroupType | undefined
}

/** A faint wash of the chosen group type's color over the whole page (Create group and Edit group). */
export function GroupTypeBackground({ type }: Props) {
  return <TintedPageBackground color={type ? GROUP_TYPE_WASH_COLORS[type] : undefined} />
}
