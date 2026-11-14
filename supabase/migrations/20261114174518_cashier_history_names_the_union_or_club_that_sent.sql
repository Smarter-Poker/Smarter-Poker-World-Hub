-- 20261114174518_cashier_history_names_the_union_or_club_that_sent
--
-- TIER 2: one read-only naming helper and guarded patches of the three
-- cashier history feeds and the cashier statement. No wallet, ledger or
-- transaction row is written by this migration.
--
-- WHY: Dan, 2026-11-14 10:13 Central, on a receipt reading "TRANSFER: A Member
-- To MeepMeep", "ENTRY: Promo Disbursement": "WHAT WAS THIS, AND WHY WAS IT
-- RANDOMLY SENT TO THIS PLAYER?" It was the Midway Union's Welcome Back Chips
-- (chip_transactions 07ddbdc4-701f-47cb-9fd4-7d89b9c62a91). The cashier
-- history feeds name the sender from the sender's profile; a union or club
-- payment has no sender profile (from_user_id is NULL), so from_name came back
-- NULL and the Club Arena client printed its fallback, "A Member". 11:35
-- Central: "GO AHEAD AND FULLY BUILD, FIX AND ENHANCE ALL OF THESE".
--
-- WHAT CHANGES (names only, display data):
--   fn_ca_transaction_party_name(side, type, metadata, club, notes) names the
--   non-person party of a chip transaction:
--     * a promo disbursement's sender: the union or club named by its
--       source_id, with the program from its note, e.g.
--       "Midway Union (Welcome Back Chips)";
--     * a union send's sender: the union;
--     * any other row without a sender profile: the club itself (club bank
--       sends a viewer may not attribute to a staff member keep that privacy:
--       the club is named, never the staff member);
--     * a promo disbursement or union promo landing in a club: that club.
--   fn_cashier_history_feed, fn_cashier_history_page and
--   fn_cashier_transaction_history fall back to it where from_name / to_name
--   were NULL; fn_cashier_statement_rows falls back to the union or club name
--   for a non-profile from/to id. Every person-named row is unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION public.fn_ca_transaction_party_name(p_side text, p_type text, p_metadata jsonb, p_club_id uuid, p_notes text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH base AS (
    SELECT CASE
      WHEN p_side = 'from' AND p_type = 'promo_disbursement' THEN
        CASE WHEN p_metadata ->> 'source_kind' = 'union'
             THEN (SELECT u.name FROM public.unions u WHERE u.id::text = p_metadata ->> 'source_id')
             ELSE (SELECT c.name FROM public.clubs c WHERE c.id::text = p_metadata ->> 'source_id') END
      WHEN p_side = 'from' AND p_type IN ('union_promo_send', 'union_promo_to_club', 'union_member_send', 'union_transfer',
                                          'union_transfer_reversal', 'union_clawback', 'union_promo_clawback') THEN
        (SELECT u.name FROM public.unions u WHERE u.id::text = COALESCE(p_metadata ->> 'union_id', p_metadata ->> 'source_id'))
      WHEN p_side = 'to' AND p_type = 'promo_disbursement' AND p_metadata ->> 'target_kind' = 'club' THEN
        (SELECT c.name FROM public.clubs c WHERE c.id::text = p_metadata ->> 'target_id')
      WHEN p_side = 'to' AND p_type = 'union_promo_to_club' THEN
        (SELECT c.name FROM public.clubs c WHERE c.id = p_club_id)
      WHEN p_side = 'from' THEN
        (SELECT c.name FROM public.clubs c WHERE c.id = p_club_id)
    END AS name
  ), program AS (
    SELECT NULLIF(btrim(split_part(split_part(COALESCE(p_notes, ''), ' - ', 1), ':', 1)), '') AS p
  )
  SELECT CASE
           WHEN base.name IS NULL THEN NULL
           WHEN p_side = 'from' AND p_type = 'promo_disbursement' AND program.p IS NOT NULL
                AND program.p <> 'Promo Disbursement' AND program.p NOT ILIKE 'promo disbursed%'
             THEN base.name || ' (' || program.p || ')'
           ELSE base.name
         END
    FROM base, program;
$function$;

REVOKE ALL ON FUNCTION public.fn_ca_transaction_party_name(text, text, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_ca_transaction_party_name(text, text, jsonb, uuid, text) IS
  'Names the union or club party of a chip transaction with no person on that side, e.g. "Midway Union (Welcome Back Chips)" (Dan, 2026-11-14: receipts said "A Member").';

DO $patch$
DECLARE
  fn text;
  original text;
  updated text;
  from_old text := $o$THEN public.fn_arena_name(pf.alias, pf.username, pf.display_name, pf.first_name, pf.last_name, pf.full_name) END,$o$;
  from_new text := $n$THEN public.fn_arena_name(pf.alias, pf.username, pf.display_name, pf.first_name, pf.last_name, pf.full_name)
                ELSE public.fn_ca_transaction_party_name('from', ct.transaction_type, ct.metadata, ct.club_id, ct.notes) END,$n$;
  to_old text := $o$CASE WHEN pt.id IS NOT NULL THEN public.fn_arena_name(pt.alias, pt.username, pt.display_name, pt.first_name, pt.last_name, pt.full_name) END$o$;
  to_new text := $n$CASE WHEN pt.id IS NOT NULL THEN public.fn_arena_name(pt.alias, pt.username, pt.display_name, pt.first_name, pt.last_name, pt.full_name)
                ELSE public.fn_ca_transaction_party_name('to', ct.transaction_type, ct.metadata, ct.club_id, ct.notes) END$n$;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.fn_cashier_history_feed(uuid, text, text, timestamptz, timestamptz, uuid, text, timestamptz, uuid, integer)',
    'public.fn_cashier_history_page(uuid, text, text, timestamptz, timestamptz, integer, integer)',
    'public.fn_cashier_transaction_history(uuid, text, integer, integer)'] LOOP
    original := pg_get_functiondef(fn::regprocedure);
    IF position(from_old IN original) = 0 OR position(to_old IN original) = 0 THEN
      RAISE EXCEPTION '% predecessor changed: name expressions not found', fn;
    END IF;
    updated := replace(replace(original, from_old, from_new), to_old, to_new);
    EXECUTE updated;
  END LOOP;

  original := pg_get_functiondef('public.fn_cashier_statement_rows(uuid, uuid, text, timestamptz, timestamptz, jsonb, timestamptz, text, uuid, integer)'::regprocedure);
  updated := replace(original,
    $o$ELSE p.from_ledger_label END AS from_label$o$,
    $n$ELSE COALESCE(p.from_ledger_label,
                               (SELECT un.name FROM public.unions un WHERE un.id = p.from_id),
                               (SELECT cb.name FROM public.clubs cb WHERE cb.id = p.from_id)) END AS from_label$n$);
  IF updated = original THEN RAISE EXCEPTION 'statement predecessor changed: from_label not found'; END IF;
  original := updated;
  updated := replace(original,
    $o$ELSE p.to_ledger_label END AS to_label$o$,
    $n$ELSE COALESCE(p.to_ledger_label,
                               (SELECT un.name FROM public.unions un WHERE un.id = p.to_id),
                               (SELECT cb.name FROM public.clubs cb WHERE cb.id = p.to_id)) END AS to_label$n$);
  IF updated = original THEN RAISE EXCEPTION 'statement predecessor changed: to_label not found'; END IF;
  EXECUTE updated;
END $patch$;

DO $verify$
DECLARE n text;
BEGIN
  SELECT public.fn_ca_transaction_party_name('from', ct.transaction_type, ct.metadata, ct.club_id, ct.notes) INTO n
    FROM public.chip_transactions ct WHERE ct.id = '07ddbdc4-701f-47cb-9fd4-7d89b9c62a91';
  IF n IS DISTINCT FROM 'Midway Union (Welcome Back Chips)' THEN
    RAISE EXCEPTION 'MeepMeep''s receipt sender reads %, expected Midway Union (Welcome Back Chips)', n;
  END IF;
  IF has_function_privilege('anon', 'public.fn_ca_transaction_party_name(text, text, jsonb, uuid, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_ca_transaction_party_name(text, text, jsonb, uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'naming helper is executable by a client role';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_cashier_history_feed(uuid, text, text, timestamptz, timestamptz, uuid, text, timestamptz, uuid, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'history feed lost its authenticated grant';
  END IF;
END $verify$;

COMMIT;
