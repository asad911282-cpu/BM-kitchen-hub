# Biryani Master — Kitchen Daily Stock v2.1

Three apps, one live Firebase project (**bm-kitchen-hub**), no saved daily
files. All data lives in Firestore as a continuous record; any historical
day or date range can be pulled up in every app. This is a complete fresh
build — the v1.0 pack was rejected by the user and none of its template
is reused here.

> **v2.1 (2026-11-12) fixes the two v2.0 failures — see "Why v2.0 failed"
> below. TOTA RICE IS RESTORED as a seventh material (see below) and
> the Kitchen gains "Send to Other Branch". Everything else in v2.0 is
> unchanged: 7 dishes, roles, ID-first setup, no billing-document
> wording, signature "Developed by Abdullah" + "0311 5928444",
> logo/header layout, date ranges, branch pairs,
> admin@biryanimaster.com. The website "Biryani Master Supply Manager"
> is included in this pack (see "Website" below) — same live
> bm-kitchen-hub data as the apps, per-role web configs.**

| App | Package | APK | Label |
|---|---|---|---|
| Supply Manager Admin | `com.bm.supplier` | `DS-Admin-v2.1.apk` | Supply Manager |
| Restaurant | `com.bm.restaurant` | `DS-Restaurant-v2.1.apk` | BM Restaurant |
| Kitchen | `com.bm.kitchen` | `DS-Kitchen-v2.1.apk` | BM Kitchen |
| Website — Biryani Master Supply Manager | — (web app) | `DS-Website.html` | Biryani Master Supply Manager |

Version 2.1 (versionCode 3). Fresh installs — new packages, no update over
Kitchen Supply v1.6 (a different system, untouched by this pack).
Firebase config for **bm-kitchen-hub** is baked into each HTML file
(one config per app — Kitchen / Restaurant / Supply Manager — plus
three role configs in the website). No Gradle plugin or Android Studio
setup is needed — the apps are HTML-wrapped, the Firebase config is
baked into the HTML files.
Branding on every app and report: Biryani Master logo + "Developed by
Abdullah" + **0311 5928444**.

Project repository: https://github.com/asad911282-cpu/BM-kitchen-hub.git

## Why v2.0 failed — and what v2.1 does about it

**Failure 1 — Kitchen NEVER received orders (sync-down missing).**
In v2.0 `renderPending()` read ONLY localStorage, `fbInit()` downloaded
only `ds_meta` branches/assignments, and `fbSyncOrder()` only UPLOADED.
A Restaurant order could never reach the Kitchen phone — foreground or
background — because nothing ever downloaded `ds_orders`.

**Failure 2 — background alert never fired.** The alert was Web Audio +
a 5-second poll only, with no system notification. Android suspends the
WebView when the app is backgrounded/minimised, so the tone and the poll
both stop and nothing appears in the notification tray.

**v2.1 sync — how it works now:**
- **Live listener:** on login each app starts a Firestore `onSnapshot`
  listener on `ds_orders` — Kitchen: `where('kitchenBranch','==',own
  kitchen)`; Restaurant: `where('branch','==',own restaurant)`; Admin:
  whole collection ordered by `updatedAt` desc, limit 200. Single-field
  `where` clauses only — no composite index needed. The listener merges
  every change into localStorage and re-renders at once. The old 5-second
  `renderPending()` poll is gone; a re-pull happens when the app returns
  to the foreground (`visibilitychange`) and every 30 s ONLY while the
  listener is down.
- **Merge rules:** every order and day doc carries `updatedAt` (ISO) +
  `updatedBy`. Remote wins iff `remote.updatedAt > local.updatedAt`;
  on a tie, `updatedBy === 'Admin'` wins. Status is MONOTONIC —
  Accepted / Rejected / Voided NEVER revert to Pending. Deletion is a
  TOMBSTONE (`{deleted:true, updatedAt, updatedBy:'Admin'}`); sync-down
  seeing one removes the local copy.
- **Outbox (offline → online replay):** uploads go through an outbox
  (`ds_outbox` in localStorage). A failed upload is queued and flushed
  in order on reconnect (`online` event, listener re-established, or a
  15 s retry timer). No silent failures anywhere in the sync layer —
  every failure is recorded and shown in the sync pill.
