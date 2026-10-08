import {
  ArrowLeftOutlined,
  CalendarOutlined,
  SearchOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { Flex, Typography } from 'antd'
import { useNavigate } from 'react-router'
import { GroupTypeIcon } from '../../../../components/GroupTypeIcon'
import { ROUTES } from '../../../../routes.ts'
import type { GroupDetails } from '../../../../services/groupService/types.ts'
import { GROUP_TYPE_COLORS } from '../../../../theme/groupTypeColors.ts'
import { BandChip } from './BandChip'
import { BandIconButton } from './BandIconButton'
import { bandBackground } from './style.ts'

const { Title } = Typography

type Props = {
  group: GroupDetails
  /** Opens the list of members. */
  onOpenMembers: () => void
}

/**
 * The colored band at the top of a group's page, in the color of the group's
 * type: back, search and settings buttons, the group's icon and name, and a row
 * of chips with a fact or an action each.
 */
export function GroupBand({ group, onOpenMembers }: Props) {
  const navigate = useNavigate()
  const peopleCount = group.members.length

  function renderButtons() {
    return (
      <Flex justify="space-between">
        <BandIconButton
          icon={<ArrowLeftOutlined />}
          label="Back"
          onClick={() => navigate(ROUTES.home)}
        />
        <Flex gap={12}>
          <BandIconButton icon={<SearchOutlined />} label="Search" />
          <BandIconButton icon={<SettingOutlined />} label="Group settings" />
        </Flex>
      </Flex>
    )
  }

  function renderTitle() {
    return (
      <Flex align="flex-start" gap={16}>
        <GroupTypeIcon type={group.type} size={48} />
        <Title
          level={2}
          style={{
            margin: 0,
            minWidth: 0,
            color: '#fff',
            overflowWrap: 'anywhere',
            textShadow: '0 2px 6px rgba(0, 0, 0, 0.35)',
          }}
        >
          {group.name}
        </Title>
      </Flex>
    )
  }

  function renderChips() {
    return (
      <Flex wrap gap={8}>
        <BandChip icon={<CalendarOutlined />} comingSoon>
          Add trip dates
        </BandChip>
        <BandChip icon={<TeamOutlined />} onClick={onOpenMembers}>
          {peopleCount} {peopleCount === 1 ? 'person' : 'people'}
        </BandChip>
        <BandChip>{group.defaultCurrency}</BandChip>
      </Flex>
    )
  }

  return (
    <div
      style={{
        padding: '16px 16px 20px',
        background: bandBackground(GROUP_TYPE_COLORS[group.type]),
      }}
    >
      <Flex vertical gap={20} style={{ maxWidth: 720, margin: '0 auto' }}>
        {renderButtons()}
        {renderTitle()}
        {renderChips()}
      </Flex>
    </div>
  )
}
