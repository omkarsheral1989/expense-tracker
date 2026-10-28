import { Icon } from '../../../../../components/Icon'
import { App, Button } from 'antd'
import { useState } from 'react'
import { getDb } from '../../../../../db/client.ts'
import { useKnownPeople } from '../../../../../hooks/useKnownPeople'
import { groupService } from '../../../../../services/groupService'
import type { KnownPerson } from '../../../../../services/personService/types.ts'
import { PILL_RADIUS } from '../../../../../theme/radius.ts'
import { PickMemberDialog } from './PickMemberDialog'

type Props = {
  groupId: string
  /** The user's person id: they are adding the member. */
  userId: string
  /** The ids of the people already in the group, who are not offered. */
  memberIds: string[]
  /** Called once someone has been added, so the group can be read again. */
  onAdded: () => void
}

/**
 * The last row of the members list: the "Add member" button, a button with round ends like the one on the members page. It opens a dialog
 * (a bottom sheet on phones) with the people saved on this device who are not
 * in the group, and "Add a new member" for someone who is not saved yet. The
 * dialog's Add button adds the people ticked to the group and closes it.
 */
export function AddMemberRow({ groupId, userId, memberIds, onAdded }: Props) {
  const { message } = App.useApp()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerKey, setPickerKey] = useState(0)
  const [adding, setAdding] = useState(false)
  const { people, loading, add: addKnownPerson } = useKnownPeople(userId)

  // Adds the people one after another and stops at the first one who cannot be
  // added; whoever was added stays added, so the group is read again either way.
  async function addToGroup(chosen: KnownPerson[]) {
    setAdding(true)
    let added = 0
    try {
      for (const person of chosen) {
        const result = await groupService.addMember(await getDb(), userId, groupId, person.id)
        if (!result.ok) {
          message.error(result.notFound ? 'This group is no longer available.' : result.message)
          return
        }
        added += 1
      }
      message.success(
        chosen.length === 1 ? `${groupService.shortName(chosen[0])} added.` : `${chosen.length} members added.`,
      )
      setPickerOpen(false)
    } catch {
      message.error("Couldn't add the member. Please try again.")
    } finally {
      setAdding(false)
      if (added > 0) onAdded()
    }
  }

  function openPicker() {
    // A new key, so the dialog starts with nobody ticked and an empty search.
    setPickerKey((key) => key + 1)
    setPickerOpen(true)
  }

  return (
    <>
      <Button block icon={<Icon name="plus" />} onClick={openPicker} style={{ marginTop: 16, borderRadius: PILL_RADIUS }}>
        Add member
      </Button>
      <PickMemberDialog
        key={pickerKey}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        // Someone already in the group cannot be added again.
        people={people.filter((person) => !memberIds.includes(person.id))}
        loading={loading}
        onAdd={(chosen) => void addToGroup(chosen)}
        adding={adding}
        adderId={userId}
        onPersonSaved={addKnownPerson}
      />
    </>
  )
}
