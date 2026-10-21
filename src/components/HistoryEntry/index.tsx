import { RightOutlined } from '@ant-design/icons'
import { Flex, Typography } from 'antd'
import { Link } from 'react-router'
import { dateService } from '../../services/dateService'
import type { HistoryLine } from '../ExpenseWording'

const { Text } = Typography

type Props = {
  /** What happened: "You edited this expense". */
  header: string
  /** When it happened. */
  at: Date
  /** What it changed; none for the entry that says the expense was added. */
  lines?: HistoryLine[]
  /** Where the entry leads (the version it holds); leave out for a plain entry. */
  to?: string
}

/**
 * One entry of the history: who did what and when, then a bullet for each thing
 * changed. With `to` the whole entry is a link, marked with an arrow.
 */
export function HistoryEntry({ header, at, lines = [], to }: Props) {
  function renderLine(line: HistoryLine, index: number) {
    return (
      <li key={index}>
        {line.text}
        {line.nested && (
          <ul style={{ margin: '2px 0 0', paddingInlineStart: 20, listStyleType: 'circle' }}>
            {line.nested.map((text, nestedIndex) => (
              <li key={nestedIndex}>{text}</li>
            ))}
          </ul>
        )}
      </li>
    )
  }

  const content = (
    <Flex vertical gap={4} style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ overflowWrap: 'anywhere' }}>
        <Text strong>{header}</Text>
        <Text type="secondary"> · {dateService.formatDateTime(at, navigator.language)}</Text>
      </Text>
      {lines.length > 0 && (
        <ul style={{ margin: 0, paddingInlineStart: 20, overflowWrap: 'anywhere' }}>{lines.map(renderLine)}</ul>
      )}
    </Flex>
  )

  return (
    <div role="listitem">
      {to ? (
        <Link to={to} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'inherit' }}>
          {content}
          <RightOutlined aria-hidden style={{ flex: 'none', fontSize: 12, opacity: 0.45 }} />
        </Link>
      ) : (
        content
      )}
    </div>
  )
}
