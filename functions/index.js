/**
 * Kitchen Daily Stock v2.1 — FCM push for the killed-app path.
 *
 * The native foreground service (OrderAlertService) covers the
 * backgrounded/minimised app. When the app is fully killed (swiped away,
 * or after a reboot before first open), nothing on the phone is polling —
 * so a Cloud Function watches ds_orders and pushes an FCM notification
 * to every Kitchen device token registered for that branch pair.
 *
 * Tokens live in Firestore collection `ds_tokens`, one document per device:
 *   { token: "<FCM registration token>", pairId: "<branch pair id>",
 *     kitchenBranch: "<kitchen branch id>", branchLabel: "<label>",
 *     platform: "android", updatedAt: "<ISO string>" }
 * The JS builder (Kitchen app) writes/refreshes its token document on
 * launch; the Admin app may also manage tokens. This function only reads.
 *
 * Deploy: see README.md in this directory. Blaze plan REQUIRED
 * (functions + FCM multicast are not on the free Spark plan for
 * outbound use like this).
 */
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

const MAX_TOKENS = 100;

/** Recipe id -> display label (mirrors the DS recipe list). */
function recipeLabel(recipeId) {
  switch (recipeId) {
    case "chicken_biryani": return "Chicken Biryani";
    case "chicken_pulao": return "Chicken Pulao";
    case "beef_pulao": return "Beef Pulao";
    case "mutton_pulao": return "Mutton Pulao";
    case "chana_pulao": return "Chana Pulao";
    case "zarda": return "Zarda";
    case "daal_chawal": return "Daal Chawal";
    default: return "Kitchen order";
  }
}

/** Build the push payload for one order document. Returns null if not Pending. */
function buildPayload(orderId, order) {
  if (!order || order.status !== "Pending") return null;
  const recipe = recipeLabel(order.recipe);
  const branch = order.branch || "Restaurant";
  const date = order.date || "";
  const qtyA = Number(order.qtyA) || 0;
  const qtyB = Number(order.qtyB) || 0;
  const body = branch + (date ? " · " + date : "")
    + " · Rice " + qtyA + " kg"
    + (qtyB > 0 ? " + " + qtyB + " kg" : "");
  return {
    notification: { title: "New order — " + recipe, body },
    data: {
      orderId: String(orderId),
      branchPairId: String(order.branchPairId || ""),
      type: "new-order",
    },
    android: { priority: "high" },
  };
}

/** Send the payload to every token registered for this branch pair. */
async function sendToPair(orderId, order, messaging, firestore) {
  const payload = buildPayload(orderId, order);
  if (!payload) {
    console.log("ds_orders/" + orderId + ": status is not Pending, no push sent");
    return { sent: 0, failed: 0, skipped: true };
  }
  const pairId = order.branchPairId;
  if (!pairId) {
    console.warn("ds_orders/" + orderId + ": no branchPairId, cannot find tokens");
    return { sent: 0, failed: 0, skipped: true };
  }
  const snap = await firestore
    .collection("ds_tokens")
    .where("pairId", "==", pairId)
    .limit(MAX_TOKENS)
    .get();
  const tokens = [];
  snap.forEach((doc) => {
    const t = doc.data() && doc.data().token;
    if (typeof t === "string" && t.length > 0) tokens.push(t);
  });
  if (tokens.length === 0) {
    console.log("ds_orders/" + orderId + ": no FCM tokens for pair " + pairId);
    return { sent: 0, failed: 0, skipped: true };
  }
  const res = await messaging.sendEachForMulticast({
    tokens,
    notification: payload.notification,
    data: payload.data,
    android: payload.android,
  });
  console.log(
    "ds_orders/" + orderId + ": FCM multicast to " + tokens.length
    + " token(s) for pair " + pairId
    + " — success " + res.successCount + ", failure " + res.failureCount
  );
  res.responses.forEach((r, i) => {
    if (!r.success) {
      console.warn("FCM token failed (" + tokens[i].slice(0, 12) + "...): "
        + (r.error && r.error.message ? r.error.message : "unknown error"));
    }
  });
  return { sent: res.successCount, failed: res.failureCount, skipped: false };
}

// Exported for unit testing (test/functions.test.js requires this file).
module.exports = { buildPayload, sendToPair, recipeLabel };

exports.notifyNewOrder = onDocumentCreated("ds_orders/{orderId}", async (event) => {
  const snap = event.data;
  if (!snap) return;
  const order = snap.data();
  await sendToPair(event.params.orderId, order, admin.messaging(), db);
});

exports.notifyOrderBecamePending = onDocumentUpdated("ds_orders/{orderId}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (before && before.status === "Pending") return; // already Pending: created trigger handled it
  if (!after || after.status !== "Pending") return;
  await sendToPair(event.params.orderId, after, admin.messaging(), db);
});
