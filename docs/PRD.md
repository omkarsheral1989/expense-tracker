# Product Requirements: OwnLedger

_Last updated: 2026-10-15_

## 1. Overview
**OwnLedger** is an installable, offline-capable web app (PWA) for tracking personal expenses and expenses shared in groups (trips, home, couples, others). Everything is stored locally on the user's device. Groups are shared between members through a Google Drive folder. There is no backend.

## 2. Users
- A person tracking their own spending.
- Small groups (friends, family, partners) with Google accounts who share and split expenses.

## 3. Platforms
- Android and iOS (installable PWA), plus desktop browsers.
- Hosted on GitHub Pages at https://omkarsheral1989.github.io/ownledger/ (ADR-032). Addresses inside the app, such as a group's page, also work when opened or reloaded directly.
- Works offline after the first load. Sign-in, backup and sync need a network.

## 4. Features

### 4.1 Authentication
- **No account needed.** The welcome page's one button is "Open OwnLedger" (5.1). It opens a page (5.1b) with **Sign in with Google**, "OR" and **Continue as a guest**, and a note that Google sign-in is required to back up data and share it with others.
- **Guest:** a guest uses the whole app on this device, with no account. Their own person is saved as "Guest" (no email) and screens say "You". Nothing is backed up or shared, and a guest cannot invite members to share a group, until they sign in with Google.
- **One set of data per device.** There is no separate guest data and signed-in data. Signing in with Google makes that account the owner of the data already on the device, so what a guest made is theirs, and nothing is copied or asked about. The user's person gets the account's email and name (and photo). If that email already belongs to a member someone added earlier, the guest person is merged into that member (their expenses and shares become theirs) so there is one person.
- **Sign out** clears the session but keeps the data on the device. The user can then "Continue as a guest" and still sees everything made while signed in.
- **One Google account per device.** Once the data belongs to an account, a different Google account signing in on this device is refused with a message naming the owner ("This device is already used by a@gmail.com. Sign in with that account, or clear the app's data to use another."). The data is never shown to or taken over by another account.
- Google sign-in asks for profile and email only. Google Drive access is requested later, the first time the user backs up or syncs.
- The signed-in user's email, name and photo are used as identity. The app remembers the user (or the guest) on the device, so it opens offline without signing in again.
- Signing in or out (or starting or leaving guest mode) in one browser tab applies to all open tabs of the app. Only one tab at a time can open the data; another tab shows a message with a "Try again" button.

