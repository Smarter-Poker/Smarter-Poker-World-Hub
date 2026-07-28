-- Mirrored from the live database on 2026-07-28. Applied via MCP as migration 20260728180053_commander_money_idempotency_keys.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.
-- ─────────────────────────────────────────────────────────────────────────────
-- Club Commander: idempotency keys on the money ledgers
--
-- Atomic increments stop two concurrent writers from losing each other's
-- arithmetic, but they do not stop the same logical transaction from landing
-- twice — a double-tapped rebuy button issues two well-formed requests and both
-- are legitimately applied. No money table has a uniqueness constraint, so
-- nothing catches it.
--
-- The column is nullable and the unique index is partial (WHERE
-- idempotency_key IS NOT NULL), so every existing row and every caller that
-- does not send a key keeps working exactly as before. Callers that do send a
-- key get at-most-once semantics: the second insert raises 23505 and the route
-- returns the original transaction with success, making a retry
-- indistinguishable from the first call.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.commander_member_comp_log     add column if not exists idempotency_key text;
alter table public.commander_time_purchases      add column if not exists idempotency_key text;
alter table public.commander_buyin_transactions  add column if not exists idempotency_key text;
alter table public.commander_cash_transactions   add column if not exists idempotency_key text;

create unique index if not exists commander_member_comp_log_idempotency_key_uidx
  on public.commander_member_comp_log (idempotency_key)
  where idempotency_key is not null;

create unique index if not exists commander_time_purchases_idempotency_key_uidx
  on public.commander_time_purchases (idempotency_key)
  where idempotency_key is not null;

create unique index if not exists commander_buyin_transactions_idempotency_key_uidx
  on public.commander_buyin_transactions (idempotency_key)
  where idempotency_key is not null;

create unique index if not exists commander_cash_transactions_idempotency_key_uidx
  on public.commander_cash_transactions (idempotency_key)
  where idempotency_key is not null;

-- ── post-condition ───────────────────────────────────────────────────────────
do $post$
declare
  v_tables text[] := array[
    'commander_member_comp_log',
    'commander_time_purchases',
    'commander_buyin_transactions',
    'commander_cash_transactions'
  ];
  v_table text;
  v_index text;
  v_def   text;
begin
  foreach v_table in array v_tables loop
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = v_table
         and column_name = 'idempotency_key' and data_type = 'text'
    ) then
      raise exception 'post-condition failed: %.idempotency_key (text) is missing', v_table;
    end if;

    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = v_table
         and column_name = 'idempotency_key' and is_nullable = 'YES'
    ) then
      raise exception 'post-condition failed: %.idempotency_key must stay nullable so un-keyed callers keep working', v_table;
    end if;

    v_index := v_table || '_idempotency_key_uidx';
    select indexdef into v_def
      from pg_indexes
     where schemaname = 'public' and tablename = v_table and indexname = v_index;

    if v_def is null then
      raise exception 'post-condition failed: index % was not created', v_index;
    end if;

    if v_def not like '%UNIQUE%' then
      raise exception 'post-condition failed: index % is not UNIQUE (%)', v_index, v_def;
    end if;

    if v_def not like '%WHERE (idempotency_key IS NOT NULL)%' then
      raise exception 'post-condition failed: index % is not partial on idempotency_key IS NOT NULL (%)', v_index, v_def;
    end if;
  end loop;

  raise notice 'commander_money_idempotency_keys: 4 nullable columns + 4 partial unique indexes present';
end
$post$;