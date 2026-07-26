-- ═══════════════════════════════════════════════════════════════════════════════
-- DIAMOND REWARDS STANDARD v2 — SECURITY BACKBONE + SERVER-SIDE ECONOMY
-- Migration: 20260726120000_diamond_rewards_v2_security_and_caps.sql
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ECONOMICS (the reason every ceiling below is mandatory)
--   1 diamond            = $0.01 USD  (real money leaving Smarter Poker)
--   VIP card             = 1,999 💎   ($19.99/mo, $199.99/yr)
--   Target hard worker   ≈ 3,000–3,300 💎/month  = one VIP card + ~1,000–1,300
--                          left over for the Diamond Arena
--   Daily ceiling        = 110 💎 free / 150 💎 VIP   ($1.10 / $1.50 per day)
--   Monthly ceiling      = 3,300 💎 free / 4,500 💎 VIP
--   Platform budget      = 2,500,000 💎/month ($25,000) — global circuit breaker
--
-- WHAT THIS FILE FIXES (all confirmed by audit, not speculative)
--   1. add_diamonds_to_balance / deduct_diamonds / fn_award_share_streak_diamonds
--      were GRANT EXECUTE'd to `authenticated` and never check auth.uid().
--      Any logged-in user could mint unlimited diamonds — or burn another
--      user's balance — straight from browser devtools.
--   2. `profiles` had GRANT ALL TO authenticated plus an UPDATE policy with
--      USING (auth.uid() = id) and NO WITH CHECK and no guard trigger, so a
--      user could PATCH their own diamonds / diamond_balance /
--      diamond_multiplier / is_vip / vip_tier / vip_expires_at via PostgREST.
--   3. diamond_reward_claims — the anti-farming ledger — was INSERT/UPDATE/
--      DELETE-able by the very user it audits, so the JS daily cap could be
--      reset on demand.
--   4. The daily cap was evaluated in JS BEFORE the SQL multiplier was applied,
--      so the real ceiling was 500 × 2.00 = 1,000 💎/day = $10/day. In v2 the
--      cap is evaluated on the POST-multiplier amount: the share-streak
--      multiplier may reduce the WORK needed to hit the ceiling, it can never
--      RAISE the ceiling.
--   5. VIP expiry was never enforced anywhere. expire_lapsed_vip() (section H)
--      is the reaper; wire it to a scheduler.
--
-- SECTIONS
--   A. Revoke money-minting function EXECUTE from every non-service role
--   B. Lock down profiles (guard trigger + column-level UPDATE grants)
--   C. Lock down the ledgers (diamond_reward_claims, diamond_transactions)
--   D. diamond_reward_catalog — server-side source of truth for every amount
--   E. diamond_platform_budget — global monthly circuit breaker
--   F. award_diamonds_v2() — the single, atomic, capped award path
--   G. Indexes backing the velocity + daily-count queries
--   H. expire_lapsed_vip()
--
-- REQUIRED FOLLOW-UPS (JS files, NOT owned by this migration)
--   F1. pages/api/sms/verify-otp.js takes userId from the request BODY with no
--       JWT check and stamps a 90-day VIP. It runs with the service role, so
--       section B waves it straight through. Until it verifies the bearer token,
--       ANY caller can grant themselves VIP. Highest-priority JS fix.
--   F2. pages/api/store/webhooks/stripe.js writes is_vip directly and never sets
--       vip_expires_at / vip_tier. Rows with is_vip = true and a NULL
--       vip_expires_at and a non-'lifetime' tier are treated as NOT VIP by
--       award_diamonds_v2 (free caps) and are never lapsed by expire_lapsed_vip.
--       The webhook must write vip_tier + vip_expires_at from the Stripe period.
--   F3. Any server route still calling add_diamonds_to_balance / deduct_diamonds /
--       fn_award_share_streak_diamonds MUST use SUPABASE_SERVICE_ROLE_KEY. Routes
--       that silently fall back to NEXT_PUBLIC_SUPABASE_ANON_KEY (e.g.
--       pages/api/social/share-count.js) will start returning 42501 after this
--       migration — that is the vulnerability surfacing, not a regression.
--   F4. diamond_transactions.reference_id is UNIQUE GLOBALLY. Reference ids that
--       are not user-scoped (e.g. social_post_reward_<postId>) let the first
--       claimer permanently block everyone else. Scope every reference_id with
--       the user id.
--   F5. Schedule expire_lapsed_vip() (section H) — hourly. Nothing calls it yet.
--
-- IDEMPOTENT: safe to re-run. Runs inside one transaction.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────────
-- Defensive column backfill. All of these already exist in production (see
-- 20260314_emergency_restore_and_security.sql and 20260402_fix_missing_profile_columns.sql);
-- these no-op there and keep the guard trigger compilable in fresh environments.
-- ───────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS diamonds            integer DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS diamond_balance     integer DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS diamond_multiplier  numeric(4,2) DEFAULT 1.00;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_vip              boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS vip_tier            text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS vip_expires_at      timestamptz;


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION A — LOCK DOWN EXECUTION OF THE MONEY FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════════
-- add_diamonds_to_balance, deduct_diamonds and fn_award_share_streak_diamonds all
-- take an arbitrary p_user_id and never verify auth.uid() = p_user_id. While they
-- are executable by `authenticated`, the entire diamond economy is client-writable.
-- We revoke from PUBLIC / anon / authenticated across EVERY overload (resolved
-- dynamically from pg_proc so no signature can be missed) and grant to
-- service_role only. All legitimate callers are Next.js API routes holding
-- SUPABASE_SERVICE_ROLE_KEY.
-- ───────────────────────────────────────────────────────────────────────────────
DO $lockdown$
DECLARE
    v_fn        record;
    v_role      text;
    v_revokable text[] := ARRAY['anon', 'authenticated'];
