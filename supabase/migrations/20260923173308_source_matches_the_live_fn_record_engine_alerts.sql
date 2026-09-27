-- Source mirror for fn_record_engine_alerts, the engine alert intake function.
--
-- This migration is a no-op against production as it stands today, and it was
-- deliberately not applied. It exists so that a replay of this repository can
-- no longer revert live.
--
-- WHAT WAS MEASURED
--
-- On 2026-09-23 the installed definition was read with pg_get_functiondef on
-- project kuklfnapbkmacvwxktbh. It is 4341 bytes and its md5 is
-- 3b97b07170b81947137ee2adfc268717. The CREATE OR REPLACE FUNCTION below is
-- that definition reproduced byte for byte. The file was assembled from the
-- pg_get_functiondef output itself rather than retyped, and the assembled
-- bytes were hash checked against the live hash before this file was saved.
--
-- THE DIVERGENCE THIS CLOSES
--
-- The only source for fn_record_engine_alerts in this repository is
-- 20260913170312_engine_alert_delivery_receipts.sql, and it is stale. The
-- signature is unchanged, fn_record_engine_alerts(p_alerts jsonb) in both, so
-- a replay of the stale file would genuinely replace the live function rather
-- than sit beside it as a second overload. Production would silently lose
-- work.
--
-- What live has and the repository does not is the duplicate-event branch
-- calling into the operational source intake:
--
--   perform operational_source_intake.record_engine(v_existing_row,'replay');
--
-- That call sits on the path taken when an alert arrives carrying an
-- engine_alert_event_id that already has a delivery receipt, immediately after
-- the existing public.engine_alerts row is locked FOR UPDATE. The repository
-- file contains no occurrence of operational_source_intake anywhere. Replaying
-- it would therefore leave the function looking correct while quietly ceasing
-- to record replayed engine alerts into the intake, and nothing would raise.
--
-- The grant posture is not part of this drift. The live ACL is
-- postgres=X/postgres and service_role=X/postgres, which is what the stale
-- file already sets by revoking from public, anon and authenticated and
-- granting to service_role. Only the body diverges.
--
-- UNMIRRORED DEPENDENCY
--
-- The schema operational_source_intake exists in production, carrying two
-- relations and eight functions, but no file under supabase/migrations
-- mentions it at all. It has no source in this repository. This migration does
-- not attempt to mirror that schema; doing so is a much larger piece of work
-- and is recorded here as an open gap rather than guessed at.
--
-- The practical consequence for a fresh environment: the CREATE OR REPLACE
-- below will succeed even when the schema is missing, because PostgreSQL does
-- not resolve names inside a plpgsql body at creation time. The function will
-- then fail at runtime, but only on the duplicate-event branch, the first time
-- an alert replays. A fresh environment needs operational_source_intake built
-- by some other means before this function is whole.
--
-- Note also that this function runs with search_path set to pg_catalog, so
-- every application object in the body is schema qualified. That is live
-- behaviour and is reproduced here unchanged.
--
-- WHY THIS FILE IS A NO-OP
--
-- The definition below is the definition production already carries. The
-- preflight reads the installed md5, finds it equal to the expected hash, says
-- so, and returns without replacing anything. Re-running is safe for the same
-- reason. Applying a no-op buys nothing and carries risk, which is why this
-- file was written and hash verified but not pushed.
--
-- The value is in the ordering. This file sorts after
-- 20260913170312_engine_alert_delivery_receipts.sql, so a replay of the
-- repository no longer ends with production on the stale definition. It ends
-- here, and this file either installs the live definition when the function is
-- absent, or refuses outright when some other body is installed.
--
-- TIER:        2. No-op against production.
-- AFFECTS:     public.fn_record_engine_alerts(jsonb) only. No grant, table,
--              policy or row is changed.
-- IRREVERSIBLE: no
-- APPLIED:     no. Written and hash verified on 2026-09-23, not pushed.

DO $migration$
DECLARE
  v_signature text := 'public.fn_record_engine_alerts(jsonb)';
  v_expected  text := '3b97b07170b81947137ee2adfc268717';
  v_target    regprocedure;
  v_current   text;
BEGIN
  v_target := to_regprocedure(v_signature);

  IF v_target IS NOT NULL THEN
    v_current := md5(pg_get_functiondef(v_target::oid));
  END IF;

  IF v_current = v_expected THEN
    RAISE NOTICE 'Nothing to do: % already carries the mirrored definition (md5 %).',
      v_signature, v_current;
    RETURN;
  END IF;

  IF v_current IS NOT NULL THEN
    RAISE EXCEPTION 'Refusing to apply: % has md5 %, expected %. This file mirrors the definition production carried when it was written, so a different hash means the function changed after that. Read the current definition, compare it with the CREATE OR REPLACE below, and decide deliberately before replacing a money-path function.',
      v_signature, v_current, v_expected;
  END IF;

  EXECUTE $create$
