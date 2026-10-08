import { Button, Typography } from 'antd'
import { ComingSoon } from '../../../../../components/ComingSoon'

const { Paragraph } = Typography

/**
 * Who paid and how the expense is split, as a sentence with a button for each:
 * "Paid by [you] and split [equally]". For now the user always pays and the
 * amount is split equally between every member, so both buttons are switched
 * off ("Coming soon").
 */
export function SplitSentence() {
  return (
    <Paragraph style={{ textAlign: 'center', margin: 0, lineHeight: '32px' }}>
      Paid by{' '}
      <ComingSoon>
        <Button size="small" disabled>
          you
        </Button>
      </ComingSoon>{' '}
      and split{' '}
      <ComingSoon>
        <Button size="small" disabled>
          equally
        </Button>
      </ComingSoon>
    </Paragraph>
  )
}