BEGIN
    FOR v_fn IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
              'add_diamonds_to_balance',
              'deduct_diamonds',
              'fn_award_share_streak_diamonds'
          )
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn.sig);

        FOREACH v_role IN ARRAY v_revokable LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
                EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', v_fn.sig, v_role);
            END IF;
        END LOOP;

        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn.sig);
        END IF;

        RAISE NOTICE 'Locked down %', v_fn.sig;
    END LOOP;
END
$lockdown$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION B — LOCK DOWN public.profiles
-- ═══════════════════════════════════════════════════════════════════════════════
-- Two independent layers, because either one alone has an escape hatch:
--
--   B1. A BEFORE UPDATE trigger that raises if any privileged column changes
--       outside a service-role context. This also covers any future SECURITY
--       DEFINER function that a user might be able to reach, because the JWT
--       claims GUC survives into SECURITY DEFINER bodies.
--   B2. Column-level UPDATE grants: `authenticated` keeps UPDATE on the harmless
--       profile columns (bio, avatar_url, app_settings, …) and loses it entirely
--       on the money/VIP columns, so PostgREST rejects the request before RLS
--       or the trigger is even consulted.
--
-- Service-role detection. Supabase/PostgREST sets request.jwt.claims AND does
-- SET ROLE to the JWT's role, so BOTH signals exist on a REST request.
--
-- ORDER MATTERS, and it is not obvious:
--   The JWT claims are checked FIRST and are authoritative. `current_user` is
--   only consulted when there is no JWT context at all. This is deliberate:
--   inside a SECURITY DEFINER function current_user becomes the function OWNER
--   (postgres), so a current_user-first check would hand a blanket bypass to any
--   SECURITY DEFINER function an ordinary user can reach. The claims GUC, by
--   contrast, survives unchanged into SECURITY DEFINER bodies and still says
--   'authenticated'.
--
--   No JWT context at all => psql, a migration, pg_cron, the Supabase SQL
--   editor. Those callers already hold superuser-equivalent access, so we allow
--   — unless the current role is literally anon/authenticated, which closes the
--   "anon key with no JWT" corner.
-- ───────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_is_service_context()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_raw_claims text;
    v_jwt_role   text;
BEGIN
    v_raw_claims := current_setting('request.jwt.claims', true);

    IF v_raw_claims IS NOT NULL
       AND btrim(v_raw_claims) <> ''
       AND btrim(v_raw_claims) <> 'null'
    THEN
        BEGIN
            v_jwt_role := v_raw_claims::jsonb ->> 'role';
        EXCEPTION WHEN others THEN
            -- Unparseable claims: fail CLOSED. A malformed JWT must never be
            -- mistaken for "no JWT".
            RETURN false;
        END;

        RETURN v_jwt_role = 'service_role';
    END IF;

    -- No JWT context.
    IF current_user IN ('anon', 'authenticated') THEN
        RETURN false;
    END IF;

    RETURN true;
END;
$$;

COMMENT ON FUNCTION public.fn_is_service_context() IS
    'True when the current statement runs with service_role / superuser authority, or with no JWT context at all (migrations, cron). Fails closed on malformed JWT claims.';


-- SECURITY INVOKER on purpose (the default). The guard needs no elevated
-- privileges, and running as INVOKER keeps current_user meaningful for
-- fn_is_service_context() and for the error message below.
CREATE OR REPLACE FUNCTION public.fn_guard_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_changed text;
BEGIN
    IF public.fn_is_service_context() THEN
        RETURN NEW;
    END IF;

    -- IS DISTINCT FROM so NULL -> value and value -> NULL both count as changes.
    IF NEW.diamonds           IS DISTINCT FROM OLD.diamonds           THEN v_changed := 'diamonds';
    ELSIF NEW.diamond_balance    IS DISTINCT FROM OLD.diamond_balance    THEN v_changed := 'diamond_balance';
    ELSIF NEW.diamond_multiplier IS DISTINCT FROM OLD.diamond_multiplier THEN v_changed := 'diamond_multiplier';
    ELSIF NEW.is_vip             IS DISTINCT FROM OLD.is_vip             THEN v_changed := 'is_vip';
    ELSIF NEW.vip_tier           IS DISTINCT FROM OLD.vip_tier           THEN v_changed := 'vip_tier';
    ELSIF NEW.vip_expires_at     IS DISTINCT FROM OLD.vip_expires_at     THEN v_changed := 'vip_expires_at';
    END IF;

    IF v_changed IS NOT NULL THEN
        RAISE EXCEPTION
            'profiles.% is server-managed and cannot be modified by role %',
            v_changed, current_user
            USING ERRCODE = '42501',
                  HINT = 'Diamond balances, multipliers and VIP state are written only by service_role (award_diamonds_v2, Stripe webhooks).';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_privileged_columns ON public.profiles;
CREATE TRIGGER trg_guard_profile_privileged_columns
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_guard_profile_privileged_columns();


-- ─── B2. Column-level UPDATE grants ────────────────────────────────────────────
-- 20260314_emergency_restore_and_security.sql did `GRANT ALL ON public.profiles
-- TO authenticated`. Replace the blanket table-level UPDATE with an explicit
-- allow-list of every column EXCEPT the money/VIP/identity columns. Built
-- dynamically so newly added harmless columns are picked up on re-run.
-- ───────────────────────────────────────────────────────────────────────────────
DO $profile_grants$
DECLARE
    v_cols text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        RETURN;
    END IF;

    EXECUTE 'REVOKE UPDATE ON public.profiles FROM authenticated';

    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY column_name)
    INTO v_cols
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'profiles'
      AND column_name NOT IN (
            -- money + VIP state: service_role only
            'diamonds', 'diamond_balance', 'diamond_multiplier',
            'is_vip', 'vip_tier', 'vip_expires_at',
            -- identity + privilege: never self-editable
            'id', 'role', 'is_admin'
      );

    IF v_cols IS NOT NULL THEN
        EXECUTE format('GRANT UPDATE (%s) ON public.profiles TO authenticated', v_cols);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon';
    END IF;

    -- service_role must keep full write access — it is the only role allowed to
    -- move money, and the guard trigger explicitly waves it through.
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'GRANT ALL ON public.profiles TO service_role';
    END IF;
