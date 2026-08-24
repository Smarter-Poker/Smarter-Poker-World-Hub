-- fn_bbj_credited_report gated on auth.uid() alone. The only caller in the
-- product is pages/api/club-arena/union-wallet.js (get_bbj_detail), which uses
-- supabaseAdmin on the service-role key -- auth.uid() is null there, so the
-- guard returned early and `creditedBy` was ALWAYS []. The route has already
-- run verifyUnionLead(token, unionId) before it calls this.
--
-- Body unchanged. Only the guard is repointed at fn_union_report_caller_ok,
-- which accepts service_role OR a union owner/admin JWT -- so the direct
-- authenticated path keeps exactly the authorisation it had.
--
-- NOTE: superseded within minutes by 20260824171551, which fixes the
-- SUM(bigint)->numeric return-type defect this migration exposed. Kept in the
-- history because it is what was actually applied.
CREATE OR REPLACE FUNCTION public.fn_bbj_credited_report(
  p_union_id uuid,
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 100
)
RETURNS TABLE(
  user_id uuid, username text, club_id uuid, club_name text,
  agent_id uuid, agent_name text, bbj_amount numeric, main_amount numeric,
  backup_amount numeric, promo_amount numeric, hands bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NOT public.fn_union_report_caller_ok(p_union_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH scope AS (
    SELECT uc.club_id AS cid FROM union_clubs uc WHERE uc.union_id = p_union_id
    UNION SELECT p_union_id
  ), agg AS (
    SELECT d.user_id, d.club_id,
           SUM(d.bbj_amount)    AS bbj,
           SUM(d.main_amount)   AS m,
           SUM(d.backup_amount) AS bk,
           SUM(d.promo_amount)  AS pr,
           SUM(d.hands)         AS h
      FROM bbj_daily_user d
      JOIN scope s ON s.cid = d.club_id
     WHERE d.day >= (now()::date - GREATEST(COALESCE(p_days, 7), 1))
     GROUP BY d.user_id, d.club_id
  )
  SELECT a.user_id,
         COALESCE(p.username, 'Player')::text,
         a.club_id,
         COALESCE(c.name, 'Club')::text,
         cm.agent_id,
         COALESCE(ap.username, NULL)::text,
         round(a.bbj, 2), round(a.m, 2), round(a.bk, 2), round(a.pr, 2), a.h
    FROM agg a
    LEFT JOIN profiles p  ON p.id = a.user_id
    LEFT JOIN clubs    c  ON c.id = a.club_id
    LEFT JOIN club_members cm ON cm.club_id = a.club_id AND cm.user_id = a.user_id
    LEFT JOIN profiles ap ON ap.id = cm.agent_id
   ORDER BY a.bbj DESC
   LIMIT GREATEST(COALESCE(p_limit, 100), 1);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_bbj_credited_report(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_bbj_credited_report(uuid, integer, integer) TO authenticated, service_role;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.fn_bbj_credited_report(uuid,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_bbj_credited_report is executable by anon';
  END IF;
END $$;
