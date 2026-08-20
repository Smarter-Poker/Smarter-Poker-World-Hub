-- 2026-08-20: comment parity only. No behavioural change.
--
-- The md5 parity check between the committed migration files and
-- production pg_proc.prosrc flagged fn_union_rake_ledger_totals: the file
-- carried 2,799 characters, production 2,399+. The difference was purely
-- explanatory comments INSIDE the function body -- present in the file
-- committed as 20260821h, but stripped from the text that was hand-copied
-- into apply_migration.
--
-- Functionally identical, but it meant replaying the migration file would
-- not reproduce production byte-for-byte, which is the whole point of the
-- parity check. Resolved in the direction that keeps the documentation:
-- re-apply the commented version from 20260821h verbatim, rather than
-- deleting the comments from the file to match a less-documented
-- production.
--
-- The function body below is extracted verbatim from
-- 20260821h_union_rake_ledger_checkpoint.sql. After this migration all
-- seven functions touched in this round md5-match production exactly.
--
-- Applied to production via Supabase MCP apply_migration as
-- 'union_rake_ledger_totals_comment_parity' on 2026-08-20.

CREATE OR REPLACE FUNCTION public.fn_union_rake_ledger_totals(p_union_id uuid)
RETURNS TABLE(total_credits numeric, total_debits numeric,
              total_rows bigint, checkpoint_as_of timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_as_of  timestamptz;
  v_cr     numeric;
  v_db     numeric;
  v_rows   bigint;
  v_target timestamptz := now() - interval '1 hour';
  d_cr     numeric;
  d_db     numeric;
  d_rows   bigint;
BEGIN
  SELECT c.as_of, c.credits, c.debits, c.rows_seen
    INTO v_as_of, v_cr, v_db, v_rows
    FROM union_rake_ledger_checkpoint c WHERE c.union_id = p_union_id;
  IF NOT FOUND THEN
    v_as_of := '-infinity'::timestamptz; v_cr := 0; v_db := 0; v_rows := 0;
  END IF;

  IF v_target > v_as_of THEN
    -- Advancing the checkpoint is a pure optimization: if it fails (read-only
    -- context, lock trouble) the totals below are still exact, just computed
    -- over a longer tail.
    BEGIN
      PERFORM pg_advisory_xact_lock(
        hashtextextended('union_rake_ledger_cp:' || p_union_id::text, 42));

      -- Re-read under the lock; a concurrent caller may have advanced it.
      SELECT c.as_of, c.credits, c.debits, c.rows_seen
        INTO v_as_of, v_cr, v_db, v_rows
        FROM union_rake_ledger_checkpoint c WHERE c.union_id = p_union_id;
      IF NOT FOUND THEN
        v_as_of := '-infinity'::timestamptz; v_cr := 0; v_db := 0; v_rows := 0;
      END IF;

      IF v_target > v_as_of THEN
        SELECT COALESCE(SUM(t.amount) FILTER (WHERE t.direction = 'credit'), 0),
               COALESCE(SUM(t.amount) FILTER (WHERE t.direction = 'debit'), 0),
               COUNT(*)
          INTO d_cr, d_db, d_rows
          FROM union_wallet_transactions t
         WHERE t.union_id = p_union_id AND t.wallet = 'rake_wallet'
           AND t.created_at >= v_as_of AND t.created_at < v_target;

        INSERT INTO union_rake_ledger_checkpoint
              (union_id, as_of, credits, debits, rows_seen, last_verified_at, updated_at)
        VALUES (p_union_id, v_target, v_cr + d_cr, v_db + d_db, v_rows + d_rows, now(), now())
        ON CONFLICT (union_id) DO UPDATE
          SET as_of     = EXCLUDED.as_of,
              credits   = EXCLUDED.credits,
              debits    = EXCLUDED.debits,
              rows_seen = EXCLUDED.rows_seen,
              updated_at = now();

        -- Only adopt the advanced values after the write succeeded.
        v_as_of := v_target;
        v_cr    := v_cr + d_cr;
        v_db    := v_db + d_db;
        v_rows  := v_rows + d_rows;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;  -- best effort; fall through with the un-advanced checkpoint
    END;
  END IF;

  RETURN QUERY
  SELECT v_cr   + COALESCE(SUM(t.amount) FILTER (WHERE t.direction = 'credit'), 0),
         v_db   + COALESCE(SUM(t.amount) FILTER (WHERE t.direction = 'debit'), 0),
         v_rows + COUNT(t.*),
         v_as_of
    FROM union_wallet_transactions t
   WHERE t.union_id = p_union_id AND t.wallet = 'rake_wallet'
     AND t.created_at >= v_as_of;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_union_rake_ledger_totals(uuid)
  FROM PUBLIC, anon, authenticated;