### 4.2 Groups
- Create a group with a name, a type (trip / home / couple / other, each with its own icon), a default currency and members.
- Members are picked from people already known on this device (people from the user's other groups), or added through an "Add a new member" dialog (a name, and optionally a Gmail address). Typing an address into the members field no longer adds anyone. A person's email is optional; when given it must be an `@gmail.com` address, which means Google Workspace accounts with other domains cannot be added.
- The creator is always a member of the new group.
- Any member can edit the group's name, type and default currency (5.3a). Adding members to an existing group is not built yet.
- Members who have not opened the app yet are shown as pending. A member without an email is a member on this device only (a payer, in splits and balances); they cannot be invited to share the group through Drive until an email is added, which is not built yet.

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
- Up to 10 photos per expense, added on the add-expense page and shown on the expense details page (5.5, 5.6).
- Photos are stored locally on the device (IndexedDB, one store per account) at original size, with a thumbnail for lists.
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

**Message screens:** a screen that is only a message ("Group not found", "Expense not found", "Couldn't load …" with Try again, "OwnLedger is open in another tab", "Couldn't open your data", and "Opening your data…") is centered vertically and horizontally: on the whole screen when the page has no header, and in the space below the header when it has one (the home page's "Couldn't load your groups" is centered between its heading and the floating Create group button).

**Browser tab titles:** each signed-in page sets the tab's title: "Your groups · OwnLedger" (home), the group's name followed by " · OwnLedger" (group page), "Create a group · OwnLedger", "Add expense · OwnLedger" and the expense's description followed by " · OwnLedger" (expense details; "Expense not found · OwnLedger" for a missing one).

### 5.1 Welcome (logged out)
Single scrolling page, English only, friendly and colorful look (teal/green accent, Ant Design components, icons, gradients and emoji; no image assets). Follows the system light/dark setting. Sections, in order:

1. **Hero:** name "OwnLedger", tagline "Split expenses with friends. Keep your data.", a one-line description that includes "free and open source", and a single **Open OwnLedger** button that opens the page below (5.1b). A short note beneath it says the app works without an account, that signing in with Google (which uses the user's Google Drive) is for backing up and sharing groups, and that nothing is sent to any server, with a link to the Drive FAQ entry.
2. **Install card** (only when not installed). It sits inside the hero, between the highlight lines and the sign-in button, to put the emphasis on installing before getting started. Its heading has an icon: an amber warning icon when installing is required (iPhone/iPad), a teal download icon when it is optional.
   - **iPhone/iPad:** steps "Share, then Add to Home Screen, then open from the home screen", with the reason (installed iOS apps have separate storage) and a small "Continue in browser anyway" link. The Open OwnLedger button appears only once the app runs as an installed PWA.
   - **Android/desktop:** an "Install app" button when the browser offers a native install prompt (`beforeinstallprompt`), otherwise a line telling the user which browser menu entry to use. Open OwnLedger stays visible in the hero, so no skip link is needed.
   - **Installed (standalone):** this section is hidden and the Open OwnLedger button is shown.
   - On iPhone/iPad while gated, the install card replaces the Open OwnLedger button (there is no separate "Install" button). "Continue in browser anyway" reveals Open OwnLedger until the page is reloaded (the choice is not remembered); the card then stays with its skip link removed and its normal heading.
   - A dev flag (`VITE_REQUIRE_INSTALL=false`) turns the iOS gate off locally. In development, `?platform=ios|android|desktop` and `?installed=1` simulate each case (`/ownledger/?platform=ios`).
3. **Feature highlights:** cards for groups, flexible splitting, settle-up, any currency, receipts, budgets and reports, offline use.
4. **Privacy and ownership:** offline first, no OwnLedger servers, privacy first (no ads, no tracking), you own your data, shared on your terms through your own Drive, and open source with a link to https://github.com/omkarsheral1989/expense-tracker (GPL-3.0).
5. **How it works:** open OwnLedger (no account needed), create a group, add expenses, sign in with Google to back up and share.
6. **FAQ:** whether an account is needed (no: Continue as a guest; Google sign-in is for backup and sharing), what happens to guest data when signing in (it becomes the account's), why Drive access is needed (says the permission is broad and that the app only uses its own folders), where data is stored, what happens if browser data is cleared, who can see group expenses, whether personal spending is shared, offline behaviour, deleting data, why Google shows "hasn't verified this app", what "Access blocked" means (while the app is unverified only approved users can sign in; the entry links to https://github.com/omkarsheral1989/expense-tracker/issues to request access), and whether the app is open source.
7. **Footer:** "free and open source (GPL-3.0)" with a link to the GitHub repository.

Copy rules: claims must stay true. "No ads and no tracking" holds only while no analytics or tracking is added to the app.

### 5.1b Open OwnLedger page
Route `/get-started`, opened by the welcome page's Open OwnLedger button (and, on iPhone/iPad, only once the app is installed or "Continue in browser anyway" was chosen). A centered page with the OwnLedger logo, the heading "Open OwnLedger", then in order: the **Sign in with Google** button (Google "G" logo), a divider reading "OR", and a **Continue as a guest** button. Under them a note: "Google sign-in is required to back up your data and share groups with others." with a small Back link to the welcome page. Both buttons are 40 px like the other controls. Signing in or continuing as a guest opens the home page. A person who is already signed in or a guest is taken straight to the home page. If a Google account other than the device's owner signs in, the page shows the refusal message from 4.1 and nothing changes.

### 5.1a Signed-in header
Only the home page has the header; the other signed-in pages (create group, a group, add expense, an expense's details) start with their own content and lead back with their Back buttons (the group page's goes to the home page, the others to the page they came from: the home page or the group). The header is also shown on every page while the user's data is loading, cannot be opened or is open in another tab, so Sign out stays within reach. On those pages without a header, the content starts below the device's status bar or notch (the safe area at the top of the screen). On the home page, on the left is the small OwnLedger logo tile and the name "OwnLedger", which link to the home page from anywhere. On the right is the user's avatar; clicking it opens a menu with the user's name and email and a "Sign out" action (which keeps the account's data on the device) and nothing else. For a guest the avatar is a plain "G" and the menu shows "Guest" with "Your data is only on this device", a "Sign in with Google" action (which makes the signed-in account the owner of the data, 4.1) and an "Exit guest mode" action (back to the welcome page; the data stays on the device and "Continue as a guest" opens it again). There is no banner: the menu is the only reminder. The group page has no actions yet (edit, add member, leave and delete come later).

### 5.2 Home (logged in)
- A "Your groups" heading. A floating green "+ Create group" pill sits at the bottom right of the screen, in every state (loading, empty, list and error), the same pill as "Add expense" on the group page: lined up with the right edge of the 720 px column, 24 px above the bottom, with room left below the list so the last row is not hidden. Below the heading, one centered column (about 720 px wide, the same on phone and desktop) listing the groups the user belongs to, **most recently active first**. A group's activity is the latest change to the group itself or to any of its expenses (adding one moves the group to the top). Each row shows the group-type icon, the name, and underneath it "N members · CUR" (for example "3 members · GBP"); it opens the group's page (`/groups/<id>`).
- Each row ends with the user's balance in that group: "you are owed" over the amount (green) or "you owe" over the amount (orange-red), once per currency, or "Settled up" (grey) when the user's paid and owed amounts there come to zero in every currency.
- **Loading:** while the groups load, grey placeholder rows in the shape of the list are shown. The list is loaded once when the page opens (coming back to it reloads it), and a failed load shows an error message with a "Try again" button.
- **Empty state:** with no groups, a friendly message ("No groups yet. Create one to start sharing expenses.") with its illustration, centered vertically in a box that runs from the "Your groups" heading down to 16 px above the floating "Create group" pill (so the message never sits behind or low next to the pill). There is no second button in the middle of the page.
- The **Personal** row (this month's spending per currency) is not shown yet; it arrives with personal expenses.

### 5.3 Create group
Like the add-expense and expense-details pages, it has no card around its content: the form sits directly on the page background (the thin dividers inside stay).
- Route `/groups/new`, reached from the floating "Create group" button on the home page. Back and the browser's reload warning work as described under Leaving.
- **Name:** required, 1 to 60 characters.
- **Type:** trip / home / couple / other, each shown as an Ant Design icon in a colored tile. "Trip" is preselected.
- **Default currency:** required. A searchable list (by code or name) of all ISO currencies, each shown as code, name and symbol (for example "INR – Indian Rupee (₹)"), with names in the user's language. The currency of the device's region (for example INR in India) is preselected and listed first; the rest follow A to Z. New expenses in the group start with it; an expense can still use any other currency, since each expense carries its own.
- **Members:** one searchable multi-select. It lists people already known on this device (everyone saved here, with name and email, never the user themself); a person without an email shows "No email" where the email would be. Typing only searches the list (by name or email); it never adds anyone. "Add a new member" is always the last row of the list. The creator is added automatically and cannot be removed.
  - **Add a new member dialog** (a centered dialog on desktop, a bottom sheet on phones): a **Name** (required, 1 to 60 characters) and an **Email** (optional; if given, an `@gmail.com` address). Cancel and Add. Add saves the person on this device right away, so they are in the list for every other group even if this group is not created, then closes the dialog and selects them as a member of this group. Problems are shown beside their field when Add is pressed:
    - **Same email:** if the email already belongs to someone on this device, "Priya Shah is already in your list with this email." Nothing is added.
    - **Same name:** names are unique on this device (ignoring case and extra spaces): "You already have someone called Sam." This includes the user themself and people who have no email.
    - An address that is not `@gmail.com` is refused with the same message as before.
- **Validation:** checked only when "Create" is pressed. Every problem (empty name, no currency) is then shown at once, beside its field. The members field has none of its own: a person is checked when added in the dialog.
  - **Same name:** a group cannot have the same name as another group the user belongs to (ignoring case, extra spaces and deleted groups). The message names the existing group ("You already have a group called Goa trip.") and appears beside the name field. This is a convenience check on this device; another member can still create a group with the same name elsewhere, and both groups then simply exist.
  - **Duplicate members:** choosing the same person twice selects them once, and the user is never in the list, since they are added automatically.
- **Leaving:** the page's Cancel and Back buttons leave immediately while the form is untouched. Once a name, type, currency or member has been entered or changed, they ask "Discard this group?" first, and reloading or closing the tab shows the browser's own warning. The browser's Back button is not intercepted: that needs React Router's data router, which the app does not use yet.
- Creating a group only saves it on this device. Sharing it through Drive happens later, at the first sync.
- After creating, a "Group created." message appears and the app opens the new group's page.
- A message under a field disappears as soon as that field is edited.

### 5.3a Edit group
Route `/groups/<id>/edit`, opened by the pencil button on the group page's band. Any member can use it. Like Create group (5.3), the form sits directly on the page background, with Back, the heading "Edit group", and Cancel and Save.
- **Fields:** the group's **name**, **type** and **default currency**, filled in with what the group has now, with the same rules and the same pickers as Create group. There is no members field (members are not edited here yet). The currency's note says new expenses start with it and existing expenses keep theirs: nothing already saved changes.
- **Validation:** checked only when Save is pressed, every problem at once beside its field, a message disappearing as soon as its field is edited. **Same name:** a group cannot take the name of another group the user belongs to (ignoring case, extra spaces and deleted groups), and the message names that group ("You already have a group called Flat bills."). The group's own name is never "taken", so only changing its case works.
- **Saving:** shows "Group updated." and returns to the group page, which shows the new name, type color and currency. It counts as activity: the group moves to the top of the home list. When nothing was changed, Save simply goes back, with no message and no change to the group. A failure shows "Couldn't save the changes. Please try again." and keeps what was typed. A group deleted in the meantime shows "This group is no longer available." and goes to the home page.
- **Leaving:** Back and Cancel go straight back to the group while nothing has changed (spaces around the name do not count). After a change they ask "Discard your changes?" ("What you changed will be lost.", Discard / Keep editing), and reloading or closing the tab shows the browser's own warning.
- **Other states:** grey placeholders while loading, "Couldn't load this group" with Try again, and "Group not found" (the same message as the group page) for a group that does not exist, was deleted, or that the user is not in. The tab title is "Edit group · OwnLedger".

### 5.4 Group page
Route `/groups/<id>`, opened from a group on the home page and after creating a group. The layout follows a phone-first design: a colored band at the top, then the balance, then the actions and the list of expenses. Parts that depend on features that do not exist yet are shown switched off with a "Coming soon" tip, so the page already has its final shape.

- **Colored band** across the full width, colored by the group's type (the same colors as the type tiles: teal for trip, orange for home, pink for couple, blue for other), with a soft gradient and a faint pattern drawn with CSS (no image files). It holds:
  - a round white **back** button on the left (to the home page), and a round **search** button (switched off for now, "Coming soon") and a round **Edit group** (pencil) button on the right, which opens the edit page (5.3a);
  - the group's **type icon tile** (lifted off the band by a soft black shadow, since it is the band's own color) beside the group's **name**, which is large and white, with its first line centered on the tile, and wraps onto more lines below when long (never cut off or running off the screen);
  - a row of translucent pill chips: **Add trip dates** (switched off; it exists for any group type for now), **"N people"** ("1 person" for one), and the group's **default currency** (for example "GBP").
- **"N people" opens the member list**: a bottom sheet on phones and a side panel on desktop, titled "Members (N)". It lists the user first, then the others A to Z; each member has an avatar with their initial, their name with their email under it ("No email" for a member without one; just the email, once, when no name is known), and a tag: "You" for the user (whose own row uses the name saved for them, or else their Google profile name) and "Pending" for everyone else until they have signed in and synced. It closes with its close button or by tapping outside.
- **Balance line** under the band: one sentence per other person and currency that is not settled, "Priya owes you ₹14,517.50" (amount in bold green) or "You owe Priya ₹500.00" (amount in bold orange-red), people A to Z and then currencies A to Z. "You're all settled up" when nothing is owed either way.
- **Action pills**, a row that scrolls sideways when it does not fit: for now only **Settle up**, switched off.
- **Expense list:** the group's expenses as described in 5.5. With none, the message "No expenses yet" and "Expenses you add will appear here." with its illustration, centered vertically in a box that runs from the actions ("Settle up") down to 16 px above the floating "Add expense" button.
- **Add expense:** a floating green pill button at the bottom right of the content. It opens the add-expense page (5.5).
- **Wide screens:** the band stretches edge to edge; the content below it sits in one centered column about 720 px wide, as on the other pages. The band starts at the very top of the screen (no app header above it), below the device's status bar or notch.
- The page loads once when it opens, with grey placeholders while loading and, if loading fails, "Couldn't load this group" with a "Try again" button. The tab title is the group's name followed by " · OwnLedger" ("Group not found · OwnLedger" for a missing group).
- A group that does not exist, was deleted, or that the user does not belong to shows "Group not found" ("It may have been deleted, or you may not be a member of it.") with a "Back to your groups" button. All three cases look the same.

### 5.5 Add expense
Route `/groups/<id>/expenses/new`, opened from the group page's "Add expense" button. Built in five phases (listed at the end of this section). The section also covers the expense list and balance line it brings to the group page.

**Layout and behavior**
- Phone-first single page. A header with Back and a tick (Save). Back asks "Discard this expense?" once anything (including the payer, split or photos) has been entered or changed; reloading or closing the tab shows the browser's own warning (as in create-group).
- Pickers (category, currency, date, who paid, split) open as dialogs: centered on desktop, a bottom sheet on phones. One shared adaptive component provides both.
- A **group switcher** under the header shows the group-type icon, the group's name and a small arrow, full width of the form column (no "With you and" text). It opens a menu of the user's groups with the current one ticked; with only one group it is a plain label. Choosing another group moves the expense there, with the whole group (no choosing of people): the description, category, amount, date, notes and receipts stay, the currency follows the new group's default unless the user chose another one, and the split starts again for the new group's members with the user paying. The form stays on screen while the other group loads (no loading placeholder). Back still asks to discard, since the carried fields count as input. The expense is added to the group shown.
- Form order: category and description; currency and amount; the sentence "Paid by [you] and split [equally]"; the date row; the notes box; the receipts row. The receipts row is stacked, with its icon at the start, no labels and no footer, and does not repeat the group name.
- Saving returns to the group page, shows "Expense added." and the new expense is on top of the list.

**Fields**
- **Description:** required, 1 to 100 characters.
- **Amount:** greater than 0, at most 1 billion, with the currency's decimal places. Only "." is accepted as the decimal mark. Thousands separators appear while typing (lakh style for INR, western style for other currencies) through one shared money formatter. Changing the currency rounds the amount to the new currency's decimals.
- **Category:** about 45 categories in 7 groups (Entertainment, Food and drink, Home, Life, Transportation, Uncategorized, Utilities), each with a stable key, an Ant Design icon and a color of our own (no artwork copied, ADR-030). "General" (in Uncategorized) is the default.
- **Currency:** a 40 px square button showing the currency's symbol ("$", "€", "₹"; "CA$" for a dollar the language tells apart from its own), or "฿" for a currency whose short symbol only it uses, or else its 3-letter code (a shared symbol such as a bare "$" for SGD or "kr" for SEK is never used), in a font shrunk to fit (18 px for one character, 14 px for two or three, 12 px for a code). It opens a picker with a search box (code or name), the chosen currency first under "Selected" (ticked), then a "Recent" section (up to 3: the group's default, then the currencies of the user's own latest expenses on this device), then all ISO currencies A to Z. Each currency is listed once, so the chosen one is left out of Recent and the full list. While searching, only the matches are shown (the chosen one ticked among them).
- **Date:** any date; today by default; a full-width box like the other fields (white, bordered, 40 px high, calendar icon at the start) showing it as "Today, 8 Oct 2026", "Yesterday, 7 Oct 2026", or with the weekday for other days ("Mon, 5 Oct 2026"); chosen in a calendar dialog (react-day-picker) that moves between months, the old month sliding out and the new one in, by swiping sideways, scrolling the wheel or trackpad (one month per flick), the previous and next arrows, or the year and month lists, none of which chooses a day; the chosen day is lit only in its own month. People who asked their device for less motion get the month without the slide.
- **Notes:** a box of 2 to 6 rows, at most 1000 characters, with a counter near the limit.
- **Receipts:** a camera button opens the device's own file chooser (pictures only; it offers the camera on phones), several at a time. Chosen photos appear beside it as small squares in order, each with an x to take it out. Up to 10: choosing more keeps the first ones and says "An expense can have up to 10 photos."; with 10 the button is switched off ("Up to 10 photos."). Files that are not pictures are ignored. Photos are kept on the device at original size with a thumbnail when the expense is saved, and taken off again if it is not.

**Splitting**
- Default: you paid, split equally among all members.
- **3 or more members:** the sentence has two buttons, "Paid by [you]" and "split [equally]".
- **2 members:** one button showing the current quick choice; it opens the four choices "You paid, split equally", "You are owed the full amount", "Priya paid, split equally" and "Priya is owed the full amount", plus "More options" (the split dialog). Once the split is not one of the four, the form shows the two-button sentence instead. Any non-equal split reads "unequally"; an equal split between only some people still reads "equally".
- People are named by first name; without a name, by the part of the email before the "@", with a capital first letter ("Sam" for sam@gmail.com).
- "Multiple people" as payer is shown switched off.
- A group with one member can still get expenses; the split buttons are switched off, with the tip "You are the only member of this group."
- **Who paid** (the "[you]" button): a dialog "Who paid?" listing the members ("You" first) and "Multiple people" switched off.
- **Split dialog** ("Split options"): a "Paid by" dropdown on top, then tabs Equally, Amounts, Percent, Shares, Adjust (each with a heading, a one-line explanation and an icon), one line per member with their avatar and name, and what their part comes to under the name once the split works:
  - **Equally:** tick who shares; the payer may be unticked; at least one person must be ticked.
  - **Exact amounts:** must total the expense amount.
  - **Percentages:** whole numbers, total 100.
  - **Shares:** whole numbers from 0 to 1000, at least one share in total.
  - **Adjustment:** each "+" amount is 0 or more, the adjustments add up to at most the amount, and the remainder is split equally.
- Footers show "X of TOTAL" and "N left" (green at 0) or "N over" (red). No illustrations: a heading, a one-line explanation and an Ant Design icon.
- If the split is not balanced, pressing the dialog's tick shows why ("The split no longer adds up.", "Choose at least one person.", "Give at least one share.", or "Enter the amount first." for amounts and adjustments before an amount is typed) and the dialog stays open. Editing clears the message.
- If the amount changes after exact amounts were entered, the form shows "The split no longer adds up" and Save is blocked until it is fixed.
- The method and the user's inputs are stored, so the split can be shown and edited later.

**Expense list on the group page (replaces the empty list once expenses exist)**
- Flat list, newest date first (the most recently added first within a day), with a quiet grey "September 2025" header (month in full and year) above each month's expenses, including the newest month; the headers scroll with the list. Each row: date (month over day), a colored category tile, the title with "You paid …" (or "Priya paid …") under it, and on the right "you lent" (green), "you borrowed" (orange-red), "no balance" (the user paid exactly their own share, for example in a group of one) or "not involved", with the amount.
- Tapping a row opens the expense's details page (5.6).

**Balance line (group page)**
- One line per person per currency: "Priya owes you …" with the amount in bold green, or "You owe Priya …" with the amount in bold orange-red; "You're all settled up" when there is nothing owed. Debts between two other members are not shown.

**Phases** (each with tests and break-checks, a browser check, and a UX review by the user). All five are built (October 2026, PR #1); the user's UX review of phases 2 to 5 is still to come.
1. A simple expense (equal split, you paid) saved and listed.
2. Balances: the balance line and the home page rows.
3. Who paid, and the other split methods.
4. The expense details page (5.6).
5. Receipt photos, kept on this device (upload and download come with sync).

### 5.6 Expense details
Route `/groups/<id>/expenses/<expenseId>`, opened by tapping an expense on the group page. A first version: it only shows the expense; editing, deleting and the edit history come later.

- Back (to the group), and Edit and Delete buttons switched off ("Coming soon").
- The category tile, the description, the amount in large type, the category's name and the day ("Dining out · Mon, 5 Oct 2026"), and "Added by you" (or the person's name).
- How it was split ("Split equally", "Split by exact amounts", "Split by percentages", "Split by shares", "Split by adjustment") and one line per person who paid or owes something, the user first: "You paid £9.00 and owe £3.00", "Priya Shah owes £6.00". People with no part are left out.
- The notes, keeping their line breaks, under "Notes" (left out when there are none).
- The receipt photos under "Receipts" as thumbnails in order; tapping one shows it at full size, with the others a swipe away. A photo that is not on this device (for example added by another member and not yet synced) shows a grey square "Not on this device". Left out when there are none.
- An expense that does not exist, was deleted, is in another group, or is in a group the user is not in shows "Expense not found" ("It may have been deleted, or you may not be a member of its group.") with a "Back to the group" button. Loading shows grey placeholders; a failed load shows "Couldn't load this expense" with "Try again".

## 6. Open questions
- Google Cloud setup: the OAuth client ID is not created yet (Drive API, consent screen in Testing mode, authorized origins, test users).
- Member removal: what happens to a removed member's access and local data.
- Adding or changing a person's email later (so a member added without one can be invited), renaming a person, and how sync treats members without an email.
- Group page: what the search button opens, how trip dates work (which group types, start and end), and what else the pill row holds (balances, totals, charts).
- Tags on expenses.
- Editing and deleting expenses, and how the edit history is shown.
- Several payers for one expense ("Multiple people" is switched off for now).
- Settle up: recording a payment between two members.
- Budget details (personal vs group, alerts).
- Charts library.
- Receipt cleanup rules for deleted expenses, and an optional compression setting.
- Group ownership transfer / export if the folder owner leaves.
- App lock or PIN.
- Leaving or deleting a group.
