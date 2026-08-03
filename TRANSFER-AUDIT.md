# TRANSFER-AUDIT.md — SEND / RECEIVE diamond flow

**Scope:** `pages/api/store/diamond-transfer.js` (714 lines) and every SQL object it
depends on. Audited 2026-08-03. Companion test:
`src/lib/rewards/__tests__/transferMath.test.mjs` — run with
`node --test src/lib/rewards/__tests__/transferMath.test.mjs` (63 tests, all pass, no DB, no network).

**Economy anchor:** 1 diamond = $0.01 (`src/config/diamondRewards.js`).

---

## 0. The moving parts

| Layer | Object | Where |
|---|---|---|
| Route | `handler()` | `pages/api/store/diamond-transfer.js:198-714` |
| Debit RPC | `deduct_diamonds(uuid,int,text,text,text,jsonb,text,int)` | `supabase/migrations/20260505210000_strict_serialized_cooldown_deduct_diamonds.sql:21-111` |
| Credit RPC | `add_diamonds_to_balance(uuid,int,text,text,text)` | `supabase/migrations/20260501120000_multiplier_aware_diamond_awards.sql:14-123` |
| Cap trigger fn | `fn_enforce_anti_farming_caps()` BEFORE INSERT on `diamond_transactions` | `supabase/migrations/20260512143000_streaming_trigger_null_safe_channel_guard.sql:1-51` |
| Cap policy fn | `fn_check_anti_farming_gift_cap(uuid,uuid,int)` | `supabase/migrations/20260517000001_harmonize_anti_farming_age_thresholds.sql:51-321` |
| Wallet UI | `TX_TYPES` | `src/components/store/DiamondWalletModal.jsx:68-120` |

The route holds the service-role key (`diamond-transfer.js:36-45`); both RPCs are
`SECURITY DEFINER`, and after `20260726120000_diamond_rewards_v2_security_and_caps.sql:95-127`
lands they are executable by `service_role` only.

---

## 1. Is the sender debited and the recipient credited EXACTLY the same amount?

**No. There is a live diamond-minting path.**

The debit is `-amount` verbatim (`20260505210000...sql:97-107`). The credit goes through
`add_diamonds_to_balance`, which **multiplies any positive credit by
`profiles.diamond_multiplier`** unless the type is on an exemption list:

```
20260501120000_multiplier_aware_diamond_awards.sql:62-69
IF v_raw_amount > 0
   AND p_type NOT IN ('purchase','deduction','adjustment','refund','transfer')
   AND v_multiplier > 1.00
THEN v_actual_amount := ROUND(v_raw_amount * v_multiplier);
```

The route credits with `p_type: 'diamond_gift_received'` (`diamond-transfer.js:632`) —
**not on the exemption list**. `diamond_multiplier` is a real, populated column that reaches
`2.00` through share streaks
(`20260506112000_fix_share_streak_cst_anchor.sql:68-72`: 3d→1.20, 7d→1.50, 14d→1.75, 30d→2.00;
ceiling confirmed at `src/config/diamondRewards.js:69-70`).

**Result:** sender is debited 100, a recipient on a 30-day share streak is credited 200.
100 diamonds ($1.00) are created from nothing, per transfer. At the 2,000-diamond burst
ceiling that is $20 minted per minute per sender/recipient pair.

The same defect applies to the **rollback refund** (`diamond-transfer.js:620`,
`p_type: 'diamond_gift_refund'` — also not exempt): a sender with a 2× multiplier whose
transfer fails is refunded 200 for a 100 debit and ends the failed transfer **richer**.

Covered by tests: `CRITICAL DEFECT: recipient diamond_multiplier MINTS diamonds on every gift`,
`CRITICAL DEFECT: every multiplier tier inflates the credit`,
`CRITICAL DEFECT: the ROLLBACK refund is multiplied too`.

**Fix:** add `'diamond_gift_received'`, `'diamond_gift_refund'` (and `'live_gift_received'`)
to the `NOT IN (...)` list at `20260501120000...sql:63`. Multipliers are meant to boost
*earned* rewards, not peer-to-peer movement.

### 1b. If the credit fails after the debit — is there a refund?

Yes, mostly. `refundSender` is declared at **function** scope (`diamond-transfer.js:202`,
with a correct comment explaining why) and assigned only after the debit commits
(`:615-627`). Two invocation sites:

* `:638-643` — credit returned an error, or `success === false` and not `duplicate`
  → refund, then HTTP 500 `"your diamonds have been restored"`.
* `:707-709` — the outer `catch` refunds on any uncaught throw.