- **Sync health:** the header pill now tells the truth — "● Firebase
  Online" (listener active AND last successful round-trip < 60 s),
  "Local only — no connection" (offline / no SDK), or "⚠ Sync failed —
  \<short reason\> — tap to retry" (tap retries the sync). A line under
  the header shows "Last sync HH:MM:SS · Pending uploads: N".
  `window.DS.syncStatus()` returns `{state, lastSync, pendingUploads,
  lastError}` for tests.
- **Foreground alert + notification:** when the listener sees a newly
  arrived Pending order, the Kitchen calls the native `OrderAlert`
  plugin (`Capacitor.nativePromise('OrderAlert','notifyOrder',…)`) — or
  a Web Notification if the plugin is absent and permission is granted —
  and the existing Web Audio loop + vibration keeps sounding in the
  foreground. Notification permission is requested once at login. The
  "Enable Sound" button stays.
- **Background path:** on Kitchen login the app also calls
  `OrderAlert.startListening` (native foreground service, the primary
  background path) with the baked Firebase config + pair/branch, and
  `stopListening` on logout. FCM is the killed-app fallback only: after
  login the Kitchen registers its token in `ds_tokens/{token}` (see
  "FCM deploy steps" below); any failure is logged, never blocks login.

## Phone settings the user must check (Kitchen phone)

Android can still silence the alert even with v2.1 if these are off —
check them on the Kitchen phone after installing:
1. **Notifications allowed** for the BM Kitchen app (Settings → Apps →
   BM Kitchen → Notifications → ON).
2. **Battery optimisation OFF / Unrestricted** for BM Kitchen
   (Settings → Apps → BM Kitchen → Battery → Unrestricted). If Android
   optimises the app, it kills the background listener and the tone.
3. Keep the app's **"Enable Sound"** tapped once after first login
   (browsers block autoplay until the user taps).

## FCM deploy steps (killed-app push — optional, best-effort)

1. Firebase console → project bm-kitchen-hub → Project settings →
   Cloud Messaging → **Web Push certificates** → Generate key pair.
   Copy the key.
2. In `build_html.py`, replace `VAPID_KEY =
   'PASTE_YOUR_VAPID_KEY_HERE'` with that key and rebuild the HTMLs
   (APKs must be rebuilt after — the key is baked into the HTML).
3. Publish the v2.1 rules file (it adds the open `ds_tokens` path).
4. A Cloud Function that watches `ds_orders` for new Pending docs and
   sends an FCM message to the matching `ds_tokens` entry is still
   needed for killed-app delivery — the `functions/` directory for it
   is a follow-up; the foreground service (`OrderAlert.startListening`)
   is the primary background path until then. FCM needs the Blaze plan
   for Cloud Functions.

## Admin — void / delete test orders (new in v2.1)

- **Void one order:** Admin → Settings → Entries → tap the order →
  "Void" (or call `DS.adminVoidOrder(id, reason, note)`). Status
  becomes **Voided**, with reason + audit entry. Voided orders vanish
  from the Kitchen queue and are EXCLUDED from Used / Recipe Use /
  totals / reports.
- **Delete one order:** same screen → "Delete Entry" (audit note
  required). The order is removed locally AND a tombstone is written
  to Firestore, so it disappears on every device.
