# Testing sync on real Google Drive

_Last updated: 2026-10-21_. A manual check of backup, bringing a backup back, and group sync (PRD 5.8, ADR-044) against real Google Drive with two Google accounts. The automated tests only use a fake Drive, so this is the first run against Google itself. Tick each box, and write down anything that differs (the dialog's text, the browser console, the Network tab).

You need:
- **Account A** (the group's creator) and **account B** (a member), both `@gmail.com`. A third account **C** is needed only for step 4.6 (a member added later); add it as a test user too.
- **Three fresh Chrome profiles**: A1 and A2 for account A (two "devices"), B1 for account B. The app keeps one set of data per browser profile, and the first Google account to sign in there owns it (ADR-035). Use new profiles, not your everyday one, so no guest data there is taken over.

## 1. Google Cloud setup (once)

1. [ ] Open https://console.cloud.google.com and create a project, for example "OwnLedger".
2. [ ] **APIs & Services → Library**: find **Google Drive API** and press **Enable**.
3. [ ] **Google Auth Platform** (called "OAuth consent screen" in older consoles):
   - [ ] **Branding**: app name "OwnLedger", your support email, your developer contact email.
   - [ ] **Audience**: user type **External**, publishing status **Testing**. Under **Test users**, add account A and account B. Only test users can sign in while the app is in Testing (up to 100).
   - [ ] **Data access**: add the scopes `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` and `https://www.googleapis.com/auth/drive`. Drive is a restricted scope; in Testing that only means the "hasn't verified this app" screen (ADR-009).
4. [ ] **Clients → Create client** (or **Credentials → Create credentials → OAuth client ID**): type **Web application**, name "OwnLedger web".
   - [ ] **Authorized JavaScript origins**: `http://localhost:5173` (dev server), `http://localhost:4173` (preview build) and `https://omkarsheral1989.github.io` (the deployed app). Origins have no path.
   - [ ] **Authorized redirect URIs**: leave empty. The app uses the popup token flow, which needs none.
5. [ ] Copy the **Client ID** (it ends in `.apps.googleusercontent.com`; it is public by design). Never copy or commit the client secret: the app does not use it, and `google-settings.json` must never be staged.
6. [ ] Put it in `.env.local` as `VITE_GOOGLE_CLIENT_ID=<client id>`, and set `VITE_REQUIRE_INSTALL=false` so desktop testing is not gated.
7. [ ] Restart the dev server (`bun run dev`), so Vite reads `.env.local` again.

A new client ID can take a few minutes to work; a sign-in error right after creating it may just be that.

## 2. Sign in and give Drive access (profile A1, account A)

1. [ ] Open `http://localhost:5173/ownledger/` → **Open OwnLedger** → **Sign in with Google** and pick account A. Expect Google's "hasn't verified this app" screen: **Continue**. Only profile, email and name are asked for here.
2. [ ] Create a group **Drive test** (GBP). Members: add **account B's email** with a name, and **Sam** with no email.
3. [ ] Add an expense **Dinner, £30.00**, split equally, with **two receipt photos**.
4. [ ] Press the **cloud Sync button** in the home header. Google's window opens again, asking for **Drive** access (the second consent, ADR-019): allow it.
   - [ ] The **Backup** line is first: "Getting your backup…" (there is none yet), then "Waiting for your groups…".
   - [ ] **Drive test** "Getting changes…" → "Sending your changes…" → "Sending photos…" → **Shared with B's first name** (not Sam, who has no email).
   - [ ] Then the Backup line finishes: "Saving your data…" → "Backing up photos… 1 of 2" → "2 of 2" → **Backed up**.
   - [ ] The footer says **Last synced just now**, and so does the Sync button's tooltip.
5. [ ] In https://drive.google.com as account A, check that these exist:
   - [ ] `OwnLedger/Backup/backup.json` and `OwnLedger/Backup/photos/` with two `<id>.jpg` (or `.png`) files.
   - [ ] `OwnLedger/Groups/Drive test/<account A's email>.json` and `OwnLedger/Groups/Drive test/photos/` with the two photos.
   - [ ] **Share** on `Drive test` lists account B as an **Editor**.
6. [ ] Account B's Gmail has Drive's "shared a folder with you" email.
7. [ ] Press Sync again. Every line ends Synced (or Backed up), and Drive gets **no duplicate** files or folders.

## 3. Group sync from the member (profile B1, account B)

1. [ ] Sign in with account B, then press **Sync** and allow Drive access.
   - [ ] The dialog lists **New group: Drive test** → Synced.
   - [ ] The home page shows **Drive test**, with A's Dinner and the right balance ("you owe" £10.00).
2. [ ] Open the expense. Both receipt photos show at full size (not "Not on this device").
3. [ ] **Members** sheet: account A has **no Pending tag**, B is **You**, Sam is **Pending**.
4. [ ] In B's Drive: `Drive test` is under **Shared with me**, and `OwnLedger/Groups/` has a **shortcut** to it.
5. [ ] On B: add **Taxi, £9.00** with one photo; **edit A's Dinner** (for example, change its description); then press the **band's round Sync button** on the group page.
   - [ ] The dialog shows only the **Drive test** line, with no Backup line.

## 4. Changes reaching the creator (profile A1)

1. [ ] On A, open Drive test and press the band's Sync button.
   - [ ] Taxi appears with its photo, and Dinner shows B's edit with "Edited by B…" and an entry in its History.
   - [ ] The balance line agrees with B's device (B owes A £7.00 net).
   - [ ] The members sheet: B is **no longer Pending**.
2. [ ] On B, **rename** the group to **Drive test 2** and Sync. Then on A, Sync.
   - [ ] A's group is now Drive test 2, and A's Drive folder is renamed to **Drive test 2** (only the creator's sync renames it).
3. [ ] **Delete and restore.** On B, delete Taxi and press the band's Sync. On A, Sync.
   - [ ] A's list shows "B deleted 'Taxi' (£9.00)", and the balance no longer counts it.
   - [ ] On A, open the deleted Taxi and press **Restore**, then Sync on A and on B. B's list shows Taxi as a normal row again, and its History has both the deletion and the restoration.
4. [ ] **A payment.** On B, **Settle up**: B paid A the amount B owes. Sync on B, then on A.
   - [ ] A's list shows "B paid you £…", and both devices read "You're all settled up" (or the same remaining balance).
5. [ ] **Both edit the same expense before syncing.** On A, change Dinner's description to "Dinner A"; a minute later on B, change it to "Dinner B", without syncing in between. Sync on A, then B, then A again.
   - [ ] Both devices show "Dinner B" (the later edit wins), and Dinner's History on both shows both edits.
6. [ ] **A member added later** (needs a third Gmail account, C; skip if you have none). On A, open the members sheet → **Add member** → **Add a new member** with C's email, then Sync.
   - [ ] The group's line says **Shared with C's first name**, and C gets Drive's sharing email.
   - [ ] In a fresh profile, C signs in and Syncs: "New group: Drive test 2" appears with every expense.

## 5. Another device, and a cleared one (account A)

There is no Restore button: Sync adds the backup in Drive to the device before writing it (PRD 5.8, phase 6).

1. [ ] In profile A2, sign in with account A. The home page is empty, and the avatar menu has only the name, email and **Sign out**.
2. [ ] Press **Sync**. The Backup line shows "Getting your backup…" → "Downloading photos… 1 of N" … "N of N" (never "0 of …") → "Waiting for your groups…", the groups sync, then **Backed up**.
   - [ ] Drive test 2, with Dinner (and its photos and history), Taxi and B's edit, is on the home page, with no duplicate groups, expenses or people (one account A, one B, one Sam).
   - [ ] In A's Drive, `backup.json` still holds everything (download it and look for Drive test 2): the empty device did not replace it with less.
3. [ ] Press Sync again in A1, where everything is already present: nothing is duplicated or lost.
4. [ ] **Two devices of one account, one after the other.** On A2, add an expense **Snacks, £4.00** to Drive test 2 and Sync. On A1, add **Fuel, £20.00** and Sync. Then Sync on A2 again.
   - [ ] Both devices have Snacks and Fuel.
   - [ ] The group folder still has **one** `<account A's email>.json` (A1 and A2 write the same file).
5. [ ] **A cleared device.** In A1, DevTools → Application → **Clear site data**, reload, sign in with account A again and press Sync. Everything comes back as in step 2.
   - [ ] The group folder still has **one** `<account A's email>.json`, and no new file for A (A's person id may have changed, the file did not).
   - [ ] On B, Sync, then open the members sheet: A is listed **once**, and A's expenses still say A paid them.
6. [ ] **No backup at all.** Move `OwnLedger/Backup` to the bin in A's Drive, clear A2's site data as in step 5, sign in and Sync. Drive test 2 comes back as **New group: Drive test 2**, from its own folder, and a new `Backup` is made.

## 6. Failures

1. [ ] **Drive access runs out.** At https://myaccount.google.com/permissions remove OwnLedger's access for account A, or wait more than an hour. Press Sync in A1.
   - [ ] The line says "Sign-in to Drive expired. Press Continue to carry on." and the footer has **Continue**.
   - [ ] Continue opens Google's window again, and after allowing access the sync finishes.
2. [ ] **Not allowed.** In Google's Drive window, untick Drive access or close the window: "OwnLedger needs access to your Drive to sync. Press Sync to try again."
3. [ ] **Wrong account.** In Google's window, pick account B while signed in as A: "Choose the Google account you signed in with to sync." Nothing is written to B's Drive.
4. [ ] **Offline.** DevTools → Network → **Offline**, then press Sync: "Sync needs an internet connection."
5. [ ] **Connection drops mid-sync.** With a few photos to upload (add a new expense with several large photos), press Sync and switch to Offline while photos are going: "Lost the connection. Press Sync to try again." and no further group starts. Go back online, press Sync: it carries on.
6. [ ] **Leave warning.** Reload the tab during a sync: the browser asks "Leave site?". When nothing is running, there is no warning.
7. [ ] **Deleted group folder.** As A, move `OwnLedger/Groups/Drive test 2` to the bin in Drive. Press Sync in A1.
   - [ ] The folder is made again, B is emailed again, and the line says "Shared with B".
   - [ ] On B, Sync: B's data is still there, and B's `OwnLedger/Groups` has a new shortcut (the old one points nowhere).
8. [ ] **Waiting for the creator.** On B, create a group with account A as a member, and on A press Sync before B does: A's device does not have that group yet, so nothing shows. Then B syncs and A syncs: A gets "New group: …".
9. [ ] **Guest.** In a fresh profile, Continue as a guest and press Sync: "Sign in to sync" with Cancel and Sign in with Google.

A full Drive ("Your Google Drive is full…") cannot be set up easily with a real account; the automated tests cover it.

## 7. Deployed site (optional)

1. [ ] Deploy (`bun run deploy:pages`, then commit and push in the Pages repository, ADR-032) with the client ID in `.env.local`.
2. [ ] Repeat steps 2 and 3 at `https://omkarsheral1989.github.io/ownledger/`.
3. [ ] On an iPhone, add the app to the Home Screen and sign in and Sync from the installed app. Google sign-in inside an installed iOS app is the risk ADR-014 names; note whether the popup opens and returns.

## 8. Clean up

1. [ ] Delete `OwnLedger` in both accounts' My Drive, and empty the bin if you want it gone for good.
2. [ ] At https://myaccount.google.com/permissions remove OwnLedger's access for both accounts.
3. [ ] Remove the test Chrome profiles, or clear their site data for `localhost:5173` (DevTools → Application → Clear site data).
4. [ ] Keep the Google Cloud project and client ID if you will use them again. Mark the PRD's open question about the OAuth client as done once it works.
