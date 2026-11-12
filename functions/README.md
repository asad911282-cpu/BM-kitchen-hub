# Kitchen Daily Stock v2.1 — FCM Cloud Function (killed-app path)

When the Kitchen app is fully killed (swiped away, or after a reboot before
first open), the on-phone foreground service is not running, so nothing
polls Firestore. This Cloud Function watches `ds_orders` and pushes an FCM
notification to every Kitchen device token registered for that branch pair.

## What it does

- `notifyNewOrder` — on `ds_orders/{orderId}` created with `status === "Pending"`,
  sends a high-priority push: title `New order — <recipe>`, body
  `<branch> · <date> · Rice X kg + Y kg`, data `{orderId, branchPairId, type: "new-order"}`.
- `notifyOrderBecamePending` — defensive: on update where status *changed to*
  `Pending` (e.g. a re-opened order), sends the same push. Updates that were
  already Pending are ignored (the created trigger handled them).
- Tokens are read from Firestore collection `ds_tokens` where
  `pairId == order.branchPairId` (limit 100). One document per device:
  `{token, pairId, kitchenBranch, branchLabel, platform, updatedAt}` — the
  Kitchen app writes/refreshes its own token document on launch.

## Deploy (his console steps)

**Blaze (pay-as-you-go) plan is REQUIRED** — Cloud Functions with outbound
calls do not run on the free Spark plan.

```bash
cd functions
npm install
firebase login            # one time, in the browser
firebase use bm-kitchen-hub
firebase deploy --only functions
```

Check it deployed:

```bash
firebase functions:list
firebase functions:log --only notifyNewOrder
```

## FCM token / VAPID key (web token step)

The Kitchen app is a WebView app, so its FCM token comes from Firebase
Cloud Messaging for Web:

1. Firebase console → Project settings → Cloud Messaging → **Web Push
   certificates** → Generate key pair. That is the **VAPID key**.
2. The Kitchen app (JS builder) passes that VAPID key to
   `getToken(messaging, { vapidKey: "<key>" })` on launch and writes the
   token into `ds_tokens` with the branch's `pairId`.
3. If a token is ever rejected as invalid in the function logs, the app
   deletes the stale `ds_tokens` document and re-registers on next launch.

## Logs / troubleshooting

```bash
firebase functions:log --only notifyNewOrder
firebase functions:log --only notifyOrderBecamePending
```

- "no FCM tokens for pair …" → the Kitchen phone has not registered its
  token yet (open the Kitchen app once, on internet, and check `ds_tokens`
  in Firestore).
- "no branchPairId" → the order was written without `branchPairId`; the
  Restaurant app must include it (it does since v2.0).
- Failure counts with `registration-token-not-registered` → stale token;
  delete that `ds_tokens` document; the app re-registers on next launch.

## Local check (no Firebase needed)

```bash
node --check index.js
node test/functions.test.js   # mock test of buildPayload + sendToPair
```
