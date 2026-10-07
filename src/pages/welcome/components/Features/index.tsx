import { Card, Col, Flex, Row, theme, Typography } from 'antd'
import { RADIUS } from '../../../../theme/radius.ts'
import { FEATURES, type Feature } from './content.ts'
import { Section } from '../Section'

const { Text } = Typography

export function Features() {
  const { token } = theme.useToken()

  function renderFeature({ emoji, title, text }: Feature) {
    return (
      <Col key={title} xs={24} sm={12} lg={8}>
        <Card style={{ height: '100%' }}>
          <Flex vertical gap={12}>
            <Flex
              align="center"
              justify="center"
              style={{
                width: 48,
                height: 48,
                borderRadius: RADIUS.inner,
                fontSize: 24,
                background: token.colorPrimaryBg,
              }}
            >
              <span role="img" aria-hidden="true">
                {emoji}
              </span>
            </Flex>
            <Text strong style={{ fontSize: 16 }}>
              {title}
            </Text>
            <Text type="secondary">{text}</Text>
          </Flex>
        </Card>
      </Col>
    )
  }

  return (
    <Section title="Everything you need to share costs">
      <Row gutter={[16, 16]}>{FEATURES.map(renderFeature)}</Row>
    </Section>
  )
}
