import { CameraOutlined } from '@ant-design/icons'
import { Button, Flex } from 'antd'
import { ComingSoon } from '../../../../../components/ComingSoon'

/**
 * Where receipt photos will be added (up to 10, from the device's own file
 * chooser). Switched off until receipts are built.
 */
export function ReceiptsRow() {
  return (
    <Flex>
      <ComingSoon>
        <Button size="large" icon={<CameraOutlined />} aria-label="Add receipt photos" disabled />
      </ComingSoon>
    </Flex>
  )
}
