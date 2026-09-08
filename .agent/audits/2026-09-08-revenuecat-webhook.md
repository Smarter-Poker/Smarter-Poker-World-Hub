# 2026-09-08 - RevenueCat webhook: store billing for the Club Arena app

Apple 3.1.1 and Play's Payments policy require diamonds and VIP sold INSIDE the
iOS/Android app to go through StoreKit / Play Billing. RevenueCat fronts both
stores and POSTs one event per store transaction to
`POST /api/store/webhooks/revenuecat` (`pages/api/store/webhooks/revenuecat.js`,
logic in `src/lib/store/revenuecatWebhook.js`).

The route authenticates the `Authorization` header against
`REVENUECAT_WEBHOOK_AUTH` (constant-time; unset refuses with 503), shapes the
event to strings, and calls `public.fn_iap_settle_event(p_event)` with the
service role. Every money decision is in that function (Club Arena migration
`20260908000009_in_app_purchases_settle_through_the_same_idempotent_diamond_`,
applied to production 2026-09-08): a diamond purchase settles through
`settle_diamond_card_purchase_atomic` keyed `iap:<transaction>` - the SAME
idempotent path a Stripe purchase takes - and VIP applies the SAME tier/expiry
rules `stripe.js` applies. Idempotent on the event id; a new event id for the
same transaction settles as a duplicate. Probed in a rolled-back transaction on
production: +100 once, replay 0, retry-with-new-id 0, unknown product refused,
lifetime VIP never downgraded.

HTTP contract, pinned by `__tests__/revenuecat-webhook.test.mjs` (build safety
gate): 405 on GET, 503 unconfigured, 401 wrong secret, 400 malformed, 200 on
success and on terminal answers (`unknown_user`, `unknown_product` - a retry
cannot change them), 500 otherwise so RevenueCat retries.

Found while reading the Stripe path: `stripe.js` calls
`reconcile_diamond_purchase_refund`, which does not exist in the database. Not
changed here; recorded so the next reader of the refund path knows.

Dan's, to make it live: create the RevenueCat project, set the webhook URL to
`https://smarter.poker/api/store/webhooks/revenuecat` with an Authorization
value, and put that value in Vercel as `REVENUECAT_WEBHOOK_AUTH`.
