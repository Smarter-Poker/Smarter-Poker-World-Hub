# The marketplace repairs (2026-09-23)

A line by line audit of the One Marketplace surface, after the Club Arena hand
off shipped, and the fixes it produced. Twenty nine changes across the
storefront page, the Club Shop operator tools, the cart, the item page and the
commerce API routes.

## The three that locked a member out

**A negative Diamond wallet is a supported state, and three surfaces treated it
as corruption.** A card refund claws back Diamonds that were already spent and
leaves an enforceable debt that future earnings repay: the migration that
introduced it says so, `canCreditDiamondWallet` permits it, and
`pages/hub/club-shop/[itemId].js` even has the right copy for it ("Card Checkout
Is Paused Until Your Diamond Wallet Returns To Zero Or Above"). But
`cart.js` threw "Your Diamond Balance Could Not Be Verified" and replaced the
whole cart with an error panel whose only action repeated the same request, so
that member could not remove an item or pay by card;
`clubCardCheckout.mjs` returned null for the balance and made the item page
reject its entire catalog, which is what made that correct copy dead code; and
`marketplace-purchase.js` returned 503 on the recovery read that runs *after*
the charge has committed, so a debt carrying member's completed, delivered
purchase could never be confirmed and its durable request was never retired.

All three now report the figure. Every guard that refuses to fund a purchase
from a negative wallet is untouched, and the balance must still be a safe
integer.

**A refused purchase said "confirm again" forever.** The server sends precise
copy for ten business refusals: sold out, an unused copy is already owned, the
purchase limit is reached, the price moved. The item page discarded all of it
and answered every refusal with "Purchase Status Is Uncertain. Confirm Again To
Verify The Original Purchase." A member clicking Buy on a sold out item was
told to click Buy again. `clubPurchaseRefusalNotice` now shows the server's own
reason, but only when the response is bound to this exact account and request
and is a definitive pre-debit outcome. Throttling, timeouts, unbound bodies and
every 5xx keep the uncertain wording, because none of them proves the charge
did not commit.

**A cart could be locked for 48 hours with no way out.** A durable checkout
request is bound to the exact cart terms that started it. Change the cart
before that attempt resolves and every further checkout threw
`COMMERCE_INTENT_UNRESOLVED`, with the only escape being to rebuild the cart
byte for byte, which no message said. The cart now names the held attempt,
lists the items and quantities it was for, and offers to restore exactly those
terms and continue it.

There is deliberately **no discard button**. The durable request identifier is
the Stripe idempotency key: `create-checkout-session.js` passes it as
`idempotencyKey` and reuses the open session already carrying it in
`metadata.checkout_request_id`. That is what guarantees one payable session per
attempt. Retiring it from the browser while that session is still payable would
mint a second payable session for the same purchase, and a shopper who later
returned to the first tab would pay twice. Nothing reachable from the cart can
resolve an attempt by request id alone, since `/api/store/checkout-status`
answers by session id only. So the exit offered is the one that cannot double
charge. The sanctioned retires are unchanged: a server stated expiry still
replaces the key, and a settled attempt is still retired against a verified
receipt.

## The hand off, repaired

The legacy `?tab=` redirect dropped the entire query string, so
`/hub/diamond-store?tab=club-shop&clubId=<uuid>&view=manage` landed on a bare
`/hub/club-shop` and resolved a **different club**. Everything but `tab` now
travels with the redirect.

The store's tab rail dropped the club too, so a player handed over from Club
Arena who tapped Diamonds and tapped back to Club Shop silently arrived in
someone else's shop. The club now rides every link in the rail.

The four sibling routes (`club-shop`, `vip-membership`, `merch-store`,
`smarter-rewards`) rendered the store without re-exporting its
`getServerSideProps`, so they were statically optimized: they first painted the
hardcoded fallback price table instead of the database's, and lost the
deliberate `private, no-store` header. `/hub/club-shop` is exactly where the
hand off lands.

And the sub-view is now written back to the address, so `?view=` describes the
page the shopper is actually looking at, including after a Stripe return.

## The operator tools

The Edit control was offered on every row, but the editor always sends
`category` and the server refuses any category outside Time Banks and
Throwables. An operator with a legacy Table Skins or Emotes row could open the
form, change a price, and the save could never succeed. Those rows now read as
what they are.

The canonical All Throwables Pack offered "Uses Delivered" and "Max Per Member",
both of which the server refuses to change; the whole update was lost with a
message that named no field. Those two fields are no longer offered on that row.

Buyer names were passed through `marketplaceCopy`, which Title Cases and
rewrites them, so `ALLIN_ACE` read as "Allin Ace" and two different members
could render identically in a ledger an operator refunds from. Member names are
now rendered raw; item names still go through the copy layer.

Delete's refusal reason lived in a `title` attribute on a disabled button,
which no phone and no screen reader can reach, and that made the "Hide It
Instead" guidance dead code. The control is reachable, so the guard explains
itself. A refund now refreshes the lifetime totals (the report's own loading
guard was dropping that refresh). A ledger search no longer follows the
operator into a different club. A demoted operator is returned to the
storefront instead of reading an empty panel.

## The API routes

A committed, charged, delivered purchase was turned into a 500 "Purchase
failed" when an operator renamed the item mid purchase, because the receipt was
verified against a name read before the RPC. It is now verified against what
the RPC itself reported; price, purchase identity and item type stay strictly
verified.

A replayed Diamond refund was audited as `chips` against an undefined buyer,
because the `already_refunded` early return carries no currency. Only what the
RPC actually reported is recorded.

`order-ledger` fell back to the anon key when the service key was missing.
Under RLS that reads nothing, so the route answered `success: true` with an
empty ledger and a shopper with orders was told they had none. It throws now,
like every other commerce route.

`fulfillment-operations` cursored on `created_at` alone, so two orders sharing a
timestamp across a page boundary were both skipped. It now carries the id
tiebreaker `order-ledger` already had.

`manage-shop`'s POST did not validate its ids as UUIDs the way its GET does and
discarded two read errors, so a malformed id read as "Admin access required"
and a transient database failure read as "Item not found".
`checkout-status` could return a type its own contract does not list, which
made the client reject the whole response and dead-end the return page. Both
`OFFER_CONFIRMATION_REQUIRED` and `OFFER_CONFIRMATION_MISMATCH` are now
definitive refusals: they are account-and-request-bound 400s returned before any
settlement path, which is the strongest available proof that nothing was
charged.

A checkout that refuses to open is an error, not a silent no-op: three call
sites discarded `leaveForCheckout`'s null and left the shopper with a redirect
toast, a re-enabled Buy button, no redirect, and the durable request still
claimed.

## Weight and reach

The three operator panels, about 60 KB of source only an owner or admin can
ever reach, were statically imported into the bundle every shopper downloads on
five routes. They are code-split now. The delete guard ran twice per row per
render and the analytics peak was recomputed on every unrelated render; both
are memoized. Two intended edge caches (`merch-catalog`, `readiness`) were
being overridden by the blanket `/api/(.*)` no-store rule and now work, with
the strict catalog probe deliberately left uncached.

On accessibility: the toast live region no longer unmounts between toasts, so
success and warning announcements are reliable; the item editor is a real form
that takes focus on open and returns it on close; the ledger disclosure reports
its state; and the "Refund Unavailable" explanation is visible text rather than
a `title` on a span.

## Verification

`__tests__/club-shop-operator-repairs.test.mjs` (43) and
`__tests__/diamond-store-phase-25.test.mjs` (20) are new, both wired into
`test:marketplace`. The suite is 600 tests across 55 files, plus the 69 test
pretest gate. Six existing suites asserted the exact defects removed here and
were repointed, each with a comment saying what changed.
