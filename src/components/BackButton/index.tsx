import { Icon } from '../Icon'
import { Button } from 'antd'

type Props = {
  /** Where Back leads, or what it asks first: called when the button is pressed. */
  onClick: () => void
}

/**
 * The Back button at the start of a page's header: a 40 px outlined circle with
 * an arrow, the same look as the Edit and Delete buttons at the other end, so
 * the header's controls read as one family.
 */
export function BackButton({ onClick }: Props) {
  return <Button shape="circle" icon={<Icon name="arrowLeft" />} aria-label="Back" onClick={onClick} />
}
