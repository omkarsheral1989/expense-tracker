import { useEffect, type ReactNode } from 'react'
import { App as AntApp, ConfigProvider, theme } from 'antd'
import { useColorScheme } from '../../hooks/useColorScheme'
import '../../theme/dropdown.css'
import { themeFor } from './utils.ts'

/** Keeps the page background and browser UI in step with the Ant Design theme. */
function PageBackground({ children }: { children: ReactNode }) {
  const { token } = theme.useToken()
  const scheme = useColorScheme()

  useEffect(() => {
    document.body.style.background = token.colorBgLayout
    document.documentElement.style.colorScheme = scheme
  }, [token.colorBgLayout, scheme])

  return children
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme()

  return (
    <ConfigProvider theme={themeFor(scheme)}>
      <AntApp>
        <PageBackground>{children}</PageBackground>
      </AntApp>
    </ConfigProvider>
  )
}
