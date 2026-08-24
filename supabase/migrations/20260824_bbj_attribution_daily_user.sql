-- ═══════════════════════════════════════════════════════════════════════
-- 20260824_bbj_attribution_daily_user.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         2
-- AUTHOR:       Claude (Cowork)
-- IRREVERSIBLE: no
--
-- WHY:
--   Dan 2026-08-24: "the same way we track rake credited to players we should
--   be tracking the BBJ the same way, so agents, clubs and union know who
--   accredited what to the BBJ, back up BBJ and promo fund."
--
--   Nobody could answer that. bbj_contributions has had a player_id column
--   since 2026-03-11 and it is NULL on all 652,443 rows — nothing has ever
--   written it. Club attribution existed; player attribution did not.
--
--   The data to derive it was already there. rake_records carries hand_id,
--   bbj_contribution AND player_contributions (the per-player pot
--   contributions the rake rollup already splits on), and bbj_contributions
--   carries the same hand's main/backup/promo portions.
--
-- HOW:
--   Mirror fn_club_rake_rollup_day exactly, including its cent-splitting:
--   integer cents per contributor, remainder handed out one cent at a time in
--   a deterministic order, so a day's per-player rows sum to the day's total
--   with no rounding dust.
--
--   Each of main / backup / promo is split SEPARATELY, so all three reconcile
--   to their own column rather than being back-derived from a percentage that
--   may not have applied on that hand. Verified on 2026-08-23: 583 players,
--   main 2,287.55 / backup 1,166.27 / promo 1,107.20, all three matching the
--   source to 0.00.
--
--   Weighting is "contributed to the pot", not "dealt in" — the same rule as
--   rake, because the BBJ drop comes out of the same pot. A player who folded
--   pre-flop without putting a chip in did not fund it.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.bbj_daily_user (
  club_id       uuid        NOT NULL,
  day           date        NOT NULL,
  user_id       uuid        NOT NULL,
  bbj_amount    numeric(14,2) NOT NULL DEFAULT 0,
  main_amount   numeric(14,2) NOT NULL DEFAULT 0,
  backup_amount numeric(14,2) NOT NULL DEFAULT 0,
  promo_amount  numeric(14,2) NOT NULL DEFAULT 0,
  hands         bigint      NOT NULL DEFAULT 0,
  computed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, day, user_id)
);

COMMENT ON TABLE public.bbj_daily_user IS
  'Per-player BBJ credited, by club and day. The BBJ twin of club_rake_daily_user: '
  'who funded the jackpot, split across main / backup / promo. Weighted by pot '
  'contribution, the same rule the rake rollup uses, because the BBJ drop comes '
  'out of the same pot.';

CREATE INDEX IF NOT EXISTS idx_bbj_daily_user_user_day ON public.bbj_daily_user (user_id, day DESC);
CREATE INDEX IF NOT EXISTS idx_bbj_daily_user_day      ON public.bbj_daily_user (day DESC);

