import { Card, Col, Flex, Row, theme, Typography } from 'antd'
import { FEATURES } from './content.tsx'
import { Section } from './Section.tsx'

const { Text } = Typography

export function Features() {
  const { token } = theme.useToken()

  return (
    <Section title="Everything you need to share costs">
      <Row gutter={[16, 16]}>
        {FEATURES.map(({ emoji, title, text }) => (
          <Col key={title} xs={24} sm={12} lg={8}>
            <Card style={{ height: '100%' }}>
              <Flex vertical gap={12}>
                <Flex
                  align="center"
                  justify="center"
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
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
        ))}
      </Row>
    </Section>
  )
}
