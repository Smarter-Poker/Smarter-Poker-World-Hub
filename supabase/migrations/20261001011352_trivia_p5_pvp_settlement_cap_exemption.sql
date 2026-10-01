-- ============================================================================
-- trivia_p5_pvp_settlement_cap_exemption  (Phase 5, root decision 2026-09-30)
-- ============================================================================
-- TIER:         3 (changes which daily earning cap a PvP winner payout counts toward)
-- AUTHOR:       Claude (agent p5-pvp, Trivia Casino Realism program)
-- AFFECTS:      fn_ca_diamond_engine_of (one added mapping line, derived from the
--               live definition of 2026-10-01 00:30 UTC, md5-guarded),
--               diamond_engine_daily_caps (+1 row 'trivia_pvp').
-- IRREVERSIBLE: no. Reverting = restore the pre-image line; history is unaffected
--               (production held 0 pvp_win rows when this was written).
--
-- Why: the platform's per-user daily earning cap (DR7, armed 'refuse', engine
-- 'trivia' = 2,000/day) counted a PvP winner payout (type pvp_win, issuance
-- class 'earned') as promotional issuance. A PvP payout is not issuance: it is
-- the escrowed stakes of two players (or a player and the treasury-funded
-- horse) minus rake, moved by one Phase 2 settlement journal. A refusal there
-- would abort the whole settlement. Tie returns and refunds (pvp_refund) are
-- already issuance class 'refund' and never counted.
-- Decision (root, 2026-09-30): exempt competitive settlement cleanly. This
-- attributes pvp_win credits to their own engine 'trivia_pvp', uncapped exactly
-- like the pool-funded 'trivia_tournaments' engine. Solo trivia rewards keep
-- the 2,000/day cap unchanged, and PvP wins stop consuming a player's solo
-- trivia allowance. Measurement is unchanged: the award is still journaled per
-- user/engine by fn_ca_diamond_earn_ledger, just under 'trivia_pvp'.
-- ============================================================================
SET LOCAL lock_timeout = '5s';

-- One statement: the swap, the cap row and every postcondition commit or fail
-- together, whatever transaction mode the installer uses.
DO $exempt$
DECLARE
    v_def text;
    v_new text;
    v_solo_cap_before text;
    v_anchor_a constant text := $a$'pvp_refund', 'pvp_win', 'pvp_tie_refund', 'trivia_run',$a$;
    v_anchor_b constant text := $b$WHEN COALESCE(p_transaction_type,p_type)='referral_qualified' THEN 'qualified_referrals'$b$;