END
$profile_grants$;

-- The pre-existing UPDATE policy had USING (auth.uid() = id) with NO WITH CHECK,
-- meaning a user could rewrite their row to values failing the same predicate.
-- Add the missing WITH CHECK.
DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update
    ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION C — LOCK DOWN THE LEDGERS
-- ═══════════════════════════════════════════════════════════════════════════════
-- diamond_reward_claims is the anti-farming ledger and diamond_transactions is
-- the money ledger. Neither may be written — or deleted — by the user it audits.
-- Reading one's own rows stays allowed (the wallet UI needs it).
-- ───────────────────────────────────────────────────────────────────────────────
DO $ledger_lockdown$
DECLARE
    v_tbl  text;
    v_role text;
BEGIN
    FOREACH v_tbl IN ARRAY ARRAY['diamond_reward_claims', 'diamond_transactions'] LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = v_tbl
        ) THEN
            CONTINUE;
        END IF;

        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tbl);

        FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
                EXECUTE format(
                    'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.%I FROM %I',
                    v_tbl, v_role
                );
            END IF;
        END LOOP;

        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v_tbl);
        END IF;

        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
            EXECUTE format('GRANT ALL ON public.%I TO service_role', v_tbl);
        END IF;
    END LOOP;
END
$ledger_lockdown$;

