-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 6.1.28 — Mandatory MFA for cashout-approval role holders
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Phase 6.1.21 backfilled profiles.mfa_required=true for admin/VIP. That
-- left club owners and club-level admins/managers able to opt out of MFA
-- and therefore skip the step-up gate on /api/club-arena/approve-cashout.
-- Since cashout approval moves real chips off-balance, these users need
-- to be on the same enforcement tier as platform admins.
--
-- Signals we treat as cashout-approval authority:
--   1. `clubs.owner_id` — the club owner
--   2. `club_members` rows with role IN ('owner','admin','manager','agent')
--      — per the /api/club-arena/approve-cashout authorization check
--
-- This migration:
--   (a) Backfills profiles.mfa_required=true for every user who currently
--       holds one of the above roles somewhere in the system.
--   (b) Extends the existing trg_sync_mfa_required_on_role_change trigger
--       family with a sibling trigger on club_members that flips the
--       user's profile.mfa_required=true on insert/update.
--   (c) Adds a per-clubs trigger on owner_id changes so a newly-appointed
--       owner is auto-enrolled.
--
-- Downgrade behavior: same rule as 6.1.21 — once flipped to TRUE, we don't
-- flip back. If a club owner steps down from all clubs, their mfa_required
-- stays TRUE. Removing MFA from a user requires a manual UPDATE by an
-- admin.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Backfill: existing owners + cashout-capable club_members ──────────────
DO $$
BEGIN
    -- (1) Club owners
    EXECUTE $q$
        UPDATE public.profiles p
        SET mfa_required = TRUE
        FROM public.clubs c
        WHERE c.owner_id = p.id
          AND p.mfa_required = FALSE
    $q$;

    -- (2) Cashout-capable club members
    EXECUTE $q$
        UPDATE public.profiles p
        SET mfa_required = TRUE
        FROM public.club_members m
        WHERE m.user_id = p.id
          AND m.role IN ('owner', 'admin', 'manager', 'agent')
          AND p.mfa_required = FALSE
    $q$;
END $$;

-- ── Trigger function: flip mfa_required on club_members upsert ────────────
CREATE OR REPLACE FUNCTION public.fn_sync_mfa_required_on_club_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.role IN ('owner', 'admin', 'manager', 'agent') THEN
        UPDATE public.profiles
           SET mfa_required = TRUE
         WHERE id = NEW.user_id
           AND mfa_required = FALSE;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_sync_mfa_required_on_club_role() IS
    'Phase 6.1.28: when a user gains a cashout-capable role on a club, flip profiles.mfa_required=TRUE. Never flips back — an explicit admin UPDATE is required to un-set.';

DROP TRIGGER IF EXISTS trg_sync_mfa_required_on_club_role ON public.club_members;
CREATE TRIGGER trg_sync_mfa_required_on_club_role
    AFTER INSERT OR UPDATE OF role, user_id ON public.club_members
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_sync_mfa_required_on_club_role();

-- ── Trigger function: flip mfa_required on clubs.owner_id change ──────────
CREATE OR REPLACE FUNCTION public.fn_sync_mfa_required_on_club_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.owner_id IS NOT NULL THEN
        UPDATE public.profiles
           SET mfa_required = TRUE
         WHERE id = NEW.owner_id
           AND mfa_required = FALSE;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_sync_mfa_required_on_club_owner() IS
    'Phase 6.1.28: when a club owner is assigned (insert) or changed (UPDATE owner_id), flip the new owner''s profiles.mfa_required=TRUE.';

DROP TRIGGER IF EXISTS trg_sync_mfa_required_on_club_owner ON public.clubs;
CREATE TRIGGER trg_sync_mfa_required_on_club_owner
    AFTER INSERT OR UPDATE OF owner_id ON public.clubs
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_sync_mfa_required_on_club_owner();

COMMIT;
