-- ═══════════════════════════════════════════════════════════════════════
-- 20260822093000_commander_txn_tournament_link.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2                              (1 = doc-only, 2 = additive, 3 = destructive)
-- AUTHOR:      Claude (Cowork), Wave D financial and compliance
-- AFFECTS:     rpcs: public.commander_txn_tournament_rebuy,
--                    public.commander_txn_tournament_addon
--              tables: none (column already exists)  rls: none  triggers: none
-- IRREVERSIBLE: no
--
-- WHY:
--   Both RPCs already RECEIVE p_tournament_id and both write a row into
--   commander_cash_transactions, but neither puts the tournament id ON that
--   row. Verified against the live function bodies 2026-08-20: the insert
--   column list is
--       (venue_id, player_name, type, amount, payment_method,
--        processed_by, notes, idempotency_key)
--   with the entry id smuggled into the notes string as
--       'Tournament Rebuy: NAME (ID: <entry uuid>)'.
--
--   commander_cash_transactions.tournament_id exists (registration writes it),
--   so every rebuy and add-on in the drawer is unlinked money. Verified in
--   production: SELECT count(*) FILTER (WHERE tournament_id IS NOT NULL) over
--   commander_cash_transactions returned 0 for every type.
--
--   The consequence is that the per-tournament cash drawer reconciliation
--   (GET /api/commander/tournaments/:id/reconciliation) has to recover those
--   rows by parsing the entry uuid out of a free-text notes column. That works,
--   but a notes string is not a foreign key: it breaks the moment anybody
--   edits a note, and it forces a full drawer sweep over the event window on
--   every report. Fixing it at source is one line per function.
--
--   NOTHING IS BACKFILLED. Existing unlinked rows keep tournament_id NULL and
--   the reconciliation endpoint keeps its notes fallback for them.
--
-- HOW (high level):
--   - CREATE OR REPLACE both functions with byte-identical logic except for
--     `tournament_id` added to the ledger INSERT column list and
--     `p_tournament_id` added to the VALUES list.
--   - Signatures are unchanged, so this REPLACES the existing functions rather
--     than creating an overload. The post-apply assertions check exactly that.
--
-- See .agent/workflows/migration-safety.md for the full protocol.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. PRE-FLIGHT ASSERTIONS ─────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'commander_cash_transactions'
          AND column_name = 'tournament_id'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: commander_cash_transactions.tournament_id does not exist';
    END IF;

    -- Exactly one overload of each, or CREATE OR REPLACE below could silently
    -- leave a stale second version that callers still resolve to.
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'commander_txn_tournament_rebuy') <> 1 THEN
        RAISE EXCEPTION 'pre-flight failed: expected exactly one commander_txn_tournament_rebuy';
    END IF;

    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'commander_txn_tournament_addon') <> 1 THEN
        RAISE EXCEPTION 'pre-flight failed: expected exactly one commander_txn_tournament_addon';
    END IF;

    -- 'buy_in' must still be a legal type value or both inserts break.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.commander_cash_transactions'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%buy\_in%'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: commander_cash_transactions type CHECK no longer allows buy_in';
    END IF;
END $$;

