-- =======================================================================
-- 20260808201500_trivia_tournaments_public_keep_definer_reads.sql
-- =======================================================================
-- TIER:        3            (corrects a regression introduced minutes earlier)
-- AUTHOR:      claude (cowork session, 2026-08-08)
-- AFFECTS:     public.trivia_tournaments_public
-- IRREVERSIBLE: no
--
-- WHY
-- ───────────────────────────────────────────────────────────────────────
-- 20260808200000 did two things. One was right and one was wrong.
--
-- RIGHT (kept): revoking INSERT/UPDATE/DELETE/TRUNCATE from anon and
-- authenticated on the API-exposed views. That closed a CONFIRMED anonymous
-- write to trivia_tournaments — prize_pool, winners, status, entry_fee —
-- reproduced against production as the `anon` role before the fix, and
-- refused after it.
--
-- WRONG (reverted here): it also set security_invoker = true on
-- trivia_tournaments_public. Under invoker semantics the READER needs
-- privileges on the base table, and anon deliberately has none —
-- has_table_privilege('anon','public.trivia_tournaments','SELECT') is false,
-- because that table carries correct_index and explanation for every
-- question. So the public tournament listing immediately began failing for
-- every logged-out visitor with "permission denied for table
-- trivia_tournaments". Caught by testing the read path as anon rather than
-- by trusting the migration's own assertions, which had only checked that
-- the GRANT still existed — not that the query still worked.
--
-- Definer semantics are the POINT of this view: a sanitised projection that
-- lets anonymous readers see tournament data they must not read directly.
-- That is the textbook legitimate use of a SECURITY DEFINER view, and it is
-- why Supabase's security_definer_view lint (ERROR 0010) is a false positive
-- for this specific object. The vulnerability was never the definer property.
-- It was that a definer view ALSO carried write grants.
--
-- LESSON, recorded because it generalises: a privilege assertion is not a
-- behaviour assertion. "the grant is still there" and "the query still works"
-- are different claims, and only the second one is what users experience.
-- =======================================================================

ALTER VIEW public.trivia_tournaments_public RESET (security_invoker);

-- --- POST-APPLY ASSERTIONS --------------------------------------------
DO $postcheck$
DECLARE
    v_msg text;
    v_id  uuid;
BEGIN
    SELECT id INTO v_id FROM public.trivia_tournaments LIMIT 1;

    -- 1. The regression must be gone: anon can read the public view again.
    BEGIN
        SET LOCAL ROLE anon;
        PERFORM 1 FROM public.trivia_tournaments_public LIMIT 1;
        RESET ROLE;
    EXCEPTION WHEN others THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        RESET ROLE;
        RAISE EXCEPTION 'post-apply failed: anon still cannot read the public view: %', v_msg;
    END;

    -- 2. The fix must hold: anon still cannot write through it.
    IF v_id IS NOT NULL THEN
        BEGIN
            SET LOCAL ROLE anon;
            EXECUTE format(
                'UPDATE public.trivia_tournaments_public SET prize_pool = prize_pool WHERE id = %L', v_id
            );
            RESET ROLE;
            RAISE EXCEPTION 'post-apply failed: anon write is open again';
        EXCEPTION
            WHEN insufficient_privilege THEN RESET ROLE;
            WHEN others THEN
                GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
                RESET ROLE;
                IF v_msg LIKE 'post-apply failed%' THEN RAISE EXCEPTION '%', v_msg; END IF;
        END;
    END IF;

    -- 3. Base-table privilege is checked DECLARATIVELY, not by probing.
    -- A PERFORM probe is unreliable here: plpgsql caches plans across role
    -- changes within one block, so it can report success for a table the role
    -- cannot actually read. An earlier version of this migration failed on
    -- exactly that false positive. The catalog does not lie.
    IF has_table_privilege('anon', 'public.trivia_tournaments', 'SELECT') THEN
        RAISE EXCEPTION 'post-apply failed: anon holds SELECT on trivia_tournaments (answers exposed)';
    END IF;
END
$postcheck$;

-- =======================================================================
-- ROLLBACK
-- =======================================================================
-- ALTER VIEW public.trivia_tournaments_public SET (security_invoker = true);
-- -- WARNING: this re-breaks the public tournament listing for logged-out
-- -- visitors. Do not do it without also granting anon SELECT on
-- -- trivia_tournaments, which would expose correct_index and explanation.
