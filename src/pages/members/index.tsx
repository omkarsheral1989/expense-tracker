import { PlusOutlined } from '@ant-design/icons'
import { Button, Flex, Result, Typography } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { BackButton } from '../../components/BackButton'
import { CenteredMessage } from '../../components/CenteredMessage'
import { LoadingMessage } from '../../components/LoadingMessage'
import { AddMemberDialog } from '../../components/MemberSelect/AddMemberDialog'
import { getDb } from '../../db/client.ts'
import { useCachedData } from '../../hooks/useCachedData'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useSyncStore } from '../../stores/useSyncStore'
import { ROUTES } from '../../routes.ts'
import { personService } from '../../services/personService'
import type { ManagedPerson } from '../../services/personService/types.ts'
import { aboveScreenEdge, belowStatusBar, HEADER_TOP_PADDING } from '../../theme/safeArea.ts'
import { HEADER_TITLE_STYLE } from '../../theme/headerTitle.ts'
import { EditMemberDialog } from './components/EditMemberDialog'
import { MemberItem } from './components/MemberItem'

const { Text, Title } = Typography

/**
 * Everyone saved on this device (never the user): where people are added, given
 * the name this device uses for them and, while pending, an email (PRD 5.9).
 */
export function MembersPage() {
  const user = useCurrentUser()
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<ManagedPerson | null>(null)
  // Counts the openings of the edit dialog; each one gets a fresh form.
  const [openings, setOpenings] = useState(0)

  const userId = user?.personId ?? ''
  // Read again after a sync, which may bring in people and mark them as signed in.
  const dataVersion = useSyncStore((syncState) => syncState.dataVersion)
  const { state, retry } = useCachedData(
    async () => personService.listManaged(await getDb(), userId),
    'members', `${userId}:${dataVersion}`,
    { keepPrevious: true },
  )

  // Visitors who are not in the app are sent away by `RequireAuth` before this matters.
  if (!user) return null

  function openEditDialog(person: ManagedPerson) {
    setOpenings((count) => count + 1)
    setEditing(person)
  }

  function renderHeader() {
    return (
      <Flex align="center" gap={12} style={{ marginBottom: 16 }}>
        <BackButton onClick={() => navigate(ROUTES.home)} />
        <Title level={3} style={HEADER_TITLE_STYLE}>
          Group members
        </Title>
      </Flex>
    )
  }

  function renderLoading() {
    return <LoadingMessage label="Loading your members" />
  }

  function renderList(people: ManagedPerson[]) {
    return (
      <>
        {people.length === 0 && (
          <Text type="secondary" style={{ display: 'block', padding: '16px 0' }}>
            No members yet.
          </Text>
        )}
        <Flex vertical gap={12}>
          {people.map((person) => (
            <MemberItem key={person.id} person={person} onEdit={openEditDialog} />
          ))}
        </Flex>
        <Button icon={<PlusOutlined />} onClick={() => setAdding(true)} style={{ marginTop: 16 }}>
          Add member
        </Button>
      </>
    )
  }

  function renderContent() {
    switch (state.status) {
      case 'loading':
        return renderLoading()
      case 'error':
        return (
          <CenteredMessage>
            <Result
              status="error"
              title="Couldn't load your members"
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
      <title>Group members · OwnLedger</title>
      {/* A column that fills the screen, so the loader is centered in what the header leaves. */}
      <div style={{ width: '100%', maxWidth: 720, display: 'flex', flexDirection: 'column' }}>
        {renderHeader()}
        {renderContent()}
      </div>
      <AddMemberDialog open={adding} onClose={() => setAdding(false)} adderId={userId} onAdded={retry} />
      <EditMemberDialog key={openings} person={editing} onClose={() => setEditing(null)} userId={userId} onSaved={retry} />
    </Flex>
  )
}
