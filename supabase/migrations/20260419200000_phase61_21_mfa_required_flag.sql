-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 6.1.21 — MFA required flag on profiles
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Adds a `mfa_required` boolean to `profiles` so server-side gates can
-- decide whether to refuse un-challenged requests or merely check MFA
-- opportunistically. Backfilled to TRUE for admin accounts (any user
-- referenced in `admin_users` or with profiles.role = 'admin') and VIP
-- accounts (profiles.is_vip = true). Everyone else defaults to FALSE —
-- they can still enrol voluntarily, but sensitive actions won't refuse
-- to run without it.
--
-- No RLS changes here — the gate is enforced at the API layer (src/lib/
-- mfaGate.js). Future phase may add an RLS policy
-- `(auth.jwt() -> 'app_metadata' ->> 'mfa_verified_at')::timestamptz > now() - interval '12 hours'`
-- once we migrate to Supabase native MFA.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Column ────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS mfa_required BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.mfa_required IS
    'Phase 6.1.21: if true, API gates must refuse requests that arrive without a valid mfa_session cookie. Set automatically for admin + VIP accounts; users may opt in voluntarily.';

-- ── Backfill: admin + VIP ─────────────────────────────────────────────────
-- Admin detection: profiles.role = 'admin' OR membership in admin_users.
DO $$
DECLARE
    v_admin_users_exists BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'admin_users'
    ) INTO v_admin_users_exists;

    IF v_admin_users_exists THEN
        EXECUTE $q$
            UPDATE public.profiles p
            SET mfa_required = TRUE
            WHERE p.id IN (SELECT user_id FROM public.admin_users)
               OR p.role = 'admin'
               OR p.is_vip = TRUE
        $q$;
    ELSE
        EXECUTE $q$
            UPDATE public.profiles p
            SET mfa_required = TRUE
            WHERE p.role = 'admin'
               OR p.is_vip = TRUE
        $q$;
    END IF;
END $$;

-- ── Trigger: keep it in sync ──────────────────────────────────────────────
-- When a user is promoted to admin / VIP, mfa_required flips to TRUE.
-- (Downgrade does NOT flip it back to FALSE — once a user has enrolled MFA
-- we want to keep enforcing it. An explicit un-set needs a manual update.)
CREATE OR REPLACE FUNCTION public.fn_sync_mfa_required_on_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF (NEW.role = 'admin' OR NEW.is_vip = TRUE) AND NOT NEW.mfa_required THEN
        NEW.mfa_required := TRUE;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_mfa_required_on_role_change ON public.profiles;
CREATE TRIGGER trg_sync_mfa_required_on_role_change
    BEFORE INSERT OR UPDATE OF role, is_vip ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_sync_mfa_required_on_role_change();

-- ── Index for the gate query ──────────────────────────────────────────────
-- mfaGate may end up joining profiles on mfa_required; keep the lookup
-- cheap.
CREATE INDEX IF NOT EXISTS idx_profiles_mfa_required
    ON public.profiles(id)
    WHERE mfa_required = TRUE;

COMMIT;