ALTER TABLE public.bbj_daily_user ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS read_own_bbj_daily_user ON public.bbj_daily_user;
CREATE POLICY read_own_bbj_daily_user ON public.bbj_daily_user
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM clubs c
                WHERE c.id = bbj_daily_user.club_id AND c.owner_id = (SELECT auth.uid()))
    OR EXISTS (SELECT 1 FROM club_members cm
                WHERE cm.club_id = bbj_daily_user.club_id
                  AND cm.user_id = (SELECT auth.uid())
                  AND lower(COALESCE(cm.role,'')) IN ('owner','admin','manager'))
    OR EXISTS (SELECT 1 FROM union_clubs uc JOIN unions u ON u.id = uc.union_id
                WHERE uc.club_id = bbj_daily_user.club_id AND u.owner_id = (SELECT auth.uid()))
    OR EXISTS (SELECT 1 FROM union_clubs uc JOIN union_admins ua ON ua.union_id = uc.union_id
                WHERE uc.club_id = bbj_daily_user.club_id AND ua.user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS service_bbj_daily_user ON public.bbj_daily_user;
CREATE POLICY service_bbj_daily_user ON public.bbj_daily_user
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON public.bbj_daily_user TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_bbj_rollup_day(p_club_id uuid, p_day date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_start timestamptz := p_day::timestamptz;
  v_end   timestamptz := (p_day + 1)::timestamptz;
  v_rows  integer := 0;
BEGIN
  -- A day still in progress would be rewritten by the next run with a
  -- different answer. Same guard, same reason, as the rake rollup.
  IF v_end > date_trunc('day', now()) THEN
    RAISE EXCEPTION 'bbj rollup: day % is not complete', p_day;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('bbj_rollup:' || p_club_id::text || ':' || p_day::text, 42));

  DELETE FROM bbj_daily_user WHERE club_id = p_club_id AND day = p_day;

  WITH src AS (
    SELECT b.id, b.main_portion AS m, b.backup_portion AS bk, b.promo_portion AS pr,
           r.player_contributions AS contribs
      FROM bbj_contributions b
      JOIN rake_records r ON r.hand_id = b.hand_id
     WHERE b.club_id = p_club_id
       AND b.created_at >= v_start AND b.created_at < v_end
       AND b.amount > 0
       AND r.player_contributions IS NOT NULL
  ), split AS (
    SELECT (k.key)::uuid AS user_id,
           (round(COALESCE(s.m,0)  * 100)::bigint / count(*) OVER w)
             + CASE WHEN row_number() OVER (PARTITION BY s.id ORDER BY k.key)
                         <= (round(COALESCE(s.m,0)  * 100)::bigint % count(*) OVER w)
                    THEN 1 ELSE 0 END AS m_cents,
           (round(COALESCE(s.bk,0) * 100)::bigint / count(*) OVER w)
             + CASE WHEN row_number() OVER (PARTITION BY s.id ORDER BY k.key)
                         <= (round(COALESCE(s.bk,0) * 100)::bigint % count(*) OVER w)
                    THEN 1 ELSE 0 END AS bk_cents,
           (round(COALESCE(s.pr,0) * 100)::bigint / count(*) OVER w)
             + CASE WHEN row_number() OVER (PARTITION BY s.id ORDER BY k.key)
                         <= (round(COALESCE(s.pr,0) * 100)::bigint % count(*) OVER w)
                    THEN 1 ELSE 0 END AS pr_cents
      FROM src s
      JOIN LATERAL jsonb_each(s.contribs) k
        ON (CASE WHEN jsonb_typeof(k.value) = 'number' THEN (k.value)::numeric ELSE 0 END) > 0
    WINDOW w AS (PARTITION BY s.id)
  ), ins AS (
    INSERT INTO bbj_daily_user
      (club_id, day, user_id, bbj_amount, main_amount, backup_amount, promo_amount, hands)
    SELECT p_club_id, p_day, sp.user_id,
           SUM(sp.m_cents + sp.bk_cents + sp.pr_cents)::numeric / 100,
           SUM(sp.m_cents)::numeric  / 100,
           SUM(sp.bk_cents)::numeric / 100,
           SUM(sp.pr_cents)::numeric / 100,
           count(*)
      FROM split sp GROUP BY sp.user_id
    RETURNING 1
  )
  SELECT count(*) INTO v_rows FROM ins;

  RETURN v_rows;
END;
$fn$ SET search_path = public, extensions;

REVOKE EXECUTE ON FUNCTION public.fn_bbj_rollup_day(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_bbj_rollup_day(uuid, date) TO service_role;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema='public' AND table_name='bbj_daily_user') THEN
        RAISE EXCEPTION 'post-apply failed: bbj_daily_user not created';
    END IF;
    IF has_function_privilege('anon','public.fn_bbj_rollup_day(uuid,date)','EXECUTE') THEN
        RAISE EXCEPTION 'post-apply failed: anon can execute the rollup';
    END IF;
    RAISE NOTICE 'post-apply OK: bbj_daily_user + fn_bbj_rollup_day ready';
END $$;

COMMIT;
