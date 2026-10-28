import { Segmented } from 'antd'
import { GroupTypeIcon } from '../GroupTypeIcon'
import { CONTROL_HEIGHT } from '../../theme/controlHeight.ts'
import { GROUP_TYPES } from '../../db/constants.ts'
import type { GroupType } from '../../db/types.ts'

type Props = {
  value?: GroupType
  onChange?: (type: GroupType) => void
}

/** Pick the kind of group from four tiles. Works as an Ant Design form field. */
export function GroupTypeSelector({ value, onChange }: Props) {
  return (
    <Segmented<GroupType>
      block
      className="group-type-selector"
      style={{ background: 'transparent' }}
      value={value}
      onChange={onChange}
      options={GROUP_TYPES.map((type) => ({
        value: type,
        label: (
          <div style={{ padding: '8px 0' }}>
            {/* The chosen tile grows into the new group's band when Create group opens it (PRD 5.16). */}
            <GroupTypeIcon type={type} size={CONTROL_HEIGHT} iconSize={24} withLabel travels />
          </div>
        ),
      }))}
    />
  )
}
