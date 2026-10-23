import {
  ArrowLeftOutlined,
  CalendarOutlined,
  EditOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { Flex, Typography } from 'antd'
import { useNavigate } from 'react-router'
import { GROUP_TYPE_CONTENT } from '../../../../components/GroupTypeIcon/content.tsx'
import { SyncButton } from '../../../../components/SyncButton'
import { ROUTES } from '../../../../routes.ts'
import { currencyService } from '../../../../services/currencyService'
import type { KnownGroup } from '../../types.ts'
import { HEADER_TITLE_STYLE } from '../../../../theme/headerTitle.ts'
import { GROUP_TYPE_COLORS } from '../../../../theme/groupTypeColors.ts'
import { belowStatusBar, HEADER_TOP_PADDING } from '../../../../theme/safeArea.ts'
import { BandChip } from './BandChip'
import { BandIconButton } from '../../../../components/BandIconButton'
import { bandBackground } from '../../../../theme/bandBackground.ts'
import { CURRENCY_SYMBOL_FONT_SIZE } from './style.ts'

const { Title } = Typography

type Props = {
  /** What the band shows of the group: known from the home list before the rest has loaded (ADR-052). */
  group: Pick<KnownGroup, 'id' | 'name' | 'type' | 'defaultCurrency'>
  /** How many people are in the group. */
  peopleCount: number
  /** Opens the list of members; left out while the members are still loading, which switches the chip off. */
  onOpenMembers?: () => void
}

/**
 * The colored band at the top of a group's page, in the color of the group's
 * type: back, search, sync (this group only) and edit buttons, the group's icon and name, and a row
 * of chips with a fact or an action each.
 */
export function GroupBand({ group, peopleCount, onOpenMembers }: Props) {
  const navigate = useNavigate()
  // What the edit page can show while it loads (ADR-054).
  const editState = { group: { id: group.id, name: group.name, type: group.type, defaultCurrency: group.defaultCurrency, memberCount: peopleCount } }

  function renderButtons() {
    return (
      <Flex justify="space-between">
        <Flex align="center" gap={8}>
          <BandIconButton
            icon={<ArrowLeftOutlined />}
            label="Back"
            onClick={() => navigate(ROUTES.home)}
          />
          <Title level={3} style={{ ...HEADER_TITLE_STYLE, color: '#fff' }}>
            Group
          </Title>
        </Flex>
        <Flex gap={12}>
          <BandIconButton icon={<SearchOutlined />} label="Search" />
          <SyncButton group={{ id: group.id, name: group.name }} onBand />
          <BandIconButton
            icon={<EditOutlined />}
            label="Edit group"
            onClick={() => navigate(ROUTES.editGroup(group.id), { state: editState })}
          />
        </Flex>
      </Flex>
    )
  }

  function renderTitle() {
    return (
      <Flex align="flex-start" gap={16}>
        <span
          role="img"
          aria-label={GROUP_TYPE_CONTENT[group.type].label}
          // The type's icon alone, 40 px and white on the band, beside the name.
          style={{ display: 'flex', flex: 'none', fontSize: 40, lineHeight: '40px', margin: 0, color: '#fff', filter: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.35))' }}
        >
          {GROUP_TYPE_CONTENT[group.type].icon}
        </span>
        <Title
          level={2}
          style={{
            // A one-line name is centered on the 40 px icon: (40 - 38) / 2 above its 38 px line.
            // A longer name wraps downwards from there.
            margin: '1px 0 0',
            lineHeight: '38px',
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
    const currencySymbol = currencyService.symbol(group.defaultCurrency, navigator.language)

    return (
      <Flex wrap gap={8}>
        <BandChip
          tip={currencyService.label(group.defaultCurrency, navigator.language)}
          onClick={() => navigate(ROUTES.editGroup(group.id), { state: editState })}
          // A one-character symbol ("£") is drawn larger than the 3-letter code.
          fontSize={currencySymbol ? CURRENCY_SYMBOL_FONT_SIZE : undefined}
        >
          {currencySymbol ?? group.defaultCurrency}
        </BandChip>
        <BandChip icon={<TeamOutlined />} onClick={onOpenMembers} disabled={!onOpenMembers}>
          {peopleCount} {peopleCount === 1 ? 'person' : 'people'}
        </BandChip>
        <BandChip icon={<CalendarOutlined />} comingSoon>
          Add trip dates
        </BandChip>
      </Flex>
    )
  }

  return (
    <div
      style={{
        padding: `${belowStatusBar(HEADER_TOP_PADDING)} 16px 20px`,
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
