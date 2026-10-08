# Product Requirements: OwnLedger

_Last updated: 2026-10-08_

## 1. Overview
**OwnLedger** is an installable, offline-capable web app (PWA) for tracking personal expenses and expenses shared in groups (trips, home, couples, others). Everything is stored locally on the user's device. Groups are shared between members through a Google Drive folder. There is no backend.

## 2. Users
- A person tracking their own spending.
- Small groups (friends, family, partners) with Google accounts who share and split expenses.

## 3. Platforms
- Android and iOS (installable PWA), plus desktop browsers.
- Works offline after the first load. Sign-in, backup and sync need a network.

## 4. Features

### 4.1 Authentication
- Google sign-in asks for profile and email only. Google Drive access is requested later, the first time the user backs up or syncs.
- The signed-in user's email, name and photo are used as identity. The app remembers the user on the device, so it opens offline without signing in again.
- Sign out clears the session but keeps the account's local data on the device.
- Signing in or out in one browser tab applies to all open tabs of the app. Only one tab at a time can open the account's data; another tab shows a message with a "Try again" button.
- Each Google account on a device has its own local database.

### 4.2 Groups
- Create a group with a name, a type (trip / home / couple / other, each with its own icon), a default currency and members.
- Members are picked from people already known on this device (people from the user's other groups), or added by Gmail address. Only `@gmail.com` addresses are accepted, which means Google Workspace accounts with other domains cannot be added.
- The creator is always a member of the new group.
- Any member can edit group details and add members.
- Members added by email who have not opened the app yet are shown as pending.

### 4.3 Expenses
- Personal expenses (private, never synced to Drive) and group expenses.
- Fields: description, amount, currency, date, category (fixed default list), tags (later), notes, receipt photos, payer, split.
- Any group member can edit or delete any group expense. Latest edit wins, and the edit history is kept. (Editing and deleting come after adding; see 5.5 for the phases.)
- Group expenses are added from the group page (5.5). Personal expenses arrive later.
- Adding an expense counts as activity in its group, so the group moves to the top of the home page list.

### 4.4 Splitting
- Equal split, with either the user or another member as payer.
- Paid for self / paid for another member only.
- Owed the full amount (user or another member).
- Split by percentage, by exact amount, by shares, or by adjustment (details in 5.5).
- Pending members (not yet signed in) can be payers and be part of splits.
- Rounding: money is whole minor units, so a split that does not divide evenly leaves a few minor units over. The payer absorbs them, even when the payer is not part of the split.

### 4.5 Balances and settle-up
- Per group balances: who owes whom, per currency. Balances are pairwise (each person against each other person), one line per person per currency, for example "Priya owes you ₹14,517.50".
- On the home page a group row shows the user's net balance per currency.
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

**Browser tab titles:** each signed-in page sets the tab's title: "Your groups · OwnLedger" (home), the group's name followed by " · OwnLedger" (group page), "Create a group · OwnLedger" and "Add expense · OwnLedger".

### 5.1 Welcome (logged out)
Single scrolling page, English only, friendly and colorful look (teal/green accent, Ant Design components, icons, gradients and emoji; no image assets). Follows the system light/dark setting. Sections, in order:

1. **Hero:** name "OwnLedger", tagline "Split expenses with friends. Keep your data.", a one-line description that includes "free and open source", and a single **Sign in with Google** button (Ant Design button with the Google "G" logo). A short note beneath it says the app uses the user's Google Drive to back up and share groups and sends nothing to any server, with a link to the Drive FAQ entry.
2. **Install card** (only when not installed). It sits inside the hero, between the highlight lines and the sign-in button, to put the emphasis on installing before signing in. Its heading has an icon: an amber warning icon when installing is required (iPhone/iPad), a teal download icon when it is optional.
   - **iPhone/iPad:** steps "Share, then Add to Home Screen, then open from the home screen", with the reason (installed iOS apps have separate storage) and a small "Continue in browser anyway" link. The sign-in button appears only once the app runs as an installed PWA.
   - **Android/desktop:** an "Install app" button when the browser offers a native install prompt (`beforeinstallprompt`), otherwise a line telling the user which browser menu entry to use. Sign-in stays visible in the hero, so no skip link is needed.
   - **Installed (standalone):** this section is hidden and the sign-in button is shown.
   - On iPhone/iPad while gated, the install card replaces the sign-in button (there is no separate "Install to get started" button). "Continue in browser anyway" reveals sign-in until the page is reloaded (the choice is not remembered); the card then stays with its skip link removed and its normal heading.
   - A dev flag (`VITE_REQUIRE_INSTALL=false`) turns the iOS gate off locally. In development, `?platform=ios|android|desktop` and `?installed=1` simulate each case.
3. **Feature highlights:** cards for groups, flexible splitting, settle-up, any currency, receipts, budgets and reports, offline use.
4. **Privacy and ownership:** offline first, no OwnLedger servers, privacy first (no ads, no tracking), you own your data, shared on your terms through your own Drive, and open source with a link to https://github.com/omkarsheral1989/expense-tracker (GPL-3.0).
5. **How it works:** sign in, create a group, add expenses, sync.
6. **FAQ:** why Drive access is needed (says the permission is broad and that the app only uses its own folders), where data is stored, what happens if browser data is cleared, who can see group expenses, whether personal spending is shared, offline behaviour, deleting data, why Google shows "hasn't verified this app", what "Access blocked" means (while the app is unverified only approved users can sign in; the entry links to https://github.com/omkarsheral1989/expense-tracker/issues to request access), and whether the app is open source.
7. **Footer:** "free and open source (GPL-3.0)" with a link to the GitHub repository.

Copy rules: claims must stay true. "No ads and no tracking" holds only while no analytics or tracking is added to the app.

### 5.1a Signed-in header
Every signed-in page has a header. On the left is the small OwnLedger logo tile and the name "OwnLedger", which link to the home page from anywhere. On the right is the user's avatar; clicking it opens a menu with the user's name and email and a "Sign out" action (which keeps the account's data on the device) and nothing else. The group page has no actions yet (edit, add member, leave and delete come later).

### 5.2 Home (logged in)
- A "Your groups" heading with the primary "Create group" button on its right. Below it, one centered column (about 720 px wide, the same on phone and desktop) listing the groups the user belongs to, **most recently active first**. A group's activity is the latest change to it or to anything in it; until expenses exist that is when it was created or last edited, so the order looks like newest first. Each row shows the group-type icon, the name, and underneath it "N members · CUR" (for example "3 members · GBP"); it opens the group's page (`/groups/<id>`).
- Each row ends with the user's balance in that group: "you are owed X" or "you owe X" (one line per currency), or "Settled up". Until expenses exist every group reads "Settled up".
- **Loading:** while the groups load, grey placeholder rows in the shape of the list are shown. The list is loaded once when the page opens (coming back to it reloads it), and a failed load shows an error message with a "Try again" button.
- **Empty state:** with no groups, a friendly message ("No groups yet. Create one to start sharing expenses.") and a primary "Create group" button in the middle of the page.
- The **Personal** row (this month's spending per currency) is not shown yet; it arrives with personal expenses.

### 5.3 Create group
- Route `/groups/new`, reached from a "Create group" button on the home page (for now the placeholder home page has one). Back and the browser's reload warning work as described under Leaving.
- **Name:** required, 1 to 60 characters.
- **Type:** trip / home / couple / other, each shown as an Ant Design icon in a colored tile. "Trip" is preselected.
- **Default currency:** required. A searchable list (by code or name) of all ISO currencies, each shown as code, name and symbol (for example "INR – Indian Rupee (₹)"), with names in the user's language. The currency of the device's region (for example INR in India) is preselected and listed first; the rest follow A to Z. New expenses in the group start with it; an expense can still use any other currency, since each expense carries its own.
- **Members:** one searchable multi-select. It lists people already known on this device (everyone from the user's other groups, with name and email, never the user themself). Typing a new `@gmail.com` address adds that person in the same field. A duplicate is ignored. The creator is added automatically and cannot be removed.
- **Validation:** checked only when "Create" is pressed. Every problem (empty name, an address that is not `@gmail.com`, no currency) is then shown at once, beside its field.
  - **Same name:** a group cannot have the same name as another group the user belongs to (ignoring case, extra spaces and deleted groups). The message names the existing group ("You already have a group called Goa trip.") and appears beside the name field. This is a convenience check on this device; another member can still create a group with the same name elsewhere, and both groups then simply exist.
  - **Duplicate members:** adding the same person twice (compared ignoring case) is ignored, and so is adding the user's own address, since they are added automatically.
- **Leaving:** the page's Cancel and Back buttons leave immediately while the form is untouched. Once a name, type, currency or member has been entered or changed, they ask "Discard this group?" first, and reloading or closing the tab shows the browser's own warning. The browser's Back button is not intercepted: that needs React Router's data router, which the app does not use yet.
- Creating a group only saves it on this device. Sharing it through Drive happens later, at the first sync.
- After creating, a "Group created." message appears and the app opens the new group's page.
- A message under a field disappears as soon as that field is edited.

### 5.4 Group page
Route `/groups/<id>`, opened from a group on the home page and after creating a group. The layout follows a phone-first design: a colored band at the top, then the balance, then the actions and the list of expenses. Parts that depend on features that do not exist yet are shown switched off with a "Coming soon" tip, so the page already has its final shape.

- **Colored band** across the full width, colored by the group's type (the same colors as the type tiles: teal for trip, orange for home, pink for couple, blue for other), with a soft gradient and a faint pattern drawn with CSS (no image files). It holds:
  - a round white **back** button on the left (to the home page), and round **search** and **settings (gear)** buttons on the right, both switched off for now ("Coming soon");
  - the group's **type icon tile** beside the group's **name**, which is large and white and wraps onto more lines when long (never cut off or running off the screen);
  - a row of translucent pill chips: **Add trip dates** (switched off; it exists for any group type for now), **"N people"** ("1 person" for one), and the group's **default currency** (for example "GBP").
- **"N people" opens the member list**: a bottom sheet on phones and a side panel on desktop, titled "Members (N)". It lists the user first, then the others A to Z; each member has an avatar with their initial, their name with their email under it (just the email, once, when no name is known), and a tag: "You" for the user (whose own row uses the name saved for them, or else their Google profile name) and "Pending" for everyone else until they have signed in and synced. It closes with its close button or by tapping outside.
- **Balance line** under the band: "You're all settled up" while there are no expenses. Later it becomes a sentence such as "Priya owes you ₹14,517.50", with the amount in bold green.
- **Action pills**, a row that scrolls sideways when it does not fit: for now only **Settle up**, switched off.
- **Expense list:** the group's expenses as described in 5.5. With none, the message "No expenses yet" and "Expenses you add will appear here."
- **Add expense:** a floating green pill button at the bottom right of the content. It opens the add-expense page (5.5).
- **Wide screens:** the band stretches edge to edge; the content below it sits in one centered column about 720 px wide, as on the other pages. The app's top header (logo and avatar menu) stays above the band.
- The page loads once when it opens, with grey placeholders while loading and, if loading fails, "Couldn't load this group" with a "Try again" button. The tab title is the group's name followed by " · OwnLedger" ("Group not found · OwnLedger" for a missing group).
- A group that does not exist, was deleted, or that the user does not belong to shows "Group not found" ("It may have been deleted, or you may not be a member of it.") with a "Back to your groups" button. All three cases look the same.

### 5.5 Add expense
Route `/groups/<id>/expenses/new`, opened from the group page's "Add expense" button. Delivered in phases (see below); this section is the target.

**Layout and behavior**
- Phone-first single page. A header with Back and a tick (Save). Back and Cancel ask "Discard this expense?" once anything has been entered or changed; reloading or closing the tab shows the browser's own warning (as in create-group).
- Pickers (category, currency, date, who paid, split) open as dialogs: centered on desktop, a bottom sheet on phones. One shared adaptive component provides both.
- A fixed chip reads "With you and: All of <group name>".
- Form order: category and description; currency and amount; the sentence "Paid by [you] and split [equally]"; the date row; the notes box; the receipts row. The receipts row is stacked, with its icon at the start, no labels and no footer, and does not repeat the group name.
- Saving returns to the group page, shows "Expense added." and the new expense is on top of the list.

**Fields**
- **Description:** required, 1 to 100 characters.
- **Amount:** greater than 0, at most 1 billion, with the currency's decimal places. Only "." is accepted as the decimal mark. Thousands separators appear while typing (lakh style for INR, western style for other currencies) through one shared money formatter. Changing the currency rounds the amount to the new currency's decimals.
- **Category:** about 45 categories in 7 groups (Entertainment, Food and drink, Home, Life, Transportation, Uncategorized, Utilities), each with a stable key, an Ant Design icon and a color of our own (no artwork copied, ADR-030). "General" (in Uncategorized) is the default.
- **Currency:** a picker with a search box (code or name), a "Recent" section first (up to 3: the group's default, then the currencies of the user's own latest expenses on this device), then all ISO currencies A to Z. The chosen one is ticked.
- **Date:** any date; today by default; shown as "Today, 8 Oct 2026", "Yesterday, 7 Oct 2026", or with the weekday for other days ("Mon, 5 Oct 2026"); chosen in a calendar dialog, whose header can move to other months and years without choosing a day.
- **Notes:** a box of 2 to 6 rows, at most 1000 characters, with a counter near the limit.
- **Receipts:** up to 10 photos through the native file chooser. Switched off with a "Coming soon" tip until the receipt phase.

**Splitting**
- Default: you paid, split equally among all members.
- **3 or more members:** the sentence has two buttons, "Paid by [you]" and "split [equally]".
- **2 members:** one button with four quick choices plus "More options". Choosing anything that is not a quick choice, or any non-equal split, switches to the two-button sentence. Any non-equal split reads "unequally".
- People are named by first name; without a name, by the part of the email before the "@".
- "Multiple people" as payer is shown switched off.
- A group with one member can still get expenses; the split buttons are switched off.
- **Split dialog:** a "Paid by" dropdown on top (the "[you]" button opens the same choice), then tabs:
  - **Equally:** tick who shares; the payer may be unticked; at least one person must be ticked.
  - **Exact amounts:** must total the expense amount.
  - **Percentages:** whole numbers, total 100.
  - **Shares:** whole numbers from 0 to 1000, at least one share in total.
  - **Adjustment:** each "+" amount is 0 or more, the adjustments add up to at most the amount, and the remainder is split equally.
- Footers show "X of TOTAL" and "N left" (green at 0) or "N over" (red). No illustrations: a heading, a one-line explanation and an Ant Design icon.
- If the split is not balanced, pressing the dialog's tick shows an error and the dialog stays open.
- If the amount changes after exact amounts were entered, the form shows "The split no longer adds up" and Save is blocked until it is fixed.
- The method and the user's inputs are stored, so the split can be shown and edited later.

**Expense list on the group page (replaces the empty list once expenses exist)**
- Flat list, newest date first (the most recently added first within a day). Each row: date (month over day), a colored category tile, the title with "You paid …" (or "Priya paid …") under it, and on the right "you lent" (green), "you borrowed" (orange-red), "no balance" (the user paid exactly their own share, for example in a group of one) or "not involved", with the amount.
- Tapping a row opens a placeholder details page at `/groups/<id>/expenses/<expenseId>`. Real details, editing, deleting and the edit history table come later.

**Balance line (group page)**
- One line per person per currency, with the amount in bold green; "You're all settled up" when there is nothing owed.

**Phases** (each phase: tests with break-checks, a browser check, and the user reviews the UX first)
1. A simple expense (equal split, you paid) saved and listed. **Done.** The "Paid by [you] and split [equally]" buttons are shown switched off ("Coming soon") for every group size until phase 3; the balance line still reads "You're all settled up" until phase 2; rows cannot be opened until phase 4.
2. Balances: the balance line and the home page rows.
3. Who paid, and the other split methods.
4. The placeholder details page.
5. Receipt photos.

## 6. Open questions
- Google Cloud setup: the OAuth client ID is not created yet (Drive API, consent screen in Testing mode, authorized origins, test users).
- Member removal: what happens to a removed member's access and local data.
- Group page: what the search and settings buttons open, how trip dates work (which group types, start and end), and what else the pill row holds (balances, totals, charts).
- Tags on expenses, and the details/edit/delete pages for expenses.
- Budget details (personal vs group, alerts).
- Charts library.
- Receipt cleanup rules for deleted expenses, and an optional compression setting.
- Group ownership transfer / export if the folder owner leaves.
- App lock or PIN.
- Leaving or deleting a group.
