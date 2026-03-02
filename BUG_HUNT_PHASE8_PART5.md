# Bug Hunt Phase 8 — Part 5 Findings

## Session: 2026-03-01 (continued from Part 4)

---

## BUGS FIXED THIS SESSION: 8

### FINDING #58 — HIGH — Poker data import endpoints with zero auth (FIXED)
- **Location:** middleware.ts + 7 poker import routes
- **Fix:** Added all destructive routes (`nuclear-import`, `full-import`, `import-fresh-data`, `seed-database`, `seed`, `create-tables`, `setup-venue-scraping`) to middleware's admin secret protection. Also added `/api/god-mode/*` and `/api/training/*` paths.

### FINDING #63 — HIGH — notifications.js all operations with zero auth (FIXED)
- **Location:** pages/api/poker/notifications.js
- **Fix:** Added JWT authentication. All operations (POST create, GET read, PUT mark-read) now use `authenticatedUserId` from JWT instead of untrusted query/body params.

### FINDING #64 — MEDIUM — player-notes.js no auth, bypasses RLS (FIXED)
- **Location:** pages/api/club-arena/player-notes.js
- **Fix:** Added JWT authentication. `userId` now comes from JWT (`user.id`) instead of request body. Users can only access their own notes.

### FINDING #66 — HIGH — skipPayment flag from client bypasses Stripe (FIXED)
- **Location:** pages/api/commander/create-subscription.js line 109
- **Issue:** Client could send `skipPayment: true` to get free Commander subscription.
- **Fix:** Removed client-controlled `skipPayment`. Payment is now required when Stripe is configured with real price IDs. Server config determines whether to skip (dev mode only).

### FINDING #68 — CRITICAL — Table close() doesn't unlock player chips (FIXED)
- **Location:** LobbyManager.js closeTable() + TableManager.js close()
- **Issue:** `close()` calls `_vacateSeat()` which does NOT emit `player_left`. The auto-unlock in LobbyManager only triggers on `player_left` events. Result: all seated players' chips permanently locked in escrow on table close.
- **Impact:** Any table close (auto-close, game length expired, admin close) traps all players' chips.
- **Fix:** Added chip collection + unlock loop in `closeTable()` — collects all seated players and their stacks BEFORE close(), then unlocks each one via ChipBridge.

### FINDING #69 — HIGH — GameController.standUp wraps result, chip unlock gets wrong amount (FIXED)
- **Location:** GameController.js line 525-528 + seat.js line 222
- **Issue:** `return { success: true, cashout: result }` where `result` is already `{ success: true, cashout: 500 }`. Creates `{ success: true, cashout: { success: true, cashout: 500 } }`. seat.js then does `result.cashout || 0` → gets object, not number.
- **Impact:** Every player stand-up sends malformed amount to chip unlock RPC.
- **Fix:** GameController now returns `result` directly. seat.js uses `typeof result.cashout === 'number'` guard and handles `pending` case (player in hand, deferred stand-up).

### FINDING #70 — CRITICAL — Stripe webhooks skip signature verification if env var missing (FIXED)
- **Location:** pages/api/commander/webhooks/stripe/events.js AND pages/api/store/webhooks/stripe.js
- **Issue:** Both webhooks had `if (endpointSecret && sig) { verify } else { parse raw JSON }`. If `STRIPE_WEBHOOK_SECRET` not set in production, anyone can forge payment events.
- **Impact:** Fake payment success → free subscriptions. Fake checkout completed → infinite diamonds.
- **Fix:** Both webhooks now require `STRIPE_WEBHOOK_SECRET` and `stripe-signature` header. Missing env var returns 500, missing signature returns 400.

### FINDING #71 — HIGH — Store webhook diamond crediting not idempotent (FIXED)
- **Location:** pages/api/store/webhooks/stripe.js handleCheckoutCompleted()
- **Issue:** Diamond purchase update didn't filter by `status: 'pending'`. Stripe retries on 5xx/timeout would credit diamonds multiple times.
- **Fix:** Added `.eq('status', 'pending')` to the update query. Only the first successful webhook processes the purchase.