-- 20260419100000_rls_hardening_pass3.sql created diamond_reward_claims_owner as
-- FOR ALL (select+insert+update+delete) for the owning user. Downgrade to SELECT.
DROP POLICY IF EXISTS diamond_reward_claims_owner ON public.diamond_reward_claims;
DROP POLICY IF EXISTS "Users can view own claims" ON public.diamond_reward_claims;
DROP POLICY IF EXISTS "Service role can insert claims" ON public.diamond_reward_claims;
DROP POLICY IF EXISTS diamond_reward_claims_select_own ON public.diamond_reward_claims;
CREATE POLICY diamond_reward_claims_select_own
    ON public.diamond_reward_claims
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own transactions" ON public.diamond_transactions;
DROP POLICY IF EXISTS diamond_transactions_select_own ON public.diamond_transactions;
CREATE POLICY diamond_transactions_select_own
    ON public.diamond_transactions
    FOR SELECT
    USING (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION D — diamond_reward_catalog (SERVER-SIDE SOURCE OF TRUTH)
-- ═══════════════════════════════════════════════════════════════════════════════
-- The client NEVER sends an amount. award_diamonds_v2 resolves every payout from
-- this table. src/config/diamondRewards.js is the *display* mirror of these rows;
-- if the two ever disagree, THIS TABLE WINS because it is what pays out.
--
-- counts_toward_daily_cap = false  →  the action bypasses the 110/150 daily and
--   3,300/4,500 monthly ceilings. Reserved for once-in-a-lifetime onboarding
--   rewards, referrals (separate budget) and the VIP stipend.
-- lifetime = true  →  awardable exactly once, ever, regardless of target.
--   NOTE: venue_review is deliberately lifetime = false — it is once per VENUE,
--   which is enforced by the per-venue reference_id, not by a global "ever" check.
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.diamond_reward_catalog (
    action_key              text PRIMARY KEY,
    diamonds                integer NOT NULL,
    max_per_day             integer,
    counts_toward_daily_cap boolean NOT NULL DEFAULT true,
    lifetime                boolean NOT NULL DEFAULT false,
    category                text,
    active                  boolean NOT NULL DEFAULT true,
    updated_at              timestamptz DEFAULT now()
);

ALTER TABLE public.diamond_reward_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS diamond_reward_catalog_read ON public.diamond_reward_catalog;
CREATE POLICY diamond_reward_catalog_read
    ON public.diamond_reward_catalog
    FOR SELECT
    USING (true);

DO $catalog_grants$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON public.diamond_reward_catalog FROM authenticated';
        EXECUTE 'GRANT SELECT ON public.diamond_reward_catalog TO authenticated';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON public.diamond_reward_catalog FROM anon';
        EXECUTE 'GRANT SELECT ON public.diamond_reward_catalog TO anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'GRANT ALL ON public.diamond_reward_catalog TO service_role';
    END IF;
END
$catalog_grants$;

-- ─── SEED / RECONCILE (authoritative amounts) ──────────────────────────────────
INSERT INTO public.diamond_reward_catalog
    (action_key, diamonds, max_per_day, counts_toward_daily_cap, lifetime, category, active)
VALUES
    -- ── Daily engagement (counts toward the daily/monthly ceiling) ─────────────
    -- daily_login stores the BASE payout. award_diamonds_v2 scales it by the true
    -- consecutive-day streak: min(5 + (streak - 1) * 2, 25), anchored America/Chicago.
    ('daily_login',              5,   1,    true,  false, 'daily',    true),
    ('daily_trivia_challenge',   15,  1,    true,  false, 'daily',    true),
    ('hand_of_the_day',          10,  1,    true,  false, 'daily',    true),

    -- ── Training ───────────────────────────────────────────────────────────────
    ('first_training_session',   15,  1,    true,  false, 'training', true),
    ('training_level_complete',  8,   3,    true,  false, 'training', true),
    ('gto_chart_study',          5,   2,    true,  false, 'training', true),

    -- ── Social / content ───────────────────────────────────────────────────────
    ('social_post',              10,  2,    true,  false, 'social',   true),
    ('share_content',            10,  2,    true,  false, 'social',   true),
    ('strategy_comment',         3,   3,    true,  false, 'social',   true),
    ('reaction',                 1,   5,    true,  false, 'social',   true),
    ('follow',                   2,   3,    true,  false, 'social',   true),

    -- ── Video ──────────────────────────────────────────────────────────────────
    ('video_watch',              3,   3,    true,  false, 'video',    true),
    ('video_favorite',           1,   3,    true,  false, 'video',    true),

    -- ── Community ──────────────────────────────────────────────────────────────
    -- venue_review: once per VENUE (reference_id must include the venue id),
    -- max 1 per day. birthday: once per YEAR (guarded below in award_diamonds_v2).
    ('venue_review',             25,  1,    true,  false, 'community', true),
    ('birthday',                 100, 1,    true,  false, 'community', true),

    -- ── Easter eggs ────────────────────────────────────────────────────────────
    -- Per-egg payout varies by rarity, so the catalog row carries 0 and the
    -- SERVER (never the browser) passes the resolved value as
    -- p_metadata->>'egg_diamonds'. Hard-clamped to 250 per egg and 500 per
    -- calendar month per user inside award_diamonds_v2.
    ('easter_egg',               0,   NULL, true,  false, 'easter_egg', true),

    -- ── Lifetime onboarding rewards (EXEMPT from the daily/monthly ceiling) ────
    ('profile_complete',         50,  1,    false, true,  'profile',  true),
    ('profile_pic',              10,  1,    false, true,  'profile',  true),
    ('hendonmob_link',           25,  1,    false, true,  'profile',  true),
    ('email_verified',           10,  1,    false, true,  'profile',  true),
    ('phone_verified',           25,  1,    false, true,  'profile',  true),
    ('first_purchase',           25,  1,    false, true,  'profile',  true),

    -- ── Referral (separate budget; exempt from the daily cap, but hard-capped
    --    at 10 QUALIFIED referrals per calendar month inside award_diamonds_v2) ─
    ('referral_qualified',       250, NULL, false, false, 'referral', true),
    ('referral_referee',         100, 1,    false, true,  'referral', true),
    ('referral_vip_conversion',  500, NULL, false, false, 'referral', true),

    -- ── VIP stipend: 500 💎/month, PAID subscribers only, once per month ───────
    ('vip_stipend',              500, 1,    false, false, 'vip',      true)
ON CONFLICT (action_key) DO UPDATE
SET diamonds                = EXCLUDED.diamonds,
    max_per_day             = EXCLUDED.max_per_day,
    counts_toward_daily_cap = EXCLUDED.counts_toward_daily_cap,
    lifetime                = EXCLUDED.lifetime,
    category                = EXCLUDED.category,
    active                  = EXCLUDED.active,
    updated_at              = now();


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION E — diamond_platform_budget (GLOBAL CIRCUIT BREAKER)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Per-user caps bound one user. This bounds the COMPANY. 2,500,000 💎 = $25,000
-- per calendar month (America/Chicago). When spent >= budget every award returns
-- reason 'budget_exhausted' and pays 0 — the site keeps working, the money stops.
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.diamond_platform_budget (
    period           text PRIMARY KEY,           -- 'YYYY-MM', America/Chicago
    budget_diamonds  bigint NOT NULL,
    spent_diamonds   bigint NOT NULL DEFAULT 0,
    updated_at       timestamptz DEFAULT now()
);

ALTER TABLE public.diamond_platform_budget ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS diamond_platform_budget_service ON public.diamond_platform_budget;
CREATE POLICY diamond_platform_budget_service
    ON public.diamond_platform_budget
    FOR ALL
    USING (auth.role() = 'service_role');

DO $budget_grants$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON public.diamond_platform_budget FROM authenticated';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON public.diamond_platform_budget FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'GRANT ALL ON public.diamond_platform_budget TO service_role';
    END IF;
END
$budget_grants$;

-- Seed the current period so the first award of the month never races on INSERT.
INSERT INTO public.diamond_platform_budget (period, budget_diamonds)
VALUES (to_char(now() AT TIME ZONE 'America/Chicago', 'YYYY-MM'), 2500000)
ON CONFLICT (period) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION F — award_diamonds_v2 (THE ONLY SANCTIONED AWARD PATH)
-- ═══════════════════════════════════════════════════════════════════════════════
-- SIGNATURE IS A FIXED CONTRACT. Other agents' code depends on it exactly.
--
--   award_diamonds_v2(p_user_id uuid, p_action_key text, p_reference_id text,
--                     p_target_id text DEFAULT NULL,
--                     p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
--
--   → { success, awarded, requested, reason, capped,
--       daily_remaining, monthly_remaining, balance_after }
--
--   reason ∈ ok | duplicate | daily_cap | monthly_cap | action_limit
--          | velocity | budget_exhausted | unknown_action | not_eligible
--
-- EVALUATION ORDER (each gate short-circuits):
--   0. lock the profile row FOR UPDATE — this is the per-user serialization
--      point. Every cap below is computed INSIDE this lock, so two concurrent
--      claims cannot both read "remaining = 5" and both pay out.
--   1. catalog lookup            → unknown_action
--   2. reference_id idempotency  → duplicate
--   3. velocity (>20 awards/60s any action, >5/60s same action) → velocity
--   4. per-action daily limit    → action_limit
--   5. lifetime / periodic limits→ duplicate | action_limit
--   6. amount × diamond_multiplier
--   7. VIP tier resolution (expiry-aware)
--   8. daily then monthly ceiling, POST-multiplier, partial award allowed
--   9. platform budget
--  10. write balance + ledger row
--
-- LOCK ORDER: profiles row → diamond_platform_budget row. Always. Uniform order
-- across every call site means no deadlock is possible between two awards.
-- ───────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.award_diamonds_v2(uuid, text, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.award_diamonds_v2(
    p_user_id      uuid,
    p_action_key   text,
    p_reference_id text,
    p_target_id    text  DEFAULT NULL,
    p_metadata     jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $award$
DECLARE
    -- ── Economic constants (mirrored in src/config/diamondRewards.js) ─────────
    c_catalog_version      constant integer := 2;
    c_daily_cap_free       constant integer := 110;
    c_daily_cap_vip        constant integer := 150;
    c_monthly_cap_free     constant integer := 3300;
    c_monthly_cap_vip      constant integer := 4500;
    c_login_base           constant integer := 5;
    c_login_step           constant integer := 2;
    c_login_max            constant integer := 25;
    c_egg_max_single       constant integer := 250;
    c_egg_monthly_cap      constant integer := 500;
    c_referral_max_month   constant integer := 10;
    c_velocity_window      constant interval := interval '60 seconds';
    c_velocity_all_max     constant integer := 20;
    c_velocity_action_max  constant integer := 5;

    -- ── Time anchors (America/Chicago — the whole economy's day boundary) ─────
    v_now              timestamptz := now();
    v_today            date;
    v_day_start        timestamptz;
    v_day_end          timestamptz;
    v_month_start      timestamptz;
    v_month_end        timestamptz;
    v_period           text;

    -- ── Catalog ──────────────────────────────────────────────────────────────
    v_found_action     boolean := false;
    v_base_diamonds    integer;
    v_max_per_day      integer;
    v_counts_cap       boolean;
    v_lifetime         boolean;
    v_category         text;

    -- ── Profile ──────────────────────────────────────────────────────────────
    v_balance          integer := 0;
    v_multiplier       numeric(6,2) := 1.00;
    v_is_vip_flag      boolean := false;
    v_vip_tier         text;
    v_vip_expires_at   timestamptz;
    v_is_vip           boolean := false;

    -- ── Caps ─────────────────────────────────────────────────────────────────
    v_daily_cap        integer;
    v_monthly_cap      integer;
    v_daily_used       integer := 0;
    v_monthly_used     integer := 0;
    v_daily_remaining  integer;
    v_monthly_remaining integer;

    -- ── Award math ───────────────────────────────────────────────────────────
    v_reference_id     text;
    v_requested        integer := 0;
    v_award            integer := 0;
    v_capped           boolean := false;
    v_streak           integer := 0;
    v_action_count     integer := 0;
    v_egg_month_total  integer := 0;
    v_egg_request      integer := 0;

    -- ── Budget ───────────────────────────────────────────────────────────────
    v_budget_total     bigint;
    v_budget_spent     bigint;
    v_budget_left      bigint;

    v_new_balance      integer;
    v_metadata         jsonb;
BEGIN
    -- ── Time boundaries ──────────────────────────────────────────────────────
    v_today       := (v_now AT TIME ZONE 'America/Chicago')::date;
    v_day_start   := (v_today::timestamp)               AT TIME ZONE 'America/Chicago';
    v_day_end     := ((v_today + 1)::timestamp)         AT TIME ZONE 'America/Chicago';
    v_month_start := (date_trunc('month', v_today::timestamp))                       AT TIME ZONE 'America/Chicago';
    v_month_end   := (date_trunc('month', v_today::timestamp) + interval '1 month')   AT TIME ZONE 'America/Chicago';
    v_period      := to_char(v_today, 'YYYY-MM');

    -- ── Normalise inputs ─────────────────────────────────────────────────────
    p_metadata := COALESCE(p_metadata, '{}'::jsonb);

    IF p_user_id IS NULL OR p_action_key IS NULL OR btrim(p_action_key) = '' THEN
        RETURN jsonb_build_object(
            'success', false, 'awarded', 0, 'requested', 0,
            'reason', 'unknown_action', 'capped', false,
            'daily_remaining', 0, 'monthly_remaining', 0, 'balance_after', 0
        );
    END IF;

    -- A NULL reference_id would defeat idempotency entirely, so synthesise a
    -- deterministic, USER-SCOPED one. (Never rely on this: callers should pass
    -- an explicit reference_id that includes the user id and target id.)
    v_reference_id := COALESCE(
        NULLIF(btrim(p_reference_id), ''),
        format('%s:%s:%s:%s', p_action_key, p_user_id, COALESCE(p_target_id, 'none'), v_today)
    );

    -- ── STEP 0: lock the profile. Serialization point for all cap math. ──────
    SELECT COALESCE(pr.diamonds, 0),
           COALESCE(pr.diamond_multiplier, 1.00),
           COALESCE(pr.is_vip, false),
           pr.vip_tier,
           pr.vip_expires_at
      INTO v_balance, v_multiplier, v_is_vip_flag, v_vip_tier, v_vip_expires_at
      FROM public.profiles pr
     WHERE pr.id = p_user_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false, 'awarded', 0, 'requested', 0,
            'reason', 'not_eligible', 'capped', false,
            'daily_remaining', 0, 'monthly_remaining', 0, 'balance_after', 0
        );
    END IF;

    -- A corrupt/hostile multiplier can never exceed the documented 2.00 ceiling.
    v_multiplier := LEAST(GREATEST(COALESCE(v_multiplier, 1.00), 1.00), 2.00);

    -- ── VIP resolution: is_vip alone is NOT enough, expiry is enforced here ──
    v_is_vip := v_is_vip_flag
        AND (
            (v_vip_expires_at IS NULL AND v_vip_tier = 'lifetime')
            OR v_vip_expires_at > v_now
        );

    v_daily_cap   := CASE WHEN v_is_vip THEN c_daily_cap_vip   ELSE c_daily_cap_free   END;
    v_monthly_cap := CASE WHEN v_is_vip THEN c_monthly_cap_vip ELSE c_monthly_cap_free END;

    -- ── Consumed allowance so far. Only capped actions consume the ceiling. ──
    SELECT COALESCE(SUM(t.amount), 0)
      INTO v_daily_used
      FROM public.diamond_transactions t
      JOIN public.diamond_reward_catalog c ON c.action_key = t.transaction_type
     WHERE t.user_id = p_user_id
       AND t.amount > 0
       AND c.counts_toward_daily_cap
       AND t.created_at >= v_day_start
       AND t.created_at <  v_day_end;

    SELECT COALESCE(SUM(t.amount), 0)
      INTO v_monthly_used
      FROM public.diamond_transactions t
      JOIN public.diamond_reward_catalog c ON c.action_key = t.transaction_type
     WHERE t.user_id = p_user_id
       AND t.amount > 0
       AND c.counts_toward_daily_cap
       AND t.created_at >= v_month_start
       AND t.created_at <  v_month_end;

    v_daily_remaining   := GREATEST(v_daily_cap   - v_daily_used,   0);
    v_monthly_remaining := GREATEST(v_monthly_cap - v_monthly_used, 0);

    -- ── STEP 1: resolve the action from the SERVER-SIDE catalog ──────────────
    SELECT true, c.diamonds, c.max_per_day, c.counts_toward_daily_cap, c.lifetime, c.category
      INTO v_found_action, v_base_diamonds, v_max_per_day, v_counts_cap, v_lifetime, v_category
      FROM public.diamond_reward_catalog c
     WHERE c.action_key = p_action_key
       AND c.active;

    IF NOT COALESCE(v_found_action, false) THEN
        RETURN jsonb_build_object(
            'success', false, 'awarded', 0, 'requested', 0,
            'reason', 'unknown_action', 'capped', false,
            'daily_remaining', v_daily_remaining,
            'monthly_remaining', v_monthly_remaining,
            'balance_after', v_balance
        );
    END IF;

    -- ── STEP 2: idempotency. The unique index on reference_id makes this a
    --    belt-and-braces check; returning cleanly beats a 23505 to the client. ─
    IF EXISTS (
        SELECT 1 FROM public.diamond_transactions t
         WHERE t.reference_id = v_reference_id
    ) THEN
        RETURN jsonb_build_object(
            'success', false, 'awarded', 0, 'requested', 0,
            'reason', 'duplicate', 'capped', false,
            'daily_remaining', v_daily_remaining,
            'monthly_remaining', v_monthly_remaining,
            'balance_after', v_balance
        );
    END IF;

    -- ── STEP 3: velocity guard (scripted farming / replay floods) ────────────
    SELECT COUNT(*)
      INTO v_action_count
      FROM public.diamond_transactions t
     WHERE t.user_id = p_user_id
       AND t.amount > 0
       AND t.created_at >= v_now - c_velocity_window;

    IF v_action_count > c_velocity_all_max THEN
        RETURN jsonb_build_object(
            'success', false, 'awarded', 0, 'requested', 0,
            'reason', 'velocity', 'capped', false,
            'daily_remaining', v_daily_remaining,
            'monthly_remaining', v_monthly_remaining,
            'balance_after', v_balance
        );
    END IF;

    SELECT COUNT(*)
      INTO v_action_count
      FROM public.diamond_transactions t
     WHERE t.user_id = p_user_id
       AND t.transaction_type = p_action_key
       AND t.amount > 0
       AND t.created_at >= v_now - c_velocity_window;

    IF v_action_count > c_velocity_action_max THEN
        RETURN jsonb_build_object(
            'success', false, 'awarded', 0, 'requested', 0,
            'reason', 'velocity', 'capped', false,
            'daily_remaining', v_daily_remaining,
            'monthly_remaining', v_monthly_remaining,
            'balance_after', v_balance
        );
    END IF;

    -- ── STEP 4: per-action daily limit (America/Chicago day) ─────────────────
    -- Skipped for lifetime actions: the "once, ever" check in step 5a is
    -- strictly stronger, and it reports the more accurate reason 'duplicate'.
    IF v_max_per_day IS NOT NULL AND NOT v_lifetime THEN
        SELECT COUNT(*)
          INTO v_action_count
          FROM public.diamond_transactions t
         WHERE t.user_id = p_user_id
           AND t.transaction_type = p_action_key
           AND t.amount > 0
           AND t.created_at >= v_day_start
           AND t.created_at <  v_day_end;

        IF v_action_count >= v_max_per_day THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', 0,
                'reason', 'action_limit', 'capped', false,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance
            );
        END IF;
    END IF;

    -- ── STEP 5a: lifetime actions — once, ever ───────────────────────────────
    IF v_lifetime THEN
        IF EXISTS (
            SELECT 1 FROM public.diamond_transactions t
             WHERE t.user_id = p_user_id
               AND t.transaction_type = p_action_key
               AND t.amount > 0
        ) THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', 0,
                'reason', 'duplicate', 'capped', false,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance
            );
        END IF;
    END IF;

    -- ── STEP 5b: periodic limits that max_per_day alone cannot express ───────
    --   birthday            : once per year
    --   referral_qualified  : 10 per calendar month (REFERRAL.maxQualifiedPerMonth)
    --   vip_stipend         : once per calendar month, PAID subscribers only
    IF p_action_key = 'birthday' THEN
        IF EXISTS (
            SELECT 1 FROM public.diamond_transactions t
             WHERE t.user_id = p_user_id
               AND t.transaction_type = 'birthday'
               AND t.amount > 0
               AND t.created_at >= v_now - interval '300 days'
        ) THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', 0,
                'reason', 'action_limit', 'capped', false,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance
            );
        END IF;

    ELSIF p_action_key = 'referral_qualified' THEN
        SELECT COUNT(*)
          INTO v_action_count
          FROM public.diamond_transactions t
         WHERE t.user_id = p_user_id
           AND t.transaction_type = 'referral_qualified'
           AND t.amount > 0
           AND t.created_at >= v_month_start
           AND t.created_at <  v_month_end;

        IF v_action_count >= c_referral_max_month THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', 0,
                'reason', 'action_limit', 'capped', false,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance
            );
        END IF;

    ELSIF p_action_key = 'vip_stipend' THEN
        -- Never pay a stipend to a lapsed, trial or self-granted "VIP".
        IF NOT v_is_vip OR COALESCE(v_vip_tier, '') NOT IN ('monthly', 'annual', 'yearly', 'lifetime') THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', 0,
                'reason', 'not_eligible', 'capped', false,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance
            );
        END IF;

        IF EXISTS (
            SELECT 1 FROM public.diamond_transactions t
             WHERE t.user_id = p_user_id
               AND t.transaction_type = 'vip_stipend'
               AND t.amount > 0
               AND t.created_at >= v_month_start
               AND t.created_at <  v_month_end
        ) THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', 0,
                'reason', 'action_limit', 'capped', false,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance
            );
        END IF;
    END IF;

    -- ── STEP 6: resolve the base payout ──────────────────────────────────────
    v_requested := GREATEST(COALESCE(v_base_diamonds, 0), 0);

    -- 6a. daily_login streak scaling: min(5 + (streak - 1) * 2, 25).
    --     The streak is derived from the LEDGER (true consecutive America/Chicago
    --     days), never from profiles.login_streak, which users can write.
    IF p_action_key = 'daily_login' THEN
        WITH login_days AS (
            SELECT DISTINCT (t.created_at AT TIME ZONE 'America/Chicago')::date AS d
              FROM public.diamond_transactions t
             WHERE t.user_id = p_user_id
               AND t.transaction_type = 'daily_login'
               AND t.amount > 0
               AND t.created_at >= v_now - interval '400 days'
        ),
        ranked AS (
            SELECT d,
                   ((v_today - 1) - d)                              AS gap,
                   (row_number() OVER (ORDER BY d DESC) - 1)::int   AS rn
              FROM login_days
             WHERE d <= v_today - 1
        )
        -- gap is monotonically >= rn; equality holds exactly for the leading
        -- unbroken run ending yesterday, so COUNT(*) is that run's length.
        SELECT COUNT(*)::int INTO v_streak FROM ranked WHERE gap = rn;

        v_streak    := v_streak + 1;  -- include today's claim
        v_requested := LEAST(c_login_base + (v_streak - 1) * c_login_step, c_login_max);
    END IF;

    -- 6b. easter eggs: per-egg value is resolved SERVER-SIDE from the JS egg
    --     catalog and handed over in p_metadata->>'egg_diamonds'. The browser
    --     never touches this path (claim.js runs with the service role), and it
    --     is hard-clamped here regardless.
    IF p_action_key = 'easter_egg' THEN
        BEGIN
            v_egg_request := COALESCE((p_metadata ->> 'egg_diamonds')::int, 0);
        EXCEPTION WHEN others THEN
            v_egg_request := 0;
        END;

        v_egg_request := LEAST(GREATEST(v_egg_request, 0), c_egg_max_single);

        SELECT COALESCE(SUM(t.amount), 0)::int
          INTO v_egg_month_total
          FROM public.diamond_transactions t
         WHERE t.user_id = p_user_id
           AND t.transaction_type = 'easter_egg'
           AND t.amount > 0
           AND t.created_at >= v_month_start
           AND t.created_at <  v_month_end;

        IF v_egg_month_total >= c_egg_monthly_cap THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', v_egg_request,
                'reason', 'action_limit', 'capped', true,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance
            );
        END IF;

        v_requested := LEAST(v_egg_request, c_egg_monthly_cap - v_egg_month_total);
    END IF;

    IF v_requested <= 0 THEN
        RETURN jsonb_build_object(
            'success', false, 'awarded', 0, 'requested', 0,
            'reason', 'not_eligible', 'capped', false,
            'daily_remaining', v_daily_remaining,
            'monthly_remaining', v_monthly_remaining,
            'balance_after', v_balance
        );
    END IF;

    -- 6c. Apply the share-streak multiplier. THIS IS PRE-CAP ON PURPOSE:
    --     the ceiling is enforced on the post-multiplier number below, so a
    --     2.00× streak halves the work needed to hit 110/150 — it does not
    --     raise the ceiling to 220/300. (This was the $10/day bug in v1.)
    v_requested := GREATEST(ROUND(v_requested * v_multiplier)::int, 1);
    v_award     := v_requested;

    -- ── STEP 8: daily then monthly ceiling (post-multiplier) ─────────────────
    IF v_counts_cap THEN
        IF v_daily_remaining <= 0 THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', v_requested,
                'reason', 'daily_cap', 'capped', true,
                'daily_remaining', 0,
                'monthly_remaining', v_monthly_remaining,
                'balance_after', v_balance
            );
        END IF;

        IF v_monthly_remaining <= 0 THEN
            RETURN jsonb_build_object(
                'success', false, 'awarded', 0, 'requested', v_requested,
                'reason', 'monthly_cap', 'capped', true,
                'daily_remaining', v_daily_remaining,
                'monthly_remaining', 0,
                'balance_after', v_balance
            );
        END IF;

        -- Partial award: pay what is left rather than refusing outright.
        v_award := LEAST(v_award, v_daily_remaining, v_monthly_remaining);
    END IF;

    -- ── STEP 9: platform budget circuit breaker ──────────────────────────────
    INSERT INTO public.diamond_platform_budget (period, budget_diamonds)
    VALUES (v_period, 2500000)
    ON CONFLICT (period) DO NOTHING;

    SELECT b.budget_diamonds, b.spent_diamonds
      INTO v_budget_total, v_budget_spent
      FROM public.diamond_platform_budget b
     WHERE b.period = v_period
     FOR UPDATE;

    v_budget_left := GREATEST(COALESCE(v_budget_total, 0) - COALESCE(v_budget_spent, 0), 0);

    IF v_budget_left <= 0 THEN
        RETURN jsonb_build_object(
            'success', false, 'awarded', 0, 'requested', v_requested,
            'reason', 'budget_exhausted', 'capped', true,
            'daily_remaining', v_daily_remaining,
            'monthly_remaining', v_monthly_remaining,
            'balance_after', v_balance
        );
    END IF;

    v_award := LEAST(v_award::bigint, v_budget_left)::int;

    IF v_award <= 0 THEN
        RETURN jsonb_build_object(
            'success', false, 'awarded', 0, 'requested', v_requested,
            'reason', 'budget_exhausted', 'capped', true,
            'daily_remaining', v_daily_remaining,
            'monthly_remaining', v_monthly_remaining,
            'balance_after', v_balance
        );
    END IF;

    v_capped := v_award < v_requested;

    UPDATE public.diamond_platform_budget
       SET spent_diamonds = spent_diamonds + v_award,
           updated_at     = now()
     WHERE period = v_period;

    -- ── STEP 10: write the balance and the ledger row ────────────────────────
    -- Both `diamonds` and `diamond_balance` are written in one UPDATE; they
    -- drifted by ~508k diamonds historically when callers wrote only one.
    v_new_balance := v_balance + v_award;

    UPDATE public.profiles
       SET diamonds        = v_new_balance,
           diamond_balance = v_new_balance,
           updated_at      = now()
     WHERE id = p_user_id;

    v_metadata := p_metadata || jsonb_build_object(
        'catalog_version', c_catalog_version,
        'action_key',      p_action_key,
        'target_id',       p_target_id,
        'requested',       v_requested,
        'awarded',         v_award,
        'capped',          v_capped,
        'multiplier',      v_multiplier,
        'category',        v_category,
        'reference_id',    v_reference_id,
        'streak',          CASE WHEN p_action_key = 'daily_login' THEN v_streak ELSE NULL END,
        'is_vip',          v_is_vip
    );

    INSERT INTO public.diamond_transactions (
        user_id, amount, transaction_type, type, description,
        balance_after, reference_id, metadata, created_at
    ) VALUES (
        p_user_id,
        v_award,
        p_action_key,
        p_action_key,
        format('Diamond Rewards v2: %s%s', p_action_key,
               CASE WHEN v_capped THEN ' (capped)' ELSE '' END),
        v_new_balance,
        v_reference_id,
        v_metadata,
        v_now
    );

    IF v_counts_cap THEN
        v_daily_remaining   := GREATEST(v_daily_remaining   - v_award, 0);
        v_monthly_remaining := GREATEST(v_monthly_remaining - v_award, 0);
    END IF;

    RETURN jsonb_build_object(
        'success',           true,
        'awarded',           v_award,
        'requested',         v_requested,
        'reason',            'ok',
        'capped',            v_capped,
        'daily_remaining',   v_daily_remaining,
        'monthly_remaining', v_monthly_remaining,
        'balance_after',     v_new_balance
    );