Three problems:

1. **The refund's return value is discarded** (`:617-623`). `add_diamonds_to_balance`
   signals failure by *returning* `{success:false}` (e.g. `'Profile not found'`,
   `20260501120000...sql:57`), it does not throw. Only a thrown rejection is caught. A
   returned failure is invisible: the sender stays debited while the response says the
   diamonds were restored, and nothing is logged.
2. **`refundSender` is never reset to `null` after a successful transfer.** Any throw in
   `:649-704` — the `anti_farming_ips` insert at `:650-655` is **not** wrapped in try/catch,
   unlike the notification block at `:659-692` — lands in the catch at `:706` and refunds a
   sender whose recipient **was already credited**. That is a second, independent mint path.
3. `duplicate` is treated as success with no refund (`:638`, `:645-647`). See §5.

Covered by: `refund on failed credit (handler :613-643)` suite (4 tests).

---

## 2. Ledger rows and the wallet UI

| Side | RPC arg | `transaction_type` written | Sign | `TX_TYPES` entry |
|---|---|---|---|---|
| Sender | `p_transaction_type: 'diamond_gift_sent'` (`:544`) | `diamond_gift_sent` | negative (`-p_amount`, `20260505210000...sql:107`) | ✅ `DiamondWalletModal.jsx:109` "Gift Sent" |
| Recipient | `p_type: 'diamond_gift_received'` (`:632`) | `diamond_gift_received` | positive (`20260501120000...sql:89`) | ✅ `DiamondWalletModal.jsx:110` "Gift Received" |
| Refund | `p_type: 'diamond_gift_refund'` (`:620`) | `diamond_gift_refund` | positive | ✅ `DiamondWalletModal.jsx:112` "Gift Refunded" |

**All three render correctly — none fall through to the grey `adjustment` fallback at
`DiamondWalletModal.jsx:232`.** All three are also in `EARNED_TYPES`
(`DiamondWalletModal.jsx:139`) so they show under the "Earned" filter.

Both RPCs write the value into **both** `transaction_type` and the legacy `type` column
(`20260505210000...sql:105-107`, `20260501120000...sql:86-89`), so no reader sees a NULL.

Note: `DiamondWalletModal.jsx:114` also declares `diamond_received` ("Diamonds Received")
with a comment claiming `diamond-transfer.js` writes it. **It does not** — the route only ever
writes `diamond_gift_received`. `diamond_received` is the *notification* `type`
(`diamond-transfer.js:677`), not a ledger type. Harmless (a spare TX_TYPES key), but the
comment is wrong and will mislead the next reader.

Covered by: `ledger rows render in the wallet UI` suite.

---

## 3. Caps — who is measured, and is it before the debit?

### JS-layer gates, in execution order (all strictly before the debit at `:539`)

| # | Gate | Line | Measured on | Skipped by |
|---|---|---|---|---|
| 1 | Method + rate limit 20/min (`LIMITS.financial`) | `:204-209` | request | — |
| 2 | Auth + email verified | `:212-220` | sender | — |
| 3 | Amount ≥ 10, integer | `:232-240` | — | — |
| 4 | Recipient is a UUID | `:235-237` | — | — |
| 5 | Self-transfer | `:243-245` | — | — |
| 6 | Accepted friendship | `:248-258` | pair | — |
| 7 | Both profiles exist | `:269-279` | both | — |
| 8 | New-user block < 30d | `:325-338` | **sender** | `isKingfish`, `hasPaid` |
| 9 | Fresh-paid 500/24h | `:340-364` | **sender** | `isKingfish` |
| 10 | Recipient ≥ 7 days old | `:367-369` | **recipient** | `isKingfish` |
| 11 | Per-transfer 100 / 500 | `:372-379` | — | `isKingfish`, `isFullyUnrestricted` |
| 12 | Balance | `:382-384` | sender | — |
| 13 | 60s global cooldown | `:386-399` | **sender** | `isKingfish`, `isFullyUnrestricted` |
| 14 | Source-tier 100 / 500 per 30d (max of account **and IP** totals, `:421`) | `:404-448` | **sender + IP** | `isKingfish`, `isFullyUnrestricted`, `isGraduated` |
| 15 | Per-recipient 200 / 30d | `:475-489` | **sender→recipient pair** | `isKingfish`, `isFullyUnrestricted` |
| 16 | Per-recipient 5-min cooldown | `:491-508` | pair | `isKingfish`, `isFullyUnrestricted` |
| 17 | **Inbound 1,000 / 30d** | `:510-527` | **RECIPIENT** | `isKingfish` only |

