# Product Requirements: Expense Tracker

_Last updated: 2026-10-07_

## 1. Overview
An installable, offline-capable web app (PWA) for tracking personal expenses and expenses shared in groups (trips, home, couples, others). Everything is stored locally on the user's device. Groups are shared between members through a Google Drive folder. There is no backend.

## 2. Users
- A person tracking their own spending.
- Small groups (friends, family, partners) with Google accounts who share and split expenses.

## 3. Platforms
- Android and iOS (installable PWA), plus desktop browsers.
- Works offline after the first load. Sign-in, backup and sync need a network.

## 4. Features

### 4.1 Authentication
- Google sign-in. The signed-in user's email, name and photo are used as identity.
- Each Google account on a device has its own local database.

### 4.2 Groups
- Create a group with a name, a type (trip / home / couple / other, each with its own icon) and members.
- Members are picked from people already in the user's other groups, or added by Gmail address.
- Any member can edit group details and add members.
- Members added by email who have not opened the app yet are shown as pending.

### 4.3 Expenses
- Personal expenses (private, never synced to Drive) and group expenses.
- Fields: amount, currency, date, category (fixed default list), tags, notes, receipt photos, payer, split.
- Any group member can edit or delete any group expense. Latest edit wins, and the edit history is kept.

### 4.4 Splitting
- Equal split, with either the user or another member as payer.
- Paid for self / paid for another member only.
- Owed the full amount (user or another member).
- Split by percentage, by exact amount, or by shares.

### 4.5 Balances and settle-up
- Per group balances: who owes whom, per currency.
- Record settlement payments between members.
- Multi-currency without conversion: each currency is tracked separately.

### 4.6 Receipt photos
- Photos are stored locally on the device (IndexedDB) at original size, with a thumbnail for lists.
- On Backup or Sync, photos upload to Google Drive. On Sync, missing photos from other members are downloaded.
- Sync downloads all photos before finishing, and is resumable.

### 4.7 Backup and sync
- **Personal backup:** a button creates a `pgDump` of the personal database and uploads it to the user's Google Drive. Restore is available.
- **Group sync:** a button pushes the user's own changes and pulls other members' changes from the group's shared Drive folder, then merges them locally.
- Sync shows progress (data, then photos) and handles failures and token expiry.

### 4.8 Reports and tools
- Monthly totals by category (personal and per group).
- Search and filters (date range, category, tag, member, currency, amount).
- Budgets (monthly limits per category).
- CSV export.

### 4.9 PWA
- Installable on Android and iOS, works offline, shows a prompt when a new version is available.

## 5. Pages

### 5.1 Welcome (logged out)
- App name, short description, Google sign-in button.
- **Not installed on iPhone/iPad:** install instructions ("Share, then Add to Home Screen") with a small "Continue in browser anyway" link. The login button appears once the app runs as an installed PWA.
- **Not installed on Android/desktop:** an "Install app" button plus instructions, and a "Continue in browser" option.
- **Installed:** the login button.

### 5.2 Home (logged in)
- A list of groups: icon, name, and either "you are owed X", "you owe X" (one line per currency) or "Settled up".
- A **Personal** row showing this month's spending per currency.
- A "Create group" button.

### 5.3 Create group
- Group name, group type, members (existing or new by Gmail address).

### 5.4 Group page
- Opens from a group on the home page. Contains the group's expenses and other sections (to be defined).

## 6. Open questions
- Member removal: what happens to a removed member's access and local data.
- Group page layout and sections.
- Add-expense form details.
- Budget details (personal vs group, alerts).
- Charts library.
- Receipt cleanup rules for deleted expenses, and an optional compression setting.
- Group ownership transfer / export if the folder owner leaves.
- App lock or PIN.
- Leaving or deleting a group.
