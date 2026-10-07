import { Col, Flex, Row, theme, Typography } from 'antd'
import { RADIUS } from '../../theme/radius.ts'
import { PRIVACY } from './content.tsx'
import { Section } from './Section.tsx'

const { Text } = Typography

export function Privacy() {
  const { token } = theme.useToken()

  return (
    <Section
      tinted
      title="Your data, your device"
      subtitle="Built so that you stay in control."
    >
      <Row gutter={[24, 24]}>
        {PRIVACY.map(({ icon, title, text }) => (
          <Col key={title} xs={24} md={12}>
            <Flex gap={16} align="flex-start">
              <Flex
                align="center"
                justify="center"
                style={{
                  flex: 'none',
                  width: 44,
                  height: 44,
                  borderRadius: RADIUS.inner,
                  fontSize: 20,
                  color: '#fff',
                  background: token.colorPrimary,
                }}
              >
                {icon}
              </Flex>
              <Flex vertical gap={2}>
                <Text strong style={{ fontSize: 16 }}>
                  {title}
                </Text>
                <Text type="secondary">{text}</Text>
              </Flex>
            </Flex>
          </Col>
        ))}
      </Row>
    </Section>
  )
}
