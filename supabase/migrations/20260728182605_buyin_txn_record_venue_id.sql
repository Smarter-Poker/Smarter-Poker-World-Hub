-- Mirrored from the live database on 2026-07-28. Applied via MCP as migration 20260728182605_buyin_txn_record_venue_id.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.

-- ═══════════════════════════════════════════════════════════════════════
-- Now that commander_buyin_transactions.venue_id is bigint rather than
-- uuid, the atomic buy-in helper can record it. It previously omitted the
-- column deliberately, because inserting an integer venue id into a uuid
-- column rejected the whole row — which is why that ledger was empty.
--
-- The venue is derived from the session rather than taken as a parameter.
-- The session row is already loaded and already authoritative, so no call
-- site changes and no caller can attribute a buy-in to the wrong venue.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.commander_txn_session_buyin(
  p_session_id uuid,
  p_amount numeric,
  p_idempotency_key text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_session public.commander_player_sessions;
  v_txn     public.commander_buyin_transactions;
  v_total   integer;
begin
  if p_session_id is null then
    raise exception 'commander_txn_session_buyin: p_session_id is required' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'commander_txn_session_buyin: p_amount must be a positive number (got %)', p_amount
      using errcode = '22023';
  end if;

  select * into v_session from public.commander_player_sessions where id = p_session_id;
  if v_session.id is null then
    raise exception 'commander_txn_session_buyin: session % not found', p_session_id using errcode = 'P0002';
  end if;
  if v_session.status is distinct from 'active' then
    raise exception 'commander_txn_session_buyin: session % is not active (status %)', p_session_id, v_session.status
      using errcode = 'P0001';
  end if;

  begin
    insert into public.commander_buyin_transactions
      (session_id, player_id, venue_id, amount, transaction_type, idempotency_key)
    values
      (p_session_id, v_session.player_id, v_session.venue_id, p_amount, 'buyin', p_idempotency_key)
    returning * into v_txn;
  exception when unique_violation then
    select * into v_txn
      from public.commander_buyin_transactions
     where idempotency_key = p_idempotency_key;
    if v_txn.id is null then raise; end if;
    select * into v_session from public.commander_player_sessions where id = p_session_id;
    return jsonb_build_object(
      'replayed', true,
      'session', to_jsonb(v_session),
      'transaction', to_jsonb(v_txn),
      'new_total', v_session.total_buyin
    );
  end;

  update public.commander_player_sessions s
     set total_buyin = coalesce(s.total_buyin, 0) + round(p_amount)::integer
   where s.id = p_session_id
  returning s.total_buyin into v_total;

  if v_total < 0 then
    raise exception 'commander_txn_session_buyin: total_buyin for session % would go negative', p_session_id
      using errcode = 'P0001';
  end if;

  select * into v_session from public.commander_player_sessions where id = p_session_id;

  return jsonb_build_object(
    'replayed', false,
    'session', to_jsonb(v_session),
    'transaction', to_jsonb(v_txn),
    'new_total', v_total
  );
end
$function$;

-- CREATE OR REPLACE resets nothing about grants, but re-assert them so this
-- can never drift into being browser-callable. Naming `public` matters:
-- revoking from `anon` alone is a no-op when the grant is held by PUBLIC.
REVOKE EXECUTE ON FUNCTION public.commander_txn_session_buyin(uuid, numeric, text)
  FROM public, anon, authenticated;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.commander_txn_session_buyin(uuid,numeric,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.commander_txn_session_buyin(uuid,numeric,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'buy-in helper is browser-callable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='commander_txn_session_buyin'
      AND p.prosrc LIKE '%v_session.venue_id%') THEN
    RAISE EXCEPTION 'venue_id is still not recorded by the buy-in helper';
  END IF;
END $$;
