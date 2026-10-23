import { Button, Flex, Input, Typography } from 'antd'
import { belowStatusBar } from '../../theme/safeArea.ts'

/**
 * Development only (never in the build): posts a picture and some text to the
 * share address, as another app's share sheet would, to try receiving a share
 * on a desktop. The service worker must be on: `SW_DEV=true bun run dev`.
 */
export function ShareTestPage() {
  return (
    <Flex vertical gap={16} style={{ maxWidth: 560, margin: '0 auto', padding: belowStatusBar(24) }}>
      <Typography.Title level={3}>Try a share</Typography.Title>
      <form
        method="POST"
        action={`${import.meta.env.BASE_URL}share-target`}
        encType="multipart/form-data"
      >
        <Flex vertical gap={12}>
          <input type="file" name="receipts" accept="image/*" multiple />
          <Input name="title" placeholder="Title" />
          <Input.TextArea name="text" placeholder="Text" rows={3} />
          <Input name="url" placeholder="Link" />
          <Button type="primary" htmlType="submit">
            Share to OwnLedger
          </Button>
        </Flex>
      </form>
    </Flex>
  )
}
