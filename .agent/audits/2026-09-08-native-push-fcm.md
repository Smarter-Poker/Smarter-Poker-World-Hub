# 2026-09-08 - Native push for the Club Arena app rides the existing outbox

The Capacitor app cannot use Web Push (no push service behind the webview, no
root service worker). It registers an APNs/FCM device token instead, and
Firebase delivers to both platforms.

The audit proposed reviving `user_devices` with its own sender. Rejected: a
second table means a second sender, a second retirement rule and a second
receipt path beside `push_subscriptions`. Instead (Club Arena migration
`20260908003626_push_subscriptions_carry_a_transport_so_a_native_device_toke`,
applied to production) a native token is a `push_subscriptions` row with
`transport = 'fcm'`, the token in `endpoint`, no VAPID keys (a CHECK keeps
them required for `webpush` rows). `notifications -> mirror trigger ->
push_outbox -> dispatch cron`, `deliverPushNow`, failure counting, retirement,
receipts and the one-account-per-device rule all run unchanged.

- `src/lib/push/fcm.js`: FCM HTTP v1 sender, no new dependency. The OAuth2
  token is minted from `FCM_SERVICE_ACCOUNT_JSON` with Node crypto (RS256
  JWT) and cached. Same result shape as `sendWebPush`; UNREGISTERED / 404 /
  invalid token -> `expired: true` so the row is retired. The message carries
  title/body/image, the tap url and tag in `data` (strings), Android channel
  `club_arena`, APNs sound/thread/collapse id.
- `src/lib/push/send-push.js`: `sendPush(row)` picks the sender by
  `row.transport`; `SUBSCRIPTION_COLUMNS` selects it. `push-deliver.js` and
  `pages/api/cron/push-dispatch.js` call it instead of `sendWebPush`.
- `pages/api/push/subscribe.js`: accepts `{ transport: 'fcm', endpoint:
  <token>, platform }` with no keys; the host allowlist applies to Web Push
  only (a token is never dialled); a token changing accounts on the same
  phone is the takeover, allowed.

Pinned by `__tests__/native-push-fcm.test.mjs` (build safety gate): message
shape, dead-token classification, a mocked Firebase round trip (token cached,
404 retires), the JWT verifies against the account key, both delivery paths
use the one sender, the subscribe route's token branch.

Dan's: a Firebase project, the APNs .p8 key uploaded to it, and the service
account JSON in Vercel as `FCM_SERVICE_ACCOUNT_JSON`. The app side (token
capture, tap routing, badge, receipt) is Club Arena phase 4b.
