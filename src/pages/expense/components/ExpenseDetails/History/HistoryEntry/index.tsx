import { Flex, Typography } from 'antd'
import { dateService } from '../../../../../../services/dateService'
import type { HistoryLine } from '../utils.ts'

const { Text } = Typography

type Props = {
  /** What happened: "You edited this expense". */
  header: string
  /** When it happened. */
  at: Date
  /** What it changed; none for the entry that says the expense was added. */
  lines?: HistoryLine[]
}

/** One entry of the history: who did what and when, then a bullet for each thing changed. */
export function HistoryEntry({ header, at, lines = [] }: Props) {
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

  return (
    <Flex vertical gap={4} role="listitem">
      <Text style={{ overflowWrap: 'anywhere' }}>
        <Text strong>{header}</Text>
        <Text type="secondary"> · {dateService.formatDateTime(at, navigator.language)}</Text>
      </Text>
      {lines.length > 0 && (
        <ul style={{ margin: 0, paddingInlineStart: 20, overflowWrap: 'anywhere' }}>{lines.map(renderLine)}</ul>
      )}
    </Flex>
  )
}