- **Bulk clear all test data:** Admin only —
  `DS.adminClearTestData('CLEAR', 'audit note')`. You must type exactly
  `CLEAR` plus an audit note. It deletes ALL local orders + ALL local
  day docs, tombstones every order and deletes every day doc in
  Firestore, and writes ONE audit entry ("Cleared test data: N orders,
  M days"). Use it before going live to wipe mock data.
- **Admin-only enforcement:** void / delete / bulk-clear (and
  `adminEditOrder`, `adminDeleteOrder`, `adminSetPrevious`) throw
  unless the app is logged in as Admin — Restaurant/Kitchen cannot
  call them, even from devtools.

## Console steps (Abdullah — Firebase console, project bm-kitchen-hub)

1. **Create the Firestore database** (if not already created) — production mode
   is fine; the rules below open the `ds_*` paths.
2. **Publish the rules file** `Biryani-Master-Daily-Stock-Firestore-Rules.rules`
   (Firestore → Rules → paste → Publish). Admin writes are gated on
   `admin@biryanimaster.com`; day/order data is open read/write like the
   other Biryani projects.
3. **Enable Email/Password sign-in** (Authentication → Sign-in method) so the
   Admin's Firebase Auth session satisfies the `admin@biryanimaster.com`
   rules gate. If this is not enabled, the Admin app still logs in locally
   and works on-device, but admin-gated writes (audit log, admin record)
   stay local-only until Auth is enabled.

No package registration step remains — all three Android packages are
already registered in bm-kitchen-hub.

## Roles (corrected in v2.0 — this is what v1.0 got wrong)

- **Restaurant does ALL dish entries — the 7 dishes only:** Chicken Biryani,
  Chicken Pulao, Beef Pulao, Mutton Pulao, Chana Pulao, Zarda (Rice only),
  Daal Chawal (**Tota Rice + Daal** — never normal Rice). Those entries ARE the order.
- **Kitchen does NO dish entries at all.** Kitchen only: (a) Accept/Reject
  pending orders, (b) its OWN stock movements — Previous stock, Stock In
  (chicken in shoppers, 1 shopper = 7 kg, plus direct received kg for
  beef / rice / daal / chana / mutton), Out-Stock (anything the Kitchen
  sends out, e.g. Staff Food — Chicken).
- **Admin does NO daily entry forms at all.** Admin is control only:
  branch pairs, items/recipes, users/devices + branch assignments,
  Settings → Entries (edit/delete any placed entry, audit-logged),
  viewing all data/history/reports.
- Restaurant can SEE the Kitchen's stock (read-only Remaining per
  material on the order screen) but cannot enter or edit it.

## First-time setup — ID FIRST

Setup order is fixed in every app: **(1) ID** — the user's fixed permanent
ID (e.g. a Restaurant's own ID such as "shaheen"; it stays that specific ID
afterwards, only the Admin can change it), **(2) Branch/Pair** (choose from
the Admin's list), **(3) own 4-digit PIN**, **(4) mobile number** (account
recovery / PIN reset). **Login afterwards is ID + PIN — NOT PIN-only.**
A wrong ID is refused. The ID is shown in the app header after login.
Branch is locked after login (only Admin can change it, via Admin app
device assignments, audit-logged).

- **Admin:** log in with **admin@biryanimaster.com** (this ID only — it is
  also the admin gate in the Firestore rules). First login sets the Admin
  password (min 4 characters, stored hashed). Forgot password?
  "Password bhool gaye?" on the login card — enter the Admin mobile number
  to reset it. Note: if a Firebase Auth user was already created with the
  old password, update that user's password in the Firebase console too,
  or the rules gate will not be satisfied until then.
- **Restaurant / Kitchen:** first-time setup as above. Returning login is
  ID + PIN. PINs are stored hashed (SHA-256), never plaintext. Forgot PIN?
  "PIN bhool gaye?" on the login card — enter the **registered** mobile
  number to set a new PIN.

## Branch lock (binding rule)

- Each user is **locked to the branch they picked at first setup** and
  cannot switch branches in their own app — there is no branch switcher
  in the Restaurant or Kitchen app.
- **Only the Admin can change a user's branch:** Admin app → Users &
  Devices tab. Devices appear there after a user completes first-time
  setup on their phone. Pick the new branch and tap "Change Branch"
  (recorded in the Audit Log); the device adopts the new branch on its
  next launch when online.
- Admin can also **deactivate a branch pair** (Branches tab). A deactivated
  pair's users cannot log in until the Admin reactivates it.

## Branch pairs (strict)

- Main Branch 39C Restaurant ↔ 39C Kitchen
- Shaheen Branch Restaurant ↔ Shaheen Kitchen
- Canal Branch Restaurant ↔ Canal Kitchen

Each pair is one Restaurant + one Kitchen. **Orders route only inside a
pair** — a Restaurant's order goes only to its own paired Kitchen, never to
another branch's Kitchen (enforced by `branchPairId` on every order).
Admin can add more pairs (always one Restaurant + one Kitchen).

## Orders

