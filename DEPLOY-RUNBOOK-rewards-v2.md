# Diamond Rewards v2 — Deploy Runbook

**Read the ordering section first.** Deploying the code before applying the migration breaks every
reward claim on the site. The order is not optional.

---

## The trap

19 API files on `main` already call `award_diamonds_v2(...)`. That function only exists inside
`supabase/migrations/20260726120000_diamond_rewards_v2_security_and_caps.sql`, which **has never been run
against the database**. Right now the failing Vercel build is accidentally shielding you — the old code is
still serving. The moment a build succeeds without the migration applied, every reward endpoint throws
Postgres `42883 function does not exist`.

There is now a fail-safe in the code (`src/lib/rewards/awardGuard.js`): if the function is missing, endpoints
return HTTP 200 with `reason: 'unavailable'` and log one loud error naming the migration, instead of 500ing.
That is a seatbelt, not a substitute. Rewards stay switched off until the migration runs.

---

## Order of operations

**1 — Apply the migration first.**

```bash
cd ~/Documents/Smarter-Poker-World-Hub
npm run db:status                 # scripts/antigravity_sql_push.js --status supabase/migrations/
npm run db:push                   # applies pending migrations
```

Confirm it took:

```sql
select proname from pg_proc where proname in ('award_diamonds_v2','expire_lapsed_vip');
-- expect both rows

select has_function_privilege('authenticated',
  'public.add_diamonds_to_balance(uuid,integer,text,text,text)', 'EXECUTE');
-- expect FALSE  ← this is the unlimited-minting hole closing
```

**2 — Set the two Stripe env vars in Vercel** (Project → Settings → Environment Variables, Production):

| Variable | Value |
|---|---|
| `STRIPE_VIP_MONTHLY_PRICE_ID` | an active **recurring** Stripe price, $19.99 / month |
| `STRIPE_VIP_ANNUAL_PRICE_ID` | an active **recurring** Stripe price, $199.99 / year |

Neither exists in `.env.local` today, so both paid VIP tiers currently return a clean
`503 SUBSCRIPTIONS_NOT_CONFIGURED`. They are unbuyable until these are set. `create-checkout-session.js`
resolves the price **server-side** from these vars and round-trips it through Stripe to confirm it is active
and recurring — a client can never supply a price ID.

Keep them in sync with `VIP_MEMBERSHIP` in `src/data/diamondStoreData.js`, which is display-only. If they
diverge, the user sees one number and is charged another.

**3 — Then deploy.** Push to `main`; Vercel builds.

**4 — Verify in production.**

- Claim a daily login → expect diamonds, and a `daily_login` row in `diamond_transactions`.
- Hit `GET /api/rewards/progress` → earned-today, caps, streak, multiplier.
- Open `/hub/admin/diamond-liability` → outstanding liability in dollars.
- Try to exceed the daily cap → expect `reason: 'daily_cap'`, award clamped, not refused outright.

---

## What the migration actually changes

It is not just the award function. Applying it also:

- **Revokes `EXECUTE`** on `add_diamonds_to_balance`, `deduct_diamonds` and
  `fn_award_share_streak_diamonds` from `anon` and `authenticated`, leaving `service_role` only. Until this
  runs, any logged-in user can mint unlimited diamonds from devtools.
- **Locks the economic columns on `profiles`** (`diamonds`, `diamond_balance`, `diamond_multiplier`,
  `is_vip`, `vip_tier`, `vip_expires_at`) behind a `BEFORE UPDATE` guard trigger. Today the UPDATE policy is
  `USING (auth.uid() = id)` with **no `WITH CHECK`**, so a user can self-grant lifetime VIP and any balance.
- **Locks `diamond_reward_claims`** — the anti-farming ledger is currently INSERT/DELETE-able by the very
  user it audits, so the daily cap can be reset on demand.
- **Enforces the caps in the database**, evaluated *after* the streak multiplier. Today the JS cap check runs
  before the SQL multiplier, so the real ceiling is 500 × 2.00 = 1,000/day = $10.00/day.
- Seeds `diamond_reward_catalog` (26 action keys) and `diamond_platform_budget`.

### Pre-flight check before applying

`pages/auth/signup.js` was already changed to stop writing `diamonds` / `is_vip` / `vip_expires_at` from the
browser, because the guard trigger will reject those writes and would otherwise break account creation.
Confirm that change is on `main` before applying:

```bash
git show origin/main:pages/auth/signup.js | grep -c "is_vip: true"   # expect 0
```

If that returns anything other than 0, **do not apply the migration yet** — signup will break.

---

## Rollback

The migration is written to be idempotent and runs in a transaction. If the guard trigger causes an
unexpected breakage, the narrowest rollback is to drop the trigger only, keeping the grant revocations
(which are the actual security fix):

```sql
drop trigger if exists trg_guard_profile_economics on public.profiles;
```

Do **not** roll back the `REVOKE` statements. Re-granting `EXECUTE` to `authenticated` reopens unlimited
minting.

---

## Still open after this deploy

- **Merch checkout is a stub.** `handleMerchPurchase` is a "coming soon" toast. The Marketplace has no
  fulfilment path — that is feature work, not a bug.
- **Client price is still trusted for non-catalog merchandise** in `create-checkout-session.js` and
  `purchase-with-diamonds.js`, bounded by $0.50–$500 per item and a $2,000 order cap. Removing the fallback
  entirely needs a product decision on whether non-catalog items should exist at all.
- **The rate limiter is an in-memory `Map`.** On Vercel each lambda instance keeps its own counters and they
  reset on cold start, so the effective limit is instances × max. It needs a shared store (Upstash/Redis) to
  mean anything.
- **`sp-vip-status` in localStorage is a free VIP switch.** `premiumFeatureGate.js` returns
  `hasAccess: true` for any feature when that key is `'true'`, with no server call. It lives in the
  `commander-shared` repo, outside this one.
- **`DiamondWalletUtils.test.js` is not wired into CI** — jest is not installed and there is no `test`
  script, so those tests are documentation.