Gate 17 is the only recipient-side money cap, and correctly ignores `isFullyUnrestricted` —
it protects the receiver, not the sender.

### DB-layer caps — the 5,000 / 50,000 / 2,000 you asked about

These do **not** exist in the JS at all. They live in
`fn_check_anti_farming_gift_cap` (`20260517000001...sql:78-80`) and are invoked by the
BEFORE INSERT trigger `fn_enforce_anti_farming_caps` on `diamond_transactions`
(`20260512143000...sql:12-47`), which fires on the sender's **negative** row — i.e. the row
`deduct_diamonds` inserts at `20260505210000...sql:104-107`.

* **Per-pair 5,000/24h** — `20260517000001...sql:249-271`. `WHERE user_id = p_sender_id AND amount < 0 AND metadata->>'recipient_id' = p_recipient_id`. **Sender-side.** Works because the route passes `p_metadata: { recipient_id: recipientId }` at `:545`.
* **Per-user 50,000/24h** — `...sql:273-294`. **Sender-side.**
* **Burst 2,000/60s** — `...sql:296-317`. **Sender-side.**
* **Min account age 30 days** — `...sql:200-212`, mirroring the JS gate 8.

**Timing:** the trigger runs on the INSERT, which is *after* the `UPDATE profiles ... diamonds - p_amount`
at `20260505210000...sql:97-101`. But both statements are inside one plpgsql function =
one transaction, and the trigger `RAISE EXCEPTION`s (`20260512143000...sql:45-46`), so the
UPDATE is rolled back atomically. The route receives `deductErr.code = '23514'` with the
policy JSON in `details` and maps it to a 429 at `:556-593`. **No debit ever commits when a
cap fires.** Correct — but note it is correct by transaction semantics, not by ordering.

**Nothing checks caps against the recipient except gate 17.** A single popular account can be
farmed by N senders in parallel; only the 1,000/30d inbound cap bounds it.

### Interaction worth knowing

The 2,000/60s burst cap makes the 5,000/24h pair cap **unreachable in a single transfer** —
any amount > 2,000 dies on `burst_cap` first (caps are evaluated pair → user → burst,
`...sql:257/280/303`, but the burst window is the tightest). Combined with the 60s in-lock
cooldown passed at `:547`, a sender's ceiling is 2,000 diamonds per minute.
Covered by: `the 2,000/60s burst cap makes the 5,000 pair cap unreachable in one transfer`.

### The bypass ladder is very wide

`fn_check_anti_farming_gift_cap` returns `allowed:true` and **short-circuits all three hard
caps** for:
* any sender whose first completed purchase is ≥ 7 days old (`...sql:182-189`), and
* any unflagged account ≥ 120 days old (`...sql:191-197`).

