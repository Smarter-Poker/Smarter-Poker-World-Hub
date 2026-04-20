-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 6.1.22 — Atomic MFA backup-code consumption
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Closes the race in pages/api/auth/mfa/challenge.js where two concurrent
-- challenge requests with the same backup code could both succeed before
-- the UPDATE lands (select → check → update, no lock held across the gap).
--
-- This RPC does the select-check-update in a single round-trip inside a
-- SELECT ... FOR UPDATE lock window, guaranteeing that exactly one caller
-- sees `consumed = true` for any given code.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_consume_mfa_backup_code(
    p_user_id UUID,
    p_hashed_code TEXT
)
RETURNS TABLE (
    consumed BOOLEAN,
    remaining_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_codes TEXT[];
    v_new_codes TEXT[];
    v_found BOOLEAN := FALSE;
BEGIN
    -- Lock the row for the duration of this function. Concurrent callers
    -- block on this SELECT until we commit — exactly one of them finds the
    -- code present, the rest see it already consumed.
    SELECT backup_codes
      INTO v_codes
      FROM public.user_mfa_factors
     WHERE user_id = p_user_id
       AND enabled = TRUE
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0;
        RETURN;
    END IF;

    -- Check membership
    IF v_codes IS NULL OR NOT (p_hashed_code = ANY(v_codes)) THEN
        RETURN QUERY SELECT FALSE, COALESCE(array_length(v_codes, 1), 0);
        RETURN;
    END IF;

    v_found := TRUE;
    v_new_codes := array_remove(v_codes, p_hashed_code);

    UPDATE public.user_mfa_factors
       SET backup_codes = v_new_codes,
           updated_at    = NOW()
     WHERE user_id = p_user_id;

    RETURN QUERY SELECT TRUE, COALESCE(array_length(v_new_codes, 1), 0);
END;
$$;

COMMENT ON FUNCTION public.fn_consume_mfa_backup_code(UUID, TEXT) IS
    'Phase 6.1.22: atomically verify + consume an MFA backup code. Returns (consumed boolean, remaining_count integer). Holds a row-level lock for the duration to close the concurrent-use race.';

-- Restrict to service role only — client callers cannot invoke this.
REVOKE ALL ON FUNCTION public.fn_consume_mfa_backup_code(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_consume_mfa_backup_code(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.fn_consume_mfa_backup_code(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_consume_mfa_backup_code(UUID, TEXT) TO service_role;

-- updated_at column for idempotency observability
ALTER TABLE public.user_mfa_factors
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

COMMIT;