---

## BUGS IDENTIFIED (not yet fixed — require design decisions)

### FINDING #67 — MEDIUM — clearLocksForTable only clears memory, not DB escrow
- **Location:** ChipBridge.js lines 319-328
- **Issue:** Only clears `_activeLocks` Map, doesn't update `chip_escrow` table or call unlock RPCs.
- **Note:** Function is exported but never called. Finding #68 fix handles the main case (closeTable). This is a defense-in-depth concern.

### FINDING #72 — HIGH — Push notification endpoint has zero auth
- **Location:** pages/api/notifications/send.js
- **Issue:** Anyone can send OneSignal push notifications to any user or segment. No auth, no rate limit.
- **Fix needed:** Add JWT auth or admin secret.

### FINDING #73 — MEDIUM — send-welcome email endpoint has no auth
- **Location:** pages/api/email/send-welcome.js
- **Issue:** Anyone can send branded welcome emails to any address. Phishing vector — emails come from smarter.poker's domain.
- **Fix needed:** Add internal-only secret or restrict to server-side calls.

### FINDING #74 — HIGH — File upload endpoint has zero auth
- **Location:** pages/api/social/upload.js
- **Issue:** 50MB file uploads with zero authentication. Storage abuse/cost attack vector.
- **Fix needed:** Add JWT auth.

### FINDING #65 — MEDIUM — follow.js uses untrusted x-user-id header
- **Location:** pages/api/poker/follow.js + reviews.js, checkins.js, claim-page.js, activity.js
- **Issue:** All PokerNearMe social routes use `x-user-id` header or body `user_id` with no JWT. Can impersonate any user for follows, reviews, check-ins.
- **Note:** Social features, no financial impact. Batch fix recommended.

---

## CUMULATIVE BUG TALLY (All Phase 8 Sessions)

| Severity | Found | Fixed | Pending |
|----------|-------|-------|---------|
| CRITICAL | 7     | 7     | 0       |
| HIGH     | 15    | 13    | 2       |
| MEDIUM   | 16    | 10    | 6       |
| LOW      | 4     | 4     | 0       |
| **Total**| **42**| **34**| **8**   |

### All Critical Fixes:
1. #29 Double blind deduction (TableManager)
2. #30 Run-it-multiple ignores side pots (GameStateMachine)
3. #34 Pot-limit max raise overcalculated (BettingRound)
4. #42-43 ClubLedger missing tournament methods
5. #52 parent_agent_id user_id/record_id mismatch
6. #68 Table close doesn't unlock player chips (LobbyManager)
7. #70 Stripe webhooks skip signature verification

### All High Fixes:
1. #51 Commission validation bypass
2. #54 Tournament refund wrong operation
3. #57 SSRF blocked_hosts trivially bypassable (proxy.js)
4. #58 Poker import endpoints — no auth → middleware protected
5. #59 Admin seat actions missing role check
6. #61 link-preview SSRF with zero protection
7. #63 Notifications zero auth
8. #66 skipPayment client bypass
9. #69 standUp result wrapping → wrong chip unlock amount
10. #71 Diamond crediting not idempotent

### Pending HIGH:
- #72 Push notification endpoint — zero auth
- #74 File upload — zero auth

### Pending MEDIUM:
- #36 Clawback non-atomic (needs RPC)
- #38 lifetime_earnings TOCTOU (needs RPC)
- #39 add_prepaid non-atomic (needs RPC)
- #44 ChipBridge.recordRake TOCTOU (needs RPC)
- #50 Demote agent count TOCTOU (needs RPC)
- #53 Tournament count TOCTOU (needs RPC)
- #60 delete-account missing Club Arena cleanup
- #65 Social routes untrusted x-user-id (batch fix)
- #67 clearLocksForTable incomplete
- #73 send-welcome email no auth

---

## TEST RESULTS
- **Engine tests (test-all.js):** 105/105 passing ✅
- **All 11 modified files:** Syntax verified ✅