The JS mirrors this as `isFullyUnrestricted` (`:318-320`), which skips JS gates 11, 13, 14,
15 and 16. So a $1.99 diamond purchase plus a 7-day wait buys **unlimited** outbound
transfer volume, bounded only by the recipient's 1,000/30d inbound cap and by the
60s in-lock cooldown in `deduct_diamonds`. Whether that is intended policy ("unlimited
gifting for paid users", `:324`) or an accident, it is the single largest surface here.
Covered by: `DEFECT: a 7-day-post-purchase sender skips 6 of the JS gates in one step`.

---

## 4. Rejection of bad inputs — all before any money moves

| Case | Result | Line |
|---|---|---|
| Self-transfer | 400 before any query | `:243-245` |
| Nonexistent recipient | 404 — `.in('id',[...])` returns one row, `recipientProfile` undefined | `:269-279` |
| Zero / negative | 400 `Minimum transfer is 10` (`amount < MIN_TRANSFER`) | `:238-240` |
| Fractional | `parseInt` truncates → `10.99` becomes `10`; the ledger can never hold a fraction | `:233` |
| Non-numeric | `isNaN` → 400 | `:238` |
| Exceeds balance | 400 in JS, then re-checked under `FOR UPDATE` in SQL | `:382-384`, `20260505210000...sql:69-75` |

Two input-handling wrinkles, neither of which moves money:

* **`parseInt` mangles exponent notation.** `parseInt('1e3',10) === 1`. A client sending
  `1e3` meaning 1,000 gets a 400 (1 < 10). `'50abc'` is accepted as 50. Prefer
  `Number.isInteger(Number(rawAmount))`.
* **The self-transfer check is a case-SENSITIVE string compare** (`:243`) while `UUID_RE`
  carries the `/i` flag (`:62`). An upper-cased copy of your own UUID passes `:243`.
  It is *not* exploitable today: it still needs an `accepted` friendship row where
  `user_id = friend_id` (`:248-253`), and the DB backstop compares real `uuid` values and
  returns `self_transfer` (`20260517000001...sql:97-106`). Fix anyway:
  `userId.toLowerCase() === recipientId.toLowerCase()`.
  Covered by: `DEFECT: self-transfer check is a case-SENSITIVE string compare`.

---

## 5. Double-submit: can two concurrent identical requests both succeed?

**No — but only because of one line, and it is not the line the code comments claim.**

`:530` generates `transferId = randomUUID()` **per request**, so two submits of the same
click carry different `reference_id`s (`transfer_deduct_<uuid>` / `transfer_<uuid>`). The
idempotency guards in both RPCs (`20260505210000...sql:42-57`,
`20260501120000...sql:35-46`) key on `reference_id` and therefore **can never match across
two requests**. The comment at `:529` ("generated up front to ensure idempotency across both
RPCs") is true only *within* one request. There is no client-supplied idempotency key.

What actually stops the double-spend is the cooldown check **inside** the `FOR UPDATE` lock:

```
20260505210000_strict_serialized_cooldown_deduct_diamonds.sql:81-94
IF p_cooldown_seconds > 0 THEN
  IF EXISTS (SELECT 1 FROM diamond_transactions
              WHERE user_id = p_user_id
                AND transaction_type = v_effective_type
                AND created_at >= now() - make_interval(secs => p_cooldown_seconds))
```

The route passes `p_cooldown_seconds: COOLDOWN_SECONDS` (60) **unconditionally** at `:547`.
Request B blocks on the row lock, and once it acquires it (READ COMMITTED → fresh snapshot)
it sees A's committed `diamond_gift_sent` row and returns
`{success:false, error:'Please wait before sending again'}`. Money moves exactly once.
Covered by: `two concurrent identical requests: only the first debits`.

Consequences of relying on that:

1. **A `p_cooldown_seconds: 0` regression would immediately re-open the double-spend.**
   There is no second line of defence. Covered by:
   `DEFECT: the cooldown is the ONLY double-submit defence — reference_id is fresh per request`.
2. **The loser gets HTTP 400 "Insufficient diamond balance"-shaped handling.** `:607-609`
   returns `res.status(400)` with `deductResult.error` — so the user sees "Please wait before
   sending again" with a **400**, not a 429, and the wallet's `parseRateLimitError`
   (`DiamondWalletModal.jsx:171-188`) finds no digit in the string and shows no countdown.
3. **The unconditional 60s RPC cooldown contradicts the JS gate at `:397`**, which lets
   `isFullyUnrestricted` senders skip the cooldown. Those senders pass the JS check, reach
   the RPC, and are rejected there anyway. "Unlimited gifting for paid users" is in practice
   "1 gift per 60 seconds".
4. **The `duplicate` branch is dead code that would lose money if it ever fired.**
   `:638` excludes `duplicate` from the rollback and `:645-647` logs "idempotent retry —
   skipping refund". But `add_diamonds_to_balance` returns `duplicate:true`
   *without crediting anyone* (`20260501120000...sql:35-46`). If a `transfer_<uuid>`
   reference_id ever collided, the sender would stay debited, the recipient would get
   nothing, and the route would return **HTTP 200 success**. Its idempotency check is also
   **not scoped to `user_id`** (unlike `deduct_diamonds`, which is), so any global
   reference_id collision hits it. Covered by:
   `DEFECT: a duplicate reference_id is treated as SUCCESS with no refund`.

The client does guard against accidental double-clicks with `transferInFlightRef`
(`DiamondWalletModal.jsx:928`) — but that is a UI courtesy, not a server control.

---

## 6. Other findings

* **`SUPABASE_SERVICE_ROLE_KEY` falls back to the anon key** (`:40-41`) with only a
  `console.warn`. Once `20260726120000...sql:95-127` lands, both RPCs are revoked from
  `anon`/`authenticated`, so a misconfigured deploy turns every transfer into a 500 instead
  of failing loudly at boot. Consider throwing at module load.
* **Per-recipient accounting is done by string matching on `description`**
  (`:482`, `:499`: `.ilike('description', '%[' + recipientId + ']%')`) even though the same
  rows carry `metadata->>'recipient_id'` (`:545`), which is exactly what the DB cap function
  uses (`20260517000001...sql:254`). The velocity detector does the same via a regex over
  `description` (`:184`). Any future edit to the description template silently zeroes gates
  15 and 16. Move both to `metadata->>'recipient_id'`.
* **The source-tier pool is chosen by *availability*, not by what is actually spent**
  (`:428-431`): `purchasedWonAvailable >= amount` selects the 500 cap. Since there is a
  single undifferentiated `profiles.diamonds` balance, a user holding one purchased batch
  gets the 500 cap for diamonds that were earned free. Covered by:
  `DEFECT: the pool is chosen by AVAILABILITY, not by what is actually spent`.
* **Gate 17 counts only `diamond_gift_received`** (`:515`). Inbound live-stream gifts land
  under a different type and are not counted against the 1,000/30d receive cap.
* **`PURCHASED_WON_TYPES`** (`:73-81`) is declared and never referenced — the source-tier
  math moved into the `get_source_tier_available` RPC (`:126-133`). Dead constant.
* **`getSourceTierAvailable` fails OPEN** (`:128-131`): on RPC error it returns
  `purchasedWonAvailable: 0`, which selects the *tighter* 100 cap — so this one is safe,
  but it is the opposite convention from `sumPaginatedTransactions`, which deliberately
  fails closed (`:112-114`). Worth a comment so nobody "fixes" it.
* **Notification `type: 'diamond_received'`** (`:677`) vs ledger type
  `diamond_gift_received` — see §2; the `TX_TYPES` comment at
  `DiamondWalletModal.jsx:113` attributes the wrong writer.

---

## 7. Severity summary

| # | Finding | Severity |
|---|---|---|
| 1 | `diamond_multiplier` inflates the recipient credit — diamonds minted on every gift to a streaked user | **Critical** |
| 2 | The rollback refund is multiplied too — failed transfers can pay the sender | **Critical** |
| 3 | Post-credit throw (unguarded `anti_farming_ips` insert, `:650`) refunds a sender whose recipient was already credited | **High** |
| 4 | Refund RPC return value discarded — silent unrefunded debits reported to the user as "restored" | **High** |
| 5 | Double-submit safety rests entirely on the 60s in-lock cooldown; no cross-request idempotency key | **High** |
| 6 | `duplicate` credit path returns HTTP 200 with the sender debited and the recipient uncredited | **Medium** |
| 7 | Paid + 7 days ⇒ all three DB caps and 5 JS gates bypassed | **Medium** (policy) |
| 8 | Gates 15/16 and the velocity detector key off `description` text instead of `metadata` | **Medium** |
| 9 | Service-role key silently falls back to anon | **Medium** |
| 10 | Case-sensitive self-transfer compare vs case-insensitive UUID regex | **Low** |
| 11 | `parseInt` accepts `'50abc'`, mangles `'1e3'` | **Low** |
| 12 | Cooldown rejection returns 400 with no countdown-parseable message | **Low** |

---

## 8. Test coverage map

`src/lib/rewards/__tests__/transferMath.test.mjs` — 63 tests / 15 suites, all passing.
Each pure function is a transcription of a specific decision with the source line cited in a
comment; the `runGates()` harness in the last suite replays the handler's gate order and
asserts every rejection lands **before** the string `DEBIT`.

| Suite | Proves |
|---|---|
| amount validation | zero / negative / sub-minimum / non-numeric / fractional / `1e3` |
| recipient validation | UUID shape, self-transfer, the case-sensitivity gap and its DB backstop |
| nonexistent user | 404 on either missing profile |
| balance ceiling | JS pre-check + SQL re-check under lock; balance never goes negative |
| friendship tier & per-transfer cap | 100 / 500 boundaries, unrestricted skip |
| trust ladder | 30d block, day-29.5 vs day-30, hasPaid unlock, 7d/120d unrestriction |
| source-tier 30-day cap | 100 / 500 pools, IP-max rule, availability-not-spend defect |
| per-recipient and inbound caps | 200/30d, 1,000/30d, who skips what |
| DB trigger caps | 5,000 pair / 50,000 user / 2,000 burst boundaries, evaluation order, bypasses |
| debit / credit symmetry | zero-sum ledger; the multiplier mint at every tier |
| refund on failed credit | rollback restores exactly; duplicate and discarded-result defects |
| double-submit / concurrency | in-lock cooldown serialisation; what happens at `cooldown = 0` |
| ledger rows render in the wallet UI | both types exist in `TX_TYPES`, signs are opposite and equal |
| full gate ordering | 17 rejection cases all stop before `DEBIT` |
| constants | caps match the popups and the documented economy |