1. Restaurant places an order (dish + kg + Patila). Status: **Pending**.
2. Once placed, the Restaurant **cannot edit or delete** the order.
3. The paired Kitchen sees it in its pending queue and a **continuous
   non-stop alert tone** sounds (Web Audio loop + vibration) until the
   Kitchen explicitly taps **Accept** or **Reject** (reject needs a reason).
   Browsers block autoplay, so the Kitchen app has a one-tap
   **"Enable Sound"** button on first open — tap it once and the tone
   works from then on.
4. Accepting **locks the order fully** (immutable) and feeds its quantities
   into that day's Recipe Use / Used sums. Rejected orders feed nothing,
   and the dish unlocks for the Restaurant to enter again. The tone is
   scoped to that Kitchen's own pair only.

## Entry method — two columns, 1 row = 1 Patila

- Each dish card has two-column entry rows: **Rice / Tota Rice kg on the left,
  protein kg on the right** (Chicken / Beef / Mutton / Daal / Chana).
  Zarda is a single entry (Rice only). Daal Chawal is Tota Rice one side +
  Daal other side.
- **Each entry row = 1 Patila.** No kg-per-patila conversion is invented.
- **Daal Chawal is double:** its Tota patila and its Daal patila are
  counted and shown separately (e.g. "Tota 2 | Daal 2").
- A live sum row sits under each dish card.

## Entries are immutable — only the Admin can change one

Once an entry is placed/sent, **neither the Restaurant nor the Kitchen
can edit or delete it**. Draft rows not yet sent may still be corrected
by their author; once sent, they are locked for everyone except the Admin.
**Admin → Settings → Entries:** the full entries list (dish orders +
Kitchen stock entries, with branch + date) sits below; tap any entry to
edit or delete it — simple, nothing else. Every change needs an audit
note and is written to the Audit Log (`ds_audit` in Firestore when
online). Empty note = refused, no change. The same tab also lets the
Admin change a day's Previous stock (audit-logged).

## Tota Rice — a separate material (restored in v2.1)

There are **seven materials**: Chicken, Beef, Mutton, Rice, **Tota Rice**,
Daal, Chana. Tota Rice has its own separate stock (Previous / Received /
Used / Send Out / Remaining), its own totals, and its own card in Total
Used Today and the Stock Bill. **Normal Rice and Tota Rice NEVER mix:**
Biryani / Pulao / Zarda / Chana Pulao deduct from Rice; Daal Chawal
(orders AND send-out) deducts from Tota Rice + Daal. If Tota stock is 0,
the entry still records and Remaining stays 0 (never minus). The word
"tota" is no longer banned — "Tota Rice" appears in the UI; only the
three v2.0 banned terms remain banned (see the word-scan note in
`verify/harness.js`: zero occurrences in any shipped HTML).

## Send to Other Branch (Kitchen ONLY)

Kitchen → **Send to Other Branch** section: pick a **destination branch**
(the other branches) and a **dish or single item** (the 7 dishes +
Chicken, Beef, Mutton, Rice, Tota Rice, Daal, Chana as single items).
Selecting a dish opens its two entry fields: Daal Chawal → Tota Rice +
Daal; Chana Pulao → Rice + Chana; Biryani/Pulao → Rice + protein; Zarda →
Rice only; a single item → that item only. Patila: Daal Chawal counts its
Tota patila + Daal patila separately, every other entry is 1 patila.
Sending deducts from the matching stocks (normal dishes from Rice, Daal
Chawal from Tota Rice, chicken from Chicken). The existing Staff Food
Out-Stock entry stays alongside it. Sent entries are locked like all
stock entries — only the Admin can change one (Settings → Entries).
The Restaurant app has NO Send to Other Branch UI.

## Daily stock & report (live view, not a saved file)

- **Materials — exactly seven:** Chicken, Beef, Mutton, Rice, Tota Rice, Daal, Chana.
- **Chicken In:** 1 shopper = 7 kg chicken. Shoppers input → kg received.
  Other materials come in as direct received kg.
- **Stock maths per material:** Previous + Received − Used − Send Out =
  Remaining, **clamped at 0** (negatives show as 0).
- **Used comes ONLY from accepted orders** (the 7 dishes). Send Out =
  Kitchen Out-Stock rows (e.g. Staff Food — Chicken).
