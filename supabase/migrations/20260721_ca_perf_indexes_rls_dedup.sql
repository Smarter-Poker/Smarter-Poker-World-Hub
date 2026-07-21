-- Club Arena performance + RLS hygiene batch (2026-07-21)
-- Verified live against advisors before writing:
--   * 10 unindexed FKs on hot CA money/hand tables (covering btree indexes)
--   * seven_deuce_bounties_select re-evaluates auth.uid() per row (init-plan)
--   * cashout_requests has two byte-identical partial-unique indexes
-- All tables small-to-modest (max 111k rows, hand_players empty) so plain
-- CREATE INDEX is safe inside the migration transaction (sub-second build).

BEGIN;

-- 1. Covering indexes for unindexed foreign keys (CA scope) -------------------
CREATE INDEX IF NOT EXISTS idx_agent_commissions_club_id
  ON public.agent_commissions (club_id);
CREATE INDEX IF NOT EXISTS idx_club_members_agent_id
  ON public.club_members (agent_id);
CREATE INDEX IF NOT EXISTS idx_club_wallet_transactions_club_id
  ON public.club_wallet_transactions (club_id);
CREATE INDEX IF NOT EXISTS idx_hand_players_hand_id
  ON public.hand_players (hand_id);
CREATE INDEX IF NOT EXISTS idx_hand_players_user_id
  ON public.hand_players (user_id);
CREATE INDEX IF NOT EXISTS idx_rake_records_club_id
  ON public.rake_records (club_id);
CREATE INDEX IF NOT EXISTS idx_rake_records_table_id
  ON public.rake_records (table_id);
CREATE INDEX IF NOT EXISTS idx_tables_club_id
  ON public.tables (club_id);
CREATE INDEX IF NOT EXISTS idx_tables_union_id
  ON public.tables (union_id);
CREATE INDEX IF NOT EXISTS idx_union_wallet_transactions_club_id
  ON public.union_wallet_transactions (club_id);

-- 2. RLS init-plan fix: evaluate auth.uid() once, not per row -----------------
DROP POLICY IF EXISTS seven_deuce_bounties_select ON public.seven_deuce_bounties;
CREATE POLICY seven_deuce_bounties_select ON public.seven_deuce_bounties
  FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM club_members cm
      WHERE cm.club_id = seven_deuce_bounties.club_id
        AND cm.user_id = (SELECT auth.uid())
    )
  );

-- 3. Drop the duplicate partial-unique index on cashout_requests -------------
--    Keeps cashout_requests_one_pending_per_player_uidx (identical definition).
DROP INDEX IF EXISTS public.idx_single_pending_cashout;

COMMIT;

-- Post-apply assertions -------------------------------------------------------
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_indexes WHERE schemaname='public'
      AND indexname IN ('idx_single_pending_cashout')) <> 0 THEN
    RAISE EXCEPTION 'duplicate cashout index still present';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public'
      AND tablename='seven_deuce_bounties' AND qual LIKE '%( SELECT auth.uid()%') <> 1 THEN
    RAISE EXCEPTION 'seven_deuce_bounties policy not rewritten to init-plan form';
  END IF;
  IF (SELECT count(*) FROM pg_indexes WHERE schemaname='public'
      AND indexname IN (
        'idx_agent_commissions_club_id','idx_club_members_agent_id',
        'idx_club_wallet_transactions_club_id','idx_hand_players_hand_id',
        'idx_hand_players_user_id','idx_rake_records_club_id',
        'idx_rake_records_table_id','idx_tables_club_id',
        'idx_tables_union_id','idx_union_wallet_transactions_club_id')) <> 10 THEN
    RAISE EXCEPTION 'not all 10 FK covering indexes present';
  END IF;
END $$;