EXCEPTION
    -- Concurrent insert of the same reference_id (unique index). Treat as the
    -- duplicate it is instead of surfacing a 23505 to the API layer.
    WHEN unique_violation THEN
        RETURN jsonb_build_object(
            'success', false, 'awarded', 0, 'requested', COALESCE(v_requested, 0),
            'reason', 'duplicate', 'capped', false,
            'daily_remaining', COALESCE(v_daily_remaining, 0),
            'monthly_remaining', COALESCE(v_monthly_remaining, 0),
            'balance_after', COALESCE(v_balance, 0)
        );
END;
$award$;

COMMENT ON FUNCTION public.award_diamonds_v2(uuid, text, text, text, jsonb) IS
    'Diamond Rewards Standard v2 — the only sanctioned award path. Resolves every amount from diamond_reward_catalog (the client never sends an amount), enforces idempotency, velocity, per-action, daily (110 free / 150 VIP), monthly (3300 / 4500) and platform-budget ceilings on the POST-multiplier amount, and writes profiles + diamond_transactions atomically. service_role ONLY.';

-- GRANTED TO service_role ONLY. This is the whole point of the migration.
REVOKE ALL ON FUNCTION public.award_diamonds_v2(uuid, text, text, text, jsonb) FROM PUBLIC;
DO $award_grants$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON FUNCTION public.award_diamonds_v2(uuid, text, text, text, jsonb) FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON FUNCTION public.award_diamonds_v2(uuid, text, text, text, jsonb) FROM authenticated';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.award_diamonds_v2(uuid, text, text, text, jsonb) TO service_role';
    END IF;