- **Remaining NEVER goes below zero, for any material.** Remaining =
  Previous + Received − Used − Send Out, clamped at minimum 0 — even
  when Used is bigger than Previous + Received, when Send Out is bigger
  than what remains, or when Previous stock is zero. No negative number
  may appear anywhere in the Daily Report, Stock Bill, or WhatsApp/PDF
  share. Usage drawing on previous stock lying there still counts
  normally (e.g. Previous 100, Used 30 → Remaining 70). The harness
  proves this with dedicated clamp tests on every material, including
  the recomputed golden day.
- **Date range:** 11–11 returns ONLY the 11th; 10–11 returns BOTH days
  (summed). Previous = the first day's Previous; Remaining is recomputed
  from the summed figures.
- End-of-day live report ("Daily Report" / "Daily Kitchen Stock"): header
  (logo on top, title below it, then date/branch), Recipe Use table
  (Item | Rice | Protein | Patila — send-out rows tagged "Sent Out"),
  Total Used Today cards, Stock Bill cards per material (Previous / Received (+)
  / Used (−) / Send Out (−) / Remaining; zero rows hidden except
  Used/Remaining), footer "Developed by Abdullah" + "0311 5928444".
  Actions: Share on WhatsApp, Download PDF, Print, Copy Full Report.
- **No billing-document wording anywhere in the apps** — the daily view
  is called "Daily Report" / "Daily Kitchen Stock" only.

## WhatsApp share — why the old share cut off, and the v2 fix

**Cause:** v1.0 put the whole report text into a `wa.me` URL. URLs have
length limits and WhatsApp cuts the preview, so the report arrived
truncated.
**Fix:** the report now travels as a **file** through the system share
sheet — a PNG picture of the report (html2canvas via CDN when online)
first, or a PDF (jsPDF via CDN when online). The `wa.me` link carries
ONLY a short summary (branch + date + headline used/remaining sums,
under 300 characters). The full report text is **never** put in a URL.
**Fallback** (no share sheet / no CDN libraries): the full report text
is copied to the clipboard, a PDF is downloaded or the print view is
opened, and WhatsApp opens with the short summary only — plus a
"Copy Full Report" button so the user can paste the complete report
into WhatsApp themselves.

## Golden example day (2026-10-21, Main Branch 39/C) — original numbers, Tota restored

Fixture: previous {chicken: 40, beef: 0, mutton: 0, rice: 260, tota: 9,
daal: 0, chana: 0}; shoppers [15] → received chicken 105; accepted orders:
chicken_biryani rice 96 / chicken 94 in 17 rows; chicken_pulao 25/24 in
5 rows; beef_pulao 12/10 in 3 rows; mutton_pulao 3/3 in 1 row;
chana_pulao 4/1 in 1 row; zarda rice 5 in 1 row; daal_chawal **tota 10 /
daal 4** in 2 rows (Tota patila 2 + Daal patila 2); Kitchen Out-Stock:
Staff Food chicken 1 in 1 row, plus Daal Chawal sent to **Chana Branch
D-Plaza** — Tota 2 kg, Daal 1.5 kg, Tota patila 1 / Daal patila 1.

Recomputed expected results (tested by the harness):
Used {rice: 145, tota: 10, chicken: 118, beef: 10, mutton: 3, daal: 4,
chana: 1} (Rice = 96+25+12+3+4+5 = 145 — Daal Chawal no longer counts
towards Rice); Received {chicken: 105}; Send Out {chicken: 1 (Staff Food
only), tota: 2, daal: 1.5}; Remaining {chicken: 26, **rice: 115**,
tota: 0, beef: 0, mutton: 0, daal: 0, chana: 0}
(Chicken = 40+105−118−1 = 26; Rice = 260+0−145−0 = **115**; Tota =
9+0−10−2 = −3 → clamped at 0; Daal = 0+0−4−1.5 → clamped at 0; others
clamp at 0). NOTE: the brief's "Rice 105" is the old figure from when
Daal Chawal still used normal Rice (260−155 = 105); with Daal Chawal on
Tota, Rice Used is 145 and Remaining is 115 by the stock formula — the
formula rules. Patila: Biryani 17, Chicken Pulao 5, Beef Pulao 3, Mutton
Pulao 1, Chana Pulao 1, Zarda 1, Daal Chawal Tota 2 / Daal 2; D-Plaza
send-out Daal Chawal Tota 1 / Daal 1.

