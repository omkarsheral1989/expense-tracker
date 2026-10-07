import { Typography } from 'antd'
import type { ReactNode } from 'react'
import { ISSUES_URL, REPO_URL } from '../../constants.ts'

const { Link } = Typography

export const FAQ: { key: string; question: string; answer: ReactNode }[] = [
  {
    key: 'drive',
    question: 'Why does OwnLedger need access to Google Drive?',
    answer:
      "It saves your backups and shared group data in your Drive and shares the group folder with the people you add. Google's permission for this is broad: it technically allows access to your Drive files. OwnLedger only creates and uses its own folders and doesn't read your other files. Your files are never sent to anyone except through Google.",
  },
  {
    key: 'unverified',
    question: 'Why does Google say "Google hasn\'t verified this app"?',
    answer:
      "OwnLedger is a personal open-source project and hasn't gone through Google's formal app verification, which is a lengthy process meant for large public apps. During sign-in you may see a warning screen. To continue, choose Advanced, then continue to OwnLedger. The warning refers to the app being unverified, not to any problem with your account. You can check what the app does in the source code.",
  },
  {
    key: 'blocked',
    question: 'Google says "Access blocked" when I try to sign in.',
    answer: (
      <>
        While the app is unverified, only people on its approved list can sign
        in.{' '}
        <Link href={ISSUES_URL} target="_blank" rel="noreferrer">
          Open an issue on GitHub
        </Link>{' '}
        to request access.
      </>
    ),
  },
  {
    key: 'storage',
    question: 'Where is my data stored?',
    answer:
      'On your device, in the app\'s local storage. Backups and shared groups are stored in your Google Drive. Nothing is stored on OwnLedger servers, because there are none.',
  },
  {
    key: 'lost',
    question: 'What happens if I clear my browser data or lose my phone?',
    answer:
      "Local data is lost unless you've backed it up or synced it. Back up regularly. Group data can be restored by syncing again.",
  },
  {
    key: 'visibility',
    question: 'Who can see my group\'s expenses?',
    answer:
      'Only the people you add. Members you add can also add other members and edit group expenses.',
  },
  {
    key: 'personal',
    question: 'Is my personal spending shared?',
    answer:
      'No. Personal expenses stay on your device and only go to your own Drive if you choose to back them up.',
  },
  {
    key: 'offline',
    question: 'Does it work offline?',
    answer:
      'Yes. Sign-in, backup and sync need a connection. Everything else works offline.',
  },
  {
    key: 'delete',
    question: 'Can I delete my data?',
    answer:
      "Yes. Clear the app's data on your device and delete the OwnLedger folders in your Drive.",
  },
  {
    key: 'opensource',
    question: 'Is OwnLedger open source?',
    answer: (
      <>
        Yes. The full code is on{' '}
        <Link href={REPO_URL} target="_blank" rel="noreferrer">
          GitHub
        </Link>{' '}
        under the GPL-3.0 license.
      </>
    ),
  },
]
