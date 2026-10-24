import { Button, Flex, Result, Typography } from 'antd'
import { useAppNavigate } from '../../hooks/useAppNavigate'
import { belowStatusBar, HEADER_TOP_PADDING } from '../../theme/safeArea.ts'
import { BackButton } from '../BackButton'

type Props = {
  /** What could not be loaded, such as "Couldn't load this group". */
  title: string
  /** Reads what the page shows again. */
  onRetry: () => void
  /** What went wrong, shown small under the message so a failure that keeps happening can be told apart and reported. */
  error?: Error
  /** Where the Back button at the top leads, so a page that keeps failing is never a dead end. */
  backTo: string
}

/**
 * The message of a page whose data could not be read: Try again, and, at the
 * top left like the other pages, a Back button to the page it came from, since
 * trying again may fail again. The button is fixed to the top of the screen
 * (in the page's 720 px column), so it needs nothing of the page around it.
 */
export function LoadError({ title, onRetry, error, backTo }: Props) {
  const navigate = useAppNavigate()

  return (
    <>
      <Flex
        justify="center"
        style={{ position: 'fixed', top: 0, left: 0, right: 0, padding: `${belowStatusBar(HEADER_TOP_PADDING)} 16px 0`, pointerEvents: 'none' }}
      >
        <div style={{ width: '100%', maxWidth: 720, pointerEvents: 'auto' }}>
          <BackButton onClick={() => navigate(backTo, { direction: 'back' })} />
        </div>
      </Flex>
      <Result
        status="error"
        title={title}
        subTitle={
          <>
            Nothing was lost. Try again.
            {error && (
              <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12, overflowWrap: 'anywhere' }}>
                {error.message}
              </Typography.Text>
            )}
          </>
        }
        extra={
          <Button type="primary" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    </>
  )
}
