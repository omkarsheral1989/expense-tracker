import { CheckOutlined } from '@ant-design/icons'
import { Button, Divider, Flex } from 'antd'
import { AdaptiveDialog } from '../../../../../../components/AdaptiveDialog'
import type { SplitValue } from '../../types.ts'
import type { QuickChoice } from '../types.ts'
import { sameSplit } from '../utils.ts'

type Props = {
  open: boolean
  onClose: () => void
  choices: QuickChoice[]
  /** The split as it is now; the matching choice is marked. */
  value: SplitValue
  onPick: (split: SplitValue) => void
  /** Opens the full split dialog. */
  onMore: () => void
}

/** The quick choices of a two-member group, with "More options" for everything else. */
export function QuickChoiceDialog({ open, onClose, choices, value, onPick, onMore }: Props) {
  function renderChoice(choice: QuickChoice) {
    const selected = sameSplit(choice.value, value)
    return (
      <Button
        key={choice.label}
        type="text"
        block
        aria-pressed={selected}
        onClick={() => onPick(choice.value)}
        style={{ justifyContent: 'space-between', height: 'auto', padding: '10px 12px' }}
      >
        <span style={{ whiteSpace: 'normal', textAlign: 'start' }}>{choice.label}</span>
        {selected && <CheckOutlined aria-hidden />}
      </Button>
    )
  }

  return (
    <AdaptiveDialog open={open} onClose={onClose} title="How was it paid and split?">
      <Flex vertical gap={2}>
        {choices.map(renderChoice)}
        <Divider style={{ margin: '8px 0' }} />
        <Button block onClick={onMore}>
          More options
        </Button>
      </Flex>
    </AdaptiveDialog>
  )
}
