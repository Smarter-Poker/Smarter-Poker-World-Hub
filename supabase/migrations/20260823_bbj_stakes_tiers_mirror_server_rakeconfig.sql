-- ═══════════════════════════════════════════════════════════════════════
-- 20260823_bbj_stakes_tiers_mirror_server_rakeconfig.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         2
-- AUTHOR:       Claude (Cowork)
-- AFFECTS:      bbj_stakes_tiers (6 rows rewritten). No schema change.
-- IRREVERSIBLE: no
--
-- WHY:
--   bbj_stakes_tiers is the PUBLISHED stakes ladder. Nothing in the database
--   reads it (verified: no function's prosrc mentions it) and nothing in
--   Club Arena's server/src reads it either — the engine takes the fee, the
--   cap and the payout percent from STAKES_TIERS in
--   server/src/config/RakeConfig.ts and passes the percent into
--   bbj_atomic_payout_v2 as p_payout_total_percent.
--
--   So this table is a MIRROR, not an authority. On 2026-08-23 the Club Arena
--   jackpot panel was changed to read it (club-arena PR #586) precisely so a
--   player sees one published schedule — which makes the mirror being wrong a
--   player-facing defect. It was wrong in five of six rows:
--
--     id           column          was      server says
--     nano         rake_percent    5.00     10
--     nano         rake_cap_bb     10.00    3
--     micro        min_bb          0.40     0.3  (cascade: anything > 0.2)
--     micro        rake_percent    7.00     10
--     micro        rake_cap_bb     8.00     3
--     micro        bbj_fee_bb      0.40     0.60   <-- charged 0.6, published 0.4
--     mid          min_bb          4.00     3.5
--     mid          rake_percent    8.00     10
--     mid          rake_cap_bb     3.00     8
--     high         min_bb          10.00    9
--     high         rake_percent    5.00     10
--     high         rake_cap_bb     2.00     15
--     nosebleeds   min_bb          50.00    41
--     nosebleeds   rake_percent    3.00     10
--     nosebleeds   rake_cap_bb     1.00     20
--
--   The payout percentages were already correct in all six rows, which is why
--   the jackpot figures in the panel reconcile to the cent.
--
-- HOW:
--   Rewrite every row from server/src/config/RakeConfig.ts. min_bb is set to
--   the CASCADE boundary rather than the server's descriptive minBB, because
--   getTierForBB is a `<=` cascade with no gaps and the panel uses
--   min_bb/max_bb to decide which row is the player's. Using the descriptive
--   values would leave 0.2 < bb < 0.3 (and four other bands) matching no row.
--
--   Drift is now caught at build time by club-arena's
--   scripts/ci/check-rakeconfig-parity.mjs, which compares the client and
--   server configs field by field.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. PRE-FLIGHT ASSERTIONS ────────────────────────────────────────────
DO $$
DECLARE v_n integer;
BEGIN
    SELECT count(*) INTO v_n FROM bbj_stakes_tiers;
    IF v_n <> 6 THEN
        RAISE EXCEPTION 'pre-flight failed: expected 6 tier rows, found %', v_n;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM bbj_stakes_tiers WHERE id='micro' AND bbj_fee_bb = 0.40) THEN
        RAISE EXCEPTION 'pre-flight failed: micro fee is not the expected 0.40 — re-audit before rewriting';
    END IF;
END $$;

-- ── 2. THE ACTUAL CHANGES ───────────────────────────────────────────────
UPDATE bbj_stakes_tiers SET
    blind_range='0.05/0.10 - 0.1/0.2', min_bb=0.01, max_bb=0.20,
    rake_percent=10, rake_cap_bb=3, bbj_fee_bb=0.60,
    payout_total_pct=15, payout_loser_pct=7.5, payout_winner_pct=3.75, payout_table_pct=3.75
WHERE id='nano';

UPDATE bbj_stakes_tiers SET
    blind_range='0.2/0.4 - 0.4/0.8', min_bb=0.21, max_bb=0.80,
    rake_percent=10, rake_cap_bb=3, bbj_fee_bb=0.60,
    payout_total_pct=25, payout_loser_pct=12.5, payout_winner_pct=6.25, payout_table_pct=6.25
WHERE id='micro';

UPDATE bbj_stakes_tiers SET
    blind_range='0.5/1 - 1.5/3', min_bb=0.81, max_bb=3.00,
    rake_percent=10, rake_cap_bb=5, bbj_fee_bb=0.25,
    payout_total_pct=40, payout_loser_pct=20, payout_winner_pct=10, payout_table_pct=10
WHERE id='small';

UPDATE bbj_stakes_tiers SET
    blind_range='2/4 - 4/8', min_bb=3.01, max_bb=8.00,
    rake_percent=10, rake_cap_bb=8, bbj_fee_bb=0.12,
    payout_total_pct=55, payout_loser_pct=27.5, payout_winner_pct=13.75, payout_table_pct=13.75
WHERE id='mid';

UPDATE bbj_stakes_tiers SET
    blind_range='5/10 - 20/40', min_bb=8.01, max_bb=40.00,
    rake_percent=10, rake_cap_bb=15, bbj_fee_bb=0.06,
    payout_total_pct=70, payout_loser_pct=35, payout_winner_pct=17.5, payout_table_pct=17.5
WHERE id='high';

UPDATE bbj_stakes_tiers SET
    blind_range='25/50+', min_bb=40.01, max_bb=99999.00,
    rake_percent=10, rake_cap_bb=20, bbj_fee_bb=0.03,
    payout_total_pct=85, payout_loser_pct=42.5, payout_winner_pct=21.25, payout_table_pct=21.25
WHERE id='nosebleeds';

-- ── 3. POST-APPLY ASSERTIONS ────────────────────────────────────────────
DO $$
DECLARE v_bad integer; v_gap integer;
BEGIN
    -- Every row's split must sum to its own total.
    SELECT count(*) INTO v_bad FROM bbj_stakes_tiers
     WHERE round(payout_loser_pct + payout_winner_pct + payout_table_pct, 4)
        <> round(payout_total_pct, 4);
    IF v_bad > 0 THEN
        RAISE EXCEPTION 'post-apply failed: % row(s) whose split does not sum to total', v_bad;
    END IF;

    -- The bb ladder must be continuous: no big blind may fall between tiers.
    SELECT count(*) INTO v_gap FROM (
        SELECT max_bb, lead(min_bb) OVER (ORDER BY min_bb) AS next_min
          FROM bbj_stakes_tiers
    ) t WHERE next_min IS NOT NULL AND round(next_min - max_bb, 4) <> 0.01;
    IF v_gap > 0 THEN
        RAISE EXCEPTION 'post-apply failed: % gap(s)/overlap(s) in the bb ladder', v_gap;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM bbj_stakes_tiers WHERE id='micro' AND bbj_fee_bb = 0.60) THEN
        RAISE EXCEPTION 'post-apply failed: micro fee did not land on 0.60';
    END IF;

    IF EXISTS (SELECT 1 FROM bbj_stakes_tiers WHERE rake_percent <> 10) THEN
        RAISE EXCEPTION 'post-apply failed: a row still disagrees with the server rake percent';
    END IF;

    RAISE NOTICE 'post-apply OK: 6 rows mirror server/src/config/RakeConfig.ts, ladder continuous';
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK — restores the pre-2026-08-23 values. Only useful if the server
-- config turns out to be the thing that is wrong; nothing reads this table
-- at runtime, so reverting it changes no behaviour, only what is published.
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- UPDATE bbj_stakes_tiers SET min_bb=0.10, max_bb=0.20, rake_percent=5,  rake_cap_bb=10, bbj_fee_bb=0.60 WHERE id='nano';
-- UPDATE bbj_stakes_tiers SET min_bb=0.40, max_bb=0.80, rake_percent=7,  rake_cap_bb=8,  bbj_fee_bb=0.40 WHERE id='micro';
-- UPDATE bbj_stakes_tiers SET min_bb=1.00, max_bb=3.00, rake_percent=10, rake_cap_bb=5,  bbj_fee_bb=0.25 WHERE id='small';
-- UPDATE bbj_stakes_tiers SET min_bb=4.00, max_bb=8.00, rake_percent=8,  rake_cap_bb=3,  bbj_fee_bb=0.12 WHERE id='mid';
-- UPDATE bbj_stakes_tiers SET min_bb=10.00, max_bb=40.00, rake_percent=5, rake_cap_bb=2, bbj_fee_bb=0.06 WHERE id='high';
-- UPDATE bbj_stakes_tiers SET min_bb=50.00, max_bb=99999.00, rake_percent=3, rake_cap_bb=1, bbj_fee_bb=0.03 WHERE id='nosebleeds';
-- COMMIT;