BEGIN
    IF to_regclass('public.diamond_engine_daily_caps') IS NULL
       OR to_regprocedure('public.fn_ca_diamond_engine_of(text,text,text,text,text)') IS NULL THEN
        RAISE EXCEPTION 'pre-flight failed: platform earning-cap objects are missing';
    END IF;
    v_def := pg_get_functiondef('public.fn_ca_diamond_engine_of(text,text,text,text,text)'::regprocedure);
    IF md5(v_def) <> '247d01bac63a1c273019cce221ea168f' THEN
        RAISE EXCEPTION 'pre-image mismatch: fn_ca_diamond_engine_of changed since Phase 5 review (md5 %); re-derive from the live definition', md5(v_def);
    END IF;
    IF (length(v_def) - length(replace(v_def, v_anchor_a, ''))) / length(v_anchor_a) <> 1
       OR (length(v_def) - length(replace(v_def, v_anchor_b, ''))) / length(v_anchor_b) <> 1 THEN
        RAISE EXCEPTION 'pre-flight failed: exemption anchors are not unique in the live definition';
    END IF;
    -- The solo trivia cap must come out of this migration exactly as it went in.
    v_solo_cap_before := COALESCE((SELECT max_per_user_per_day::text FROM public.diamond_engine_daily_caps
                                    WHERE engine = 'trivia'), 'absent');

    v_new := replace(v_def, v_anchor_a, $n$'pvp_refund', 'pvp_tie_refund', 'trivia_run',$n$);
    v_new := replace(v_new, v_anchor_b,
        $n$WHEN COALESCE(p_transaction_type, p_type) = 'pvp_win' THEN 'trivia_pvp'
        $n$ || v_anchor_b);
    EXECUTE v_new;

    INSERT INTO public.diamond_engine_daily_caps (engine, max_per_user_per_day, max_per_user_per_day_vip, note, updated_at)
    VALUES ('trivia_pvp', NULL, NULL,
            'Uncapped: PvP winner payouts are escrowed player stakes minus rake (Phase 2 settlement journal), not promotional issuance. Root decision 2026-09-30 (Trivia Phase 5).',
            now())
    ON CONFLICT (engine) DO NOTHING;

    -- Postconditions.
    IF public.fn_ca_diamond_engine_of('pvp_win', 'pvp_win', NULL, 'PvP match won', 'pvp_match_win_x') <> 'trivia_pvp'
       OR public.fn_ca_diamond_engine_of('trivia_run', 'trivia_run', NULL, 'x', 'trivia_session_x') <> 'trivia'
       OR public.fn_ca_diamond_engine_of('pvp_refund', 'pvp_refund', NULL, 'x', 'pvp_refund_x') <> 'trivia'
       OR public.fn_ca_diamond_engine_of('trivia_daily_bonus', 'trivia_daily_bonus', NULL, 'x', 'trivia_daily_bonus_x') <> 'trivia'
       OR public.fn_ca_diamond_engine_of('tournament_prize', 'tournament_prize', NULL, 'x', 'trivia_tourn_payout_x') <> 'trivia_tournaments'
       OR public.fn_ca_diamond_engine_of('wheel_prize', 'wheel_prize', NULL, 'x', 'wheel:x') <> 'wheel' THEN
        RAISE EXCEPTION 'post-apply failed: engine attribution is not exactly the intended exemption';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.diamond_engine_daily_caps
                    WHERE engine = 'trivia_pvp' AND max_per_user_per_day IS NULL AND max_per_user_per_day_vip IS NULL) THEN
        RAISE EXCEPTION 'post-apply failed: trivia_pvp cap row missing';
    END IF;
    IF COALESCE((SELECT max_per_user_per_day::text FROM public.diamond_engine_daily_caps WHERE engine = 'trivia'), 'absent')
       IS DISTINCT FROM v_solo_cap_before THEN
        RAISE EXCEPTION 'post-apply failed: the solo trivia cap changed';
    END IF;
    IF md5(pg_get_functiondef('public.fn_ca_diamond_engine_of(text,text,text,text,text)'::regprocedure)) <> '753401a7ab747be1309b1b3fe52caa87' THEN
        RAISE EXCEPTION 'post-apply failed: fn_ca_diamond_engine_of differs from the tested build';
    END IF;
    IF (SELECT provolatile FROM pg_proc WHERE oid = 'public.fn_ca_diamond_engine_of(text,text,text,text,text)'::regprocedure) <> 'i' THEN
        RAISE EXCEPTION 'post-apply failed: engine attribution volatility changed';
    END IF;
END
$exempt$;

-- ROLLBACK (Tier 3; paste into a new *_revert_* migration and uncomment). It
-- restores the pre-image attribution, so PvP winner payouts count toward the
-- 2,000/day Trivia cap again. The 'trivia_pvp' caps row is harmless once no
-- credit maps to it, so it is left in place.
-- DO $revert$
-- DECLARE
--     v_def text := pg_get_functiondef('public.fn_ca_diamond_engine_of(text,text,text,text,text)'::regprocedure);
-- BEGIN
--     v_def := replace(v_def, $n$WHEN COALESCE(p_transaction_type, p_type) = 'pvp_win' THEN 'trivia_pvp'
--         $n$, '');
--     v_def := replace(v_def, $a$'pvp_refund', 'pvp_tie_refund', 'trivia_run',$a$,
--                      $a$'pvp_refund', 'pvp_win', 'pvp_tie_refund', 'trivia_run',$a$);
--     EXECUTE v_def;
-- END
-- $revert$;
