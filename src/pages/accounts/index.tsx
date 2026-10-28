import { Icon } from '../../components/Icon'
import { Button, Empty, Flex, Result, Typography } from 'antd'
import { useState } from 'react'
import { BackButton } from '../../components/BackButton'
import { CenteredMessage } from '../../components/CenteredMessage'
import { LoadingMessage } from '../../components/LoadingMessage'
import { getDb } from '../../db/client.ts'
import { useAppNavigate } from '../../hooks/useAppNavigate'
import { useCachedData } from '../../hooks/useCachedData'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { ROUTES } from '../../routes.ts'
import { accountService } from '../../services/accountService'
import type { AccountSummary } from '../../services/accountService/types.ts'
import { currencyService } from '../../services/currencyService'
import { useSyncStore } from '../../stores/useSyncStore'
import { HEADER_TITLE_STYLE } from '../../theme/headerTitle.ts'
import { PILL_RADIUS } from '../../theme/radius.ts'
import { aboveScreenEdge, belowStatusBar, HEADER_TOP_PADDING } from '../../theme/safeArea.ts'
import { AccountDialog } from '../../components/AccountDialog'
import { AccountItem } from './components/AccountItem'
import { AccountsIllustration } from './components/AccountsIllustration'

const { Text, Title } = Typography

/**
 * The user's own bank accounts and credit cards, where they are added and
 * edited (PRD 5.17). Private to the user: never shared with a group.
 */
export function AccountsPage() {
  const user = useCurrentUser()
  const navigate = useAppNavigate()
  // The dialog is open for a new account (`adding`) or for the one being edited.
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<AccountSummary | null>(null)
  // Counts the openings of the dialog; each one gets a fresh form.
  const [openings, setOpenings] = useState(0)
  const [regionCurrency] = useState(() => currencyService.forLocales(navigator.languages))

  const userId = user?.personId ?? ''
  // Read again after a sync, which may bring in accounts from the backup.
  const dataVersion = useSyncStore((syncState) => syncState.dataVersion)
  const { state, retry } = useCachedData(
    async () => accountService.listAccounts(await getDb(), userId),
    'accounts',
    `${userId}:${dataVersion}`,
    { keepPrevious: true },
  )

  // Visitors who are not in the app are sent away by `RequireAuth` before this matters.
  if (!user) return null

  function openDialog(account: AccountSummary | null) {
    setOpenings((count) => count + 1)
    setEditing(account)
    setAdding(account === null)
  }

  function closeDialog() {
    setAdding(false)
    setEditing(null)
  }

  function renderHeader() {
    return (
      <Flex align="center" gap={12} style={{ marginBottom: 16 }}>
        <BackButton onClick={() => navigate(ROUTES.home, { direction: 'back' })} />
        <Title level={3} style={HEADER_TITLE_STYLE}>
          Accounts
        </Title>
      </Flex>
    )
  }

  // With no accounts: the same illustration as an empty list of expenses, centered in the space the page has, with the button under it.
  function renderEmpty() {
    return (
      <Flex align="center" justify="center" style={{ flex: 1 }}>
        <Empty
          image={<AccountsIllustration />}
          // The picture sets its own size.
          styles={{ image: { height: 'auto' } }}
          description={
            <>
              <Text strong>No accounts yet</Text>
              <br />
              <Text type="secondary">Add a bank account or a credit card.</Text>
            </>
          }
        >
          {renderAddButton(0)}
        </Empty>
      </Flex>
    )
  }

  function renderAddButton(marginTop: number) {
    return (
      <Button icon={<Icon name="plus" />} onClick={() => openDialog(null)} style={{ marginTop, borderRadius: PILL_RADIUS }}>
        Add account
      </Button>
    )
  }

  function renderList(accounts: AccountSummary[]) {
    if (accounts.length === 0) return renderEmpty()
    return (
      <>
        <Flex vertical gap={12}>
          {accounts.map((account) => (
            <AccountItem key={account.id} account={account} onEdit={openDialog} />
          ))}
        </Flex>
        {renderAddButton(16)}
      </>
    )
  }

  function renderContent() {
    switch (state.status) {
      case 'loading':
        return <LoadingMessage label="Loading your accounts" />
      case 'error':
        return (
          <CenteredMessage>
            <Result
              status="error"
              title="Couldn't load your accounts"
              subTitle="Nothing was lost. Try again."
              extra={
                <Button type="primary" onClick={retry}>
                  Try again
                </Button>
              }
            />
          </CenteredMessage>
        )
      case 'ready':
        return renderList(state.data)
    }
  }

  return (
    <Flex justify="center" style={{ flex: 1, padding: `${belowStatusBar(HEADER_TOP_PADDING)} 16px ${aboveScreenEdge(32)}` }}>
      <title>Accounts · OwnLedger</title>
      {/* A column that fills the screen, so the loader is centered in what the header leaves. */}
      <div style={{ width: '100%', maxWidth: 720, display: 'flex', flexDirection: 'column' }}>
        {renderHeader()}
        {renderContent()}
      </div>
      <AccountDialog
        key={openings}
        open={adding || editing !== null}
        account={editing}
        onClose={closeDialog}
        userId={userId}
        regionCurrency={regionCurrency}
        onSaved={retry}
      />
    </Flex>
  )
}
