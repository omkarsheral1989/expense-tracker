import { Icon } from '../Icon'
import { Button, Flex, Typography } from 'antd'
import { useAppNavigate } from '../../hooks/useAppNavigate'
import { HEADER_TITLE_STYLE } from '../../theme/headerTitle.ts'
import { aboveScreenEdge, belowStatusBar, HEADER_TOP_PADDING } from '../../theme/safeArea.ts'
import { BackButton } from '../BackButton'
import { GroupLabel } from '../GroupLabel'
import { LoadingMessage } from '../LoadingMessage'
import type { GroupSummary } from '../../services/groupService/types.ts'

const { Title } = Typography

type Props = {
  /** The form's heading ("Add expense"), the same as the form's own header. */
  heading: string
  /** Where Back goes. */
  backTo: string
  /** What the loader says it is loading ("Loading the group"). */
  label: string
  /** The group, when it is already known: shown under the header as the form will show it. */
  group?: Pick<GroupSummary, 'name' | 'type'>
}

/**
 * A form page while its data loads (ADR-054): the page's own header with Back
 * and a Save that is switched off, the group's name and icon when they are
 * known, and a spinner where the fields will be. It has the form's column, so
 * nothing moves when the form takes its place.
 */
export function FormLoadingShell({ heading, backTo, label, group }: Props) {
  const navigate = useAppNavigate()

  return (
    <Flex
      vertical
      style={{ flex: 1, width: '100%', maxWidth: 560, margin: '0 auto', padding: `${belowStatusBar(HEADER_TOP_PADDING)} 16px ${aboveScreenEdge(24)}` }}
    >
      {/* Comes in from the top when the page opens from the group page's pill (PRD 5.16). */}
      <Flex align="center" justify="space-between" gap={8} data-vt="header" style={{ marginBottom: 16 }}>
        <Flex align="center" gap={8}>
          <BackButton onClick={() => navigate(backTo, { direction: 'back' })} />
          <Title level={3} style={HEADER_TITLE_STYLE}>
            {heading}
          </Title>
        </Flex>
        <Button type="primary" shape="circle" icon={<Icon name="check" />} aria-label="Save" disabled />
      </Flex>
      {group && <GroupLabel group={group} />}
      <LoadingMessage label={label} />
    </Flex>
  )
}