## Data model (Firestore, project bm-kitchen-hub)

- `ds_daily/<branch>/days/<YYYY-MM-DD>` — previous{}, previousLocked,
  stockIn[] ({kind:"shoppers",count} or {kind:"direct",material,kg}),
  sendOut[] ({material,kg,label} for Staff Food etc., {kind:"dish",
  recipe,dest,qtyA,qtyB,patila} or {kind:"single",material,kg,dest}
  for Send to Other Branch)
- `ds_orders/<orderId>` — branch, branchPairId, kitchenBranch, date, recipe,
  quantities, patila, status (Pending/Accepted/Rejected/**Voided**),
  createdBy, timestamps, acceptedBy/at, rejectReason, **updatedAt,
  updatedBy** (v2.1 merge stamps). A deleted order is a tombstone doc
  `{deleted:true, updatedAt, updatedBy:'Admin'}`.
- `ds_tokens/<token>` — v2.1 FCM device token for the Kitchen
  (pairId, kitchenBranch, role 'kitchen', updatedAt).
- `ds_meta/branches` — branch pairs; `ds_meta/assignments` — per-device
  branch assignments (branch lock); `ds_meta/admin` — Admin record;
  `ds_audit` — override log

When offline, each app works on-device (localStorage) and syncs to
Firestore when online. The header pill shows "● Firebase Online" only
when actually connected, otherwise "Local only".

## Icons (new for v2.0)

Fresh designs, distinct from v1.0, all carrying the real Biryani Master
logo in a gold-ringed circle at top-centre, verified at 48px under a
circular mask (`icons-check-48.png`):
Admin royal blue #1D4ED8, gold shield + white check, pill "ADMIN";
Restaurant warm orange #EA580C, gold steaming bowl, pill "RESTAURANT";
Kitchen fresh teal #0F766E, gold stock pot + ladle, pill "KITCHEN".
All densities + splash (portrait/landscape) per density, generated by
`gen_icons.py`. The APK build script copies them.

## Verification (v2.1 pack)

- jsdom harness `verify/harness.js`: **full matrix, run 3 consecutive
  times clean** — the v2.0 suite (139 tests, updated for 7 materials and
  the recomputed golden day) PLUS new suites: (1) Kitchen entries
  (shoppers ×7, Previous lock, Out-Stock, Staff Food, invalid inputs,
  edit/delete blocked), (2) sync two-device on a shared fake Firestore
  (Restaurant order → Kitchen receives it + alert/notification fires,
  accept/reject propagation, Admin override propagation, offline→online
  outbox replay, sync-down of days/history, branch-pair isolation,
  wrong-branch login refused), (3) display (Daily Report totals, Total
  Used Today, Stock Bill Remaining clamped at 0, Patila counts incl.
  Daal Chawal double, date ranges 11–11 vs 10–11, WhatsApp share
  payload completeness, PDF content), (4) Admin (every case — login,
  pairs, items, users/devices, Settings → Entries, void, delete, bulk
  clear, Admin-only gates), (5) CLAMP — Remaining never negative for
  any of the 7 materials (Used > Previous + Received, Send Out >
  what remains, zero Previous, usage on previous stock lying there;
  rendered report + share text checked for any negative remaining
  value), (6) PATILA — 1 entry = 1 patila for every dish, Daal Chawal
  double, D-Plaza send-out patila, range patila sums, (7) SEND — Send
  to Other Branch deducts from the matching stocks (Daal Chawal from
  Tota, never Rice; Biryani from Rice; insufficient stock records with
  Remaining 0), Restaurant has no Send UI.
- A fake Firestore (in-memory collections + `onSnapshot` listener
  registry) is injected via `window.__DS_FB__` in jsdom beforeParse;
  the apps use a single `fb()` accessor that prefers it over the real
  SDK, so the whole two-device sync matrix runs offline.
- Icons: all densities present at the right sizes; 48px circular-mask
  montage checked visually.
- APKs are built by `build_apks.sh` (NOT run here — verification runs it):
  version 2.1 / versionCode 3, packages `com.bm.supplier` /
  `com.bm.restaurant` / `com.bm.kitchen`.

## Assumptions (flagged, not hidden)

- Admin identity is `admin@biryanimaster.com` (his common Biryani Master
  admin ID); Kitchen Supply's `admin@biryanimasterkitchen.com` is a
  different system and was deliberately not reused.
- The shared web `appId` baked into all three HTMLs is the `com.bm.kitchen`
  client's app ID from `google-services__15.json` (same project, same
  apiKey); the three Android packages are registered separately in the
  same project.
- Received for materials other than chicken comes only from Kitchen
  direct-received entries (the screenshots gave no other received
  figures). A per-device assignment change made by the Admin reaches the
  device on its next launch when online; while offline the device keeps
  its last known branch.
- Admin Auth sign-in is best-effort: if Email/Password Auth is not enabled,
  or the Auth password differs from the local Admin password, local login
  still works but admin-gated Firestore writes stay on-device only.
- Out-Stock rows take a free-text label (default "Staff Food"); the
  golden day's only send-out row is Staff Food — Chicken 1 kg.
- The new template is built fresh in this pack (`build_html.py`
  generates the three HTMLs from one shared core + per-app screens);
  the 12 screenshots were reference only for quantities/method and
  their layout was not copied.

## UNTESTED (only a real phone can prove — not claimed as passed)

Real-phone install, audible alert tone on a real phone, real Firebase sync
on the user's phone, real-phone launcher masking, Firebase Auth sign-in
flow end-to-end, WhatsApp image/PDF share sheet on a real phone
(CDN libraries load there; the sandbox has no remote loads, so the
offline fallback path is what the harness exercised). Sandbox note:
headless Chrome here fails all remote loads, so Firebase CDN scripts
never load in this environment — all verification ran the
offline/localStorage path.

## Website — "Biryani Master Supply Manager"

The website (`DS-Website.html`) is a responsive single-file website for
the same Firebase project (**bm-kitchen-hub**) and the same live `ds_*`
Firestore data as the three apps. Log in on the website and work from
there: the **Restaurant** places orders, the **Kitchen** accepts orders
and updates stock, the **Admin** controls everything — whoever logs in
picks their branch etc. exactly as in the apps. A website order appears
in the Kitchen app at once, and vice versa.

One website, three role sections — each section uses its OWN Firebase
web-app config (same project bm-kitchen-hub, WEB apiKey), selected when
that role logs in:
- Kitchen section: Kitchen web app (`...web:1605ce20c3e3e441e6a78b`)
- Restaurant section: Restaurant web app (`...web:0665989372f18578e6a78b`)
- Supply Manager section: Admin web app (`...web:2e6a032d900940c6e6a78b`)

The three configs live in ONE marked block at the top of the file
(`FIREBASE CONFIG — EDIT ONLY THIS BLOCK ...`); `pickRole()` switches
the live config to the picked role's entry before login. The website
title is "Biryani Master Supply Manager" and the intended domain is
**www.biryanimastersupplymanager.com** (shown in the footer only — never
hard-coded as the Firebase authDomain).

Login on the website: PIN hashes are NOT synced anywhere, so the first
web login is ID + REGISTERED mobile number (verified against the synced
assignment record) and then the user sets a 4-digit WEBSITE PIN (hashed,
in `ds_meta/webusers`); returning login is ID + website PIN. Admin logs
in with email + password (admin@biryanimaster.com), same as the Admin app.
This is the ONE documented difference from the apps, and it is spelled
out on the login card.

No Gradle plugin or Android Studio setup is needed for the website
either — it is a single HTML file; the Firebase config is baked into it.

### Deploy the website (the user's job — Firebase Hosting)

The hosting site is **bm-kitchen-hub-e0818**. From a terminal:

```
firebase login
firebase init
```

Put `DS-Website.html` in the `public/` folder, then deploy:

```
firebase deploy --only hosting:bm-kitchen-hub-e0818
```

`firebase.json` (included in this pack) already holds the site:

```json
{"hosting": {"public": "public", "site": "bm-kitchen-hub-e0818"}}
```

The custom domain **www.biryanimastersupplymanager.com** is connected to
this hosting site afterwards (Firebase console > Hosting > Add custom
domain) — also the user's job.