END
$award_grants$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION G — INDEXES BACKING THE HOT PATHS
-- ═══════════════════════════════════════════════════════════════════════════════
-- award_diamonds_v2 runs, per call: a 60s velocity scan, a same-action 60s scan,
-- a same-action day-count, and two SUM(amount) window rollups — all keyed on
-- user_id + created_at (+ transaction_type). Without these it degrades to a seq
-- scan of the whole money ledger on every claim.
-- ───────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_diamond_transactions_user_created
    ON public.diamond_transactions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_diamond_transactions_user_type_created
    ON public.diamond_transactions (user_id, transaction_type, created_at DESC);


-- ═══════════════════════════════════════════════════════════════════════════════
-- SECTION H — VIP EXPIRY REAPER
-- ═══════════════════════════════════════════════════════════════════════════════
-- VIP expiry was never enforced: /api/vip/check-status selects only is_vip, and
-- nothing ever lapsed anyone. Every expired subscriber kept the 150/day and
-- 4,500/month ceilings plus the 500 💎 monthly stipend forever. Run this on a
-- schedule (pg_cron hourly, or a Vercel cron hitting a service-role endpoint).
-- ───────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.expire_lapsed_vip()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer := 0;
BEGIN
    UPDATE public.profiles
       SET is_vip     = false,
           vip_tier   = NULL,
           updated_at = now()
     WHERE is_vip = true
       AND vip_expires_at IS NOT NULL
       AND vip_expires_at < now()
       AND COALESCE(vip_tier, '') <> 'lifetime';

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.expire_lapsed_vip() IS
    'Lapses expired VIP subscriptions (is_vip=false, vip_tier=NULL). Lifetime tiers are never lapsed. Returns the number of rows lapsed. Schedule hourly.';

REVOKE ALL ON FUNCTION public.expire_lapsed_vip() FROM PUBLIC;
DO $expire_grants$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON FUNCTION public.expire_lapsed_vip() FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON FUNCTION public.expire_lapsed_vip() FROM authenticated';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.expire_lapsed_vip() TO service_role';
    END IF;
END
$expire_grants$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- PostgREST caches the schema (function signatures, grants, policies). Without
-- this, /rest/v1/rpc/award_diamonds_v2 would 404 until the next restart.
-- ═══════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
    RAISE NOTICE 'Diamond Rewards v2 installed: money RPCs service_role-only, profiles guarded, ledgers read-only to users, catalog + budget seeded, award_diamonds_v2 live.';
END $$;

COMMIT;