-- ─── 2. THE ACTUAL CHANGES ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.commander_txn_tournament_rebuy(
    p_entry_id uuid,
    p_tournament_id uuid,
    p_chips integer,
    p_max_rebuys integer,
    p_level integer DEFAULT 0,
    p_venue_id integer DEFAULT NULL::integer,
    p_amount numeric DEFAULT 0,
    p_player_name text DEFAULT NULL::text,
    p_processed_by uuid DEFAULT NULL::uuid,
    p_idempotency_key text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
declare
  v_entry public.commander_tournament_entries;
  v_txn   public.commander_cash_transactions;
begin
  if p_entry_id is null or p_tournament_id is null then
    raise exception 'commander_txn_tournament_rebuy: p_entry_id and p_tournament_id are required'
      using errcode = '22023';
  end if;
  if p_chips is null or p_chips <= 0 then
    raise exception 'commander_txn_tournament_rebuy: p_chips must be positive (got %)', p_chips
      using errcode = '22023';
  end if;

  if coalesce(p_amount, 0) > 0 then
    begin
      -- 2026-08-22: tournament_id added. Without it every rebuy in the drawer
      -- was unlinked money and the reconciliation report had to parse the
      -- entry id back out of the notes string.
      insert into public.commander_cash_transactions
        (venue_id, tournament_id, player_name, type, amount, payment_method, processed_by, notes, idempotency_key)
      values
        (p_venue_id, p_tournament_id, coalesce(p_player_name, 'Unknown'), 'buy_in', p_amount, 'cash', p_processed_by,
         'Tournament Rebuy: ' || coalesce(p_player_name, 'Unknown') || ' (ID: ' || p_entry_id::text || ')',
         p_idempotency_key)
      returning * into v_txn;
    exception when unique_violation then
      select * into v_txn from public.commander_cash_transactions where idempotency_key = p_idempotency_key;
      if v_txn.id is null then raise; end if;
      select * into v_entry from public.commander_tournament_entries where id = p_entry_id;
      return jsonb_build_object('replayed', true, 'entry', to_jsonb(v_entry), 'transaction', to_jsonb(v_txn));
    end;
  end if;

  update public.commander_tournament_entries e
     set current_chips = coalesce(e.current_chips, 0) + p_chips,
         rebuy_count   = coalesce(e.rebuy_count, 0) + 1,
         status        = 'active',
         metadata      = coalesce(e.metadata, '{}'::jsonb)
                         || jsonb_build_object('last_rebuy_at', now(), 'last_rebuy_level', p_level)
   where e.id = p_entry_id
     and e.tournament_id = p_tournament_id
     and e.status is distinct from 'eliminated'
     and coalesce(e.rebuy_count, 0) < coalesce(p_max_rebuys, 999)
  returning e.* into v_entry;

  if v_entry.id is null then
    -- Nothing was updated. Say which precondition failed rather than returning a
    -- silent success, and roll the ledger insert back with the exception.
    select * into v_entry from public.commander_tournament_entries
     where id = p_entry_id and tournament_id = p_tournament_id;
    if v_entry.id is null then
      raise exception 'commander_txn_tournament_rebuy: entry % not found in tournament %', p_entry_id, p_tournament_id
        using errcode = 'P0002';
    elsif v_entry.status = 'eliminated' then
      raise exception 'commander_txn_tournament_rebuy: entry % is eliminated', p_entry_id using errcode = 'P0001';
    else
      raise exception 'commander_txn_tournament_rebuy: entry % has reached the maximum of % rebuys',
        p_entry_id, coalesce(p_max_rebuys, 999) using errcode = 'P0001';
    end if;
  end if;

  return jsonb_build_object('replayed', false, 'entry', to_jsonb(v_entry), 'transaction', to_jsonb(v_txn));
end
$fn$;

CREATE OR REPLACE FUNCTION public.commander_txn_tournament_addon(
    p_entry_id uuid,
    p_tournament_id uuid,
    p_chips integer,
    p_venue_id integer DEFAULT NULL::integer,
    p_amount numeric DEFAULT 0,
    p_player_name text DEFAULT NULL::text,
    p_processed_by uuid DEFAULT NULL::uuid,
    p_idempotency_key text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
declare
  v_entry public.commander_tournament_entries;
  v_txn   public.commander_cash_transactions;
begin
  if p_entry_id is null or p_tournament_id is null then
    raise exception 'commander_txn_tournament_addon: p_entry_id and p_tournament_id are required'
      using errcode = '22023';
  end if;
  if p_chips is null or p_chips <= 0 then
    raise exception 'commander_txn_tournament_addon: p_chips must be positive (got %)', p_chips
      using errcode = '22023';
  end if;

  if coalesce(p_amount, 0) > 0 then
    begin
      -- 2026-08-22: tournament_id added, same reason as the rebuy RPC above.
      insert into public.commander_cash_transactions
        (venue_id, tournament_id, player_name, type, amount, payment_method, processed_by, notes, idempotency_key)
      values
        (p_venue_id, p_tournament_id, coalesce(p_player_name, 'Unknown'), 'buy_in', p_amount, 'cash', p_processed_by,
         'Tournament Add-on: ' || coalesce(p_player_name, 'Unknown') || ' (ID: ' || p_entry_id::text || ')',
         p_idempotency_key)
      returning * into v_txn;
    exception when unique_violation then
      select * into v_txn from public.commander_cash_transactions where idempotency_key = p_idempotency_key;
      if v_txn.id is null then raise; end if;
      select * into v_entry from public.commander_tournament_entries where id = p_entry_id;
      return jsonb_build_object('replayed', true, 'entry', to_jsonb(v_entry), 'transaction', to_jsonb(v_txn));
    end;
  end if;

  update public.commander_tournament_entries e
     set current_chips = coalesce(e.current_chips, 0) + p_chips,
         addon_taken   = true,
         metadata      = coalesce(e.metadata, '{}'::jsonb) || jsonb_build_object('addon_at', now())
   where e.id = p_entry_id
     and e.tournament_id = p_tournament_id
     and e.status in ('active', 'seated')
     and coalesce(e.addon_taken, false) = false
  returning e.* into v_entry;

  if v_entry.id is null then
    select * into v_entry from public.commander_tournament_entries
     where id = p_entry_id and tournament_id = p_tournament_id;
    if v_entry.id is null then
      raise exception 'commander_txn_tournament_addon: entry % not found in tournament %', p_entry_id, p_tournament_id
        using errcode = 'P0002';
    elsif coalesce(v_entry.addon_taken, false) then
      raise exception 'commander_txn_tournament_addon: entry % has already taken their add-on', p_entry_id
        using errcode = 'P0001';
    else
      raise exception 'commander_txn_tournament_addon: entry % must be active to take an add-on (status %)',
        p_entry_id, v_entry.status using errcode = 'P0001';
    end if;
  end if;

  return jsonb_build_object('replayed', false, 'entry', to_jsonb(v_entry), 'transaction', to_jsonb(v_txn));
end
$fn$;

-- ─── 3. POST-APPLY ASSERTIONS ─────────────────────────────────────────
DO $$
DECLARE
    v_def text;
BEGIN
    -- Still exactly one of each: a signature typo would have created an
    -- overload instead of replacing, and callers would keep hitting the old one.
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'commander_txn_tournament_rebuy') <> 1 THEN
        RAISE EXCEPTION 'post-apply failed: commander_txn_tournament_rebuy was overloaded, not replaced';
    END IF;

    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'commander_txn_tournament_addon') <> 1 THEN
        RAISE EXCEPTION 'post-apply failed: commander_txn_tournament_addon was overloaded, not replaced';
    END IF;

    SELECT pg_get_functiondef(p.oid) INTO v_def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'commander_txn_tournament_rebuy';
    IF v_def IS NULL OR v_def NOT LIKE '%venue_id, tournament_id, player_name%' THEN
        RAISE EXCEPTION 'post-apply failed: rebuy RPC still does not write tournament_id';
    END IF;
    IF v_def NOT LIKE '%SECURITY DEFINER%' THEN
        RAISE EXCEPTION 'post-apply failed: rebuy RPC lost SECURITY DEFINER';
    END IF;

    SELECT pg_get_functiondef(p.oid) INTO v_def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'commander_txn_tournament_addon';
    IF v_def IS NULL OR v_def NOT LIKE '%venue_id, tournament_id, player_name%' THEN
        RAISE EXCEPTION 'post-apply failed: addon RPC still does not write tournament_id';
    END IF;
    IF v_def NOT LIKE '%SECURITY DEFINER%' THEN
        RAISE EXCEPTION 'post-apply failed: addon RPC lost SECURITY DEFINER';
    END IF;
END $$;

-- ─── 4. SCHEMA-CACHE RELOAD ───────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (paste into a NEW _revert_commander_txn_tournament_link.sql)
-- ═══════════════════════════════════════════════════════════════════════
-- The revert is the identical pair of CREATE OR REPLACE statements with
-- `tournament_id` removed from the INSERT column list and `p_tournament_id`
-- removed from the VALUES list of each ledger insert. Nothing else changes,
-- no data is touched, and no column is dropped, so the revert is safe to run
-- at any time. Follow it with NOTIFY pgrst, 'reload schema';