CREATE OR REPLACE FUNCTION public.fn_record_engine_alerts(p_alerts jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_alert jsonb;
  v_event_id uuid;
  v_existing public.engine_alert_delivery_receipts%rowtype;
  v_id bigint;
  v_existing_row public.engine_alerts%rowtype;
  v_lock_key bigint;
  v_receipts jsonb := '[]'::jsonb;
begin
  if p_alerts is null or jsonb_typeof(p_alerts) <> 'array'
     or jsonb_array_length(p_alerts) > 200 or pg_column_size(p_alerts) > 262144 then
    raise exception using errcode = '22023', message = 'Malformed engine alert batch';
  end if;
  -- Validate every member before any insert. The whole function is atomic,
  -- including later cast errors or a producer-ID collision within this batch.
  for v_alert in select value from jsonb_array_elements(p_alerts) loop
    if jsonb_typeof(v_alert) <> 'object'
       or jsonb_typeof(v_alert->'labels') is distinct from 'object'
       or jsonb_typeof(v_alert->'labels'->'alertname') is distinct from 'string'
       or btrim(v_alert->'labels'->>'alertname') = ''
       or (v_alert->>'status') is null or (v_alert->>'status') not in ('firing', 'resolved') then
      raise exception using errcode = '22023', message = 'Malformed engine alert';
    end if;
    if (v_alert->'labels') ? 'engine_alert_event_id' and
       (jsonb_typeof(v_alert->'labels'->'engine_alert_event_id') is distinct from 'string'
        or (v_alert->'labels'->>'engine_alert_event_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
      raise exception using errcode = '22023', message = 'Malformed engine event ID';
    end if;
  end loop;
  -- Lock in a consistent order for overlapping/reversed multi-alert batches.
  -- Serializing the missing-row case prevents concurrent retries from creating
  -- an orphan engine_alerts row before the unique receipt becomes visible.
  for v_lock_key in
    select distinct hashtextextended('engine-alert-event:' || (value->'labels'->>'engine_alert_event_id')::uuid::text, 0)
    from jsonb_array_elements(p_alerts)
    where (value->'labels') ? 'engine_alert_event_id'
    order by 1
  loop
    perform pg_advisory_xact_lock(v_lock_key);
  end loop;

  for v_alert in select value from jsonb_array_elements(p_alerts) loop
    v_event_id := (v_alert->'labels'->>'engine_alert_event_id')::uuid;
    if v_event_id is not null then
      select * into v_existing from public.engine_alert_delivery_receipts where event_id = v_event_id;
      if found then
        if v_existing.payload is distinct from v_alert then
          raise exception using errcode = '23505', message = 'Engine event ID already belongs to different payload';
        end if;
        -- An old producer receipt alone is not an inbox acknowledgement.
        select * into strict v_existing_row from public.engine_alerts
          where id = v_existing.engine_alert_id for update;
        perform operational_source_intake.record_engine(v_existing_row,'replay');
        v_receipts := v_receipts || jsonb_build_array(jsonb_build_object('id', v_existing.engine_alert_id, 'event_id', v_event_id));
        continue;
      end if;
    end if;

    insert into public.engine_alerts
      (fingerprint, alertname, severity, component, status, summary, description,
       labels, starts_at, ends_at, notified_via)
    values
      (coalesce(nullif(v_alert->>'fingerprint', ''), (v_alert->'labels'->>'alertname') || '-' || coalesce(v_alert->>'startsAt', '')),
       v_alert->'labels'->>'alertname', coalesce(nullif(v_alert->'labels'->>'severity', ''), 'unknown'),
       v_alert->'labels'->>'component', v_alert->>'status',
       v_alert->'annotations'->>'summary', v_alert->'annotations'->>'description',
       v_alert->'labels', nullif(v_alert->>'startsAt', '')::timestamptz,
       case when v_alert->>'endsAt' like '0001%' then null else nullif(v_alert->>'endsAt', '')::timestamptz end,
       array['codex-inbox']) returning id into v_id;
    if v_event_id is not null then
      insert into public.engine_alert_delivery_receipts(event_id, engine_alert_id, payload)
        values(v_event_id, v_id, v_alert);
    end if;
    v_receipts := v_receipts || jsonb_build_array(jsonb_build_object('id', v_id, 'event_id', v_event_id));
  end loop;
  return v_receipts;
end;
$function$
  $create$;

  v_target := to_regprocedure(v_signature);
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'Post-apply verification failed: % does not exist after the replacement ran.', v_signature;
  END IF;

  v_current := md5(pg_get_functiondef(v_target::oid));
  IF v_current IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'Post-apply verification failed: % has md5 %, expected %. The replacement did not reproduce the mirrored definition.',
      v_signature, v_current, v_expected;
  END IF;

  RAISE NOTICE '% installed from source. Post-migration md5 %.', v_signature, v_current;
END
$migration$;
