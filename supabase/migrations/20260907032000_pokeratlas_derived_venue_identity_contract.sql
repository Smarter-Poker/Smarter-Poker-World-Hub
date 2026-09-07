-- ============================================================================
-- PokerAtlas derived room identity + exact duplicate retirement
-- Migration: 20260907032000_pokeratlas_derived_venue_identity_contract.sql
-- ============================================================================
-- A legacy venue may carry a stale pokeratlas_slug while one of its source URL
-- fields contains the current room slug. The atomic ingest RPC now resolves all
-- five source identities under a per-room lock before its validated upsert.
-- Three audited duplicate venues and their 151 currently servable schedule rows
-- are retained but fail-closed; no source row is deleted.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $realtime_lock$
begin
  if to_regclass('realtime.subscription') is not null then
    execute 'lock table realtime.subscription in access exclusive mode';
  end if;
end
$realtime_lock$;

lock table public.poker_venues in share row exclusive mode;
lock table public.venue_daily_tournaments in share row exclusive mode;

create temporary table pnm_pa_venue_losers (
  loser_id integer primary key,
  canonical_id integer not null,
  loser_name text not null,
  loser_city text not null,
  loser_state text not null,
  loser_slug text not null,
  loser_pa_slug text not null,
  loser_pokeratlas_url text,
  loser_scrape_url text not null,
  loser_schedule_url text not null,
  loser_address text,
  loser_website text,
  loser_latitude numeric,
  loser_longitude numeric,
  loser_html_hash text,
  loser_batch_id uuid,
  loser_timestamp timestamptz,
  loser_quality text not null,
  loser_confidence text not null,
  active_schedule_count integer not null,
  active_schedule_checksum text not null
) on commit drop;

insert into pnm_pa_venue_losers values
  (3429, 1930, 'Lucky Chances', 'Colma', 'CA', 'lucky-chances',
   'lucky-chances-colma',
   'https://www.pokeratlas.com/poker-room/lucky-chances-colma/tournaments',
   'https://www.pokeratlas.com/poker-room/lucky-chances-colma/tournaments',
   'https://www.pokeratlas.com/poker-room/lucky-chances-colma/tournaments',
   null, null, null, null, null, null, null,
   'unverified', 'unverified', 20,
   'b9e073748a2872bdbc23edee78193ad8'),
  (3410, 1987, 'South Point', 'Las Vegas', 'NV', 'south-point',
   'south-point-las-vegas', null,
   'https://www.pokeratlas.com/poker-room/south-point-las-vegas/tournaments',
   'https://www.pokeratlas.com/poker-room/south-point-las-vegas/tournaments',
   null, null, null, null, null, null, null,
   'unverified', 'unverified', 115,
   '0d43c3e79742e71c8811b84949c88a32'),
  (2954, 2305, 'Mohegan Pennsylvania', 'Wilkes Barre', 'PA',
   'mohegan-pa-wilkes-barre', 'mohegan-pa-wilkes-barre',
   'https://www.pokeratlas.com/poker-room/mohegan-pa-wilkes-barre',
   'https://www.pokeratlas.com/poker-room/mohegan-pa-wilkes-barre/tournaments',
   'https://www.pokeratlas.com/poker-room/mohegan-pa-wilkes-barre/tournaments',
   '1280 Highway 315',
   'https://moheganpa.com/playing/table-games/poker.html',
   41.26801, -75.81236,
   'f3990dcb21027bf0f6fc1447b24a5f1602baaf07fe38eca1d756fff20c8f293b',
   '328af537-bf3e-4fd7-bf84-510ef8048dbe',
   '2026-04-07T21:03:42.351060Z',
   'scraped_verified', 'unverified', 16,
   '634650ff75ac3d4f0242ba33556db413');

do $preflight$
declare
  r record;
  v_count integer;
  v_checksum text;
begin
  if to_regclass('public.venue_duplicate_retirement_log') is null
     or to_regclass('public.venue_daily_tournaments') is null then
    raise exception 'pre-flight failed: venue retirement tables are missing';
  end if;
  if to_regprocedure('public.fn_pokeratlas_ingest_venues(jsonb,uuid)') is null
     or to_regprocedure('public.fn_pokeratlas_ingest_venues_slug_only_v2(jsonb,uuid)')
        is not null then
    raise exception 'pre-flight failed: atomic venue RPC version drifted';
  end if;

  if exists (
    select 1
      from pnm_pa_venue_losers expected
      left join public.poker_venues actual on actual.id = expected.loser_id
     where actual.id is null
        or actual.name is distinct from expected.loser_name
        or actual.city is distinct from expected.loser_city
        or actual.state is distinct from expected.loser_state
        or actual.country is distinct from 'US'
        or actual.slug is distinct from expected.loser_slug
        or actual.pokeratlas_slug is distinct from expected.loser_pa_slug
        or actual.pokeratlas_url is distinct from expected.loser_pokeratlas_url
        or actual.poker_atlas_url is not null
        or actual.scrape_url is distinct from expected.loser_scrape_url
        or actual.schedule_scrape_url is distinct from expected.loser_schedule_url
        or actual.address is distinct from expected.loser_address
        or actual.website is distinct from expected.loser_website
        or actual.latitude is distinct from expected.loser_latitude
        or actual.longitude is distinct from expected.loser_longitude
        or actual.scrape_html_hash is distinct from expected.loser_html_hash
        or actual.scrape_batch_id is distinct from expected.loser_batch_id
        or actual.scrape_timestamp is distinct from expected.loser_timestamp
        or actual.data_quality is distinct from expected.loser_quality
        or actual.scrape_confidence is distinct from expected.loser_confidence
        or actual.scrape_status is distinct from 'complete'
        or actual.scrape_source is distinct from 'pokeratlas'
        or actual.is_active is distinct from true
        or actual.is_suppressed is distinct from false
        or actual.canonical_venue_id is not null
        or actual.retired_at is not null
        or actual.retired_by is not null
        or actual.retired_reason is not null
  ) then
    raise exception 'pre-flight failed: duplicate venue snapshot drifted';
  end if;

  if exists (
    select 1
      from pnm_pa_venue_losers expected
      left join public.poker_venues actual on actual.id = expected.canonical_id
     where actual.id is null
        or actual.canonical_venue_id is not null
        or actual.is_active is distinct from true
        or actual.is_suppressed is distinct from false
        or actual.data_quality is distinct from 'scraped_verified'
        or actual.scrape_confidence is distinct from 'high'
  ) then
    raise exception 'pre-flight failed: canonical venue snapshot drifted';
  end if;

  if exists (
    select 1
      from pnm_pa_venue_losers expected
      join public.venue_duplicate_retirement_log audit
        on audit.retired_venue_id = expected.loser_id
        or audit.canonical_venue_id = expected.loser_id
  ) then
    raise exception 'pre-flight failed: a duplicate venue already has retirement history';
  end if;

  for r in select * from pnm_pa_venue_losers order by loser_id
  loop
    select count(*), md5(string_agg(d.id::text, ',' order by d.id::text))
      into v_count, v_checksum
      from public.venue_daily_tournaments d
     where d.venue_id = r.loser_id
       and d.is_active is true
       and d.is_suppressed is false
       and d.data_quality in (
         'scraped_verified', 'scraped_inferred', 'manual_research'
       );
    if v_count <> r.active_schedule_count
       or v_checksum is distinct from r.active_schedule_checksum then
      raise exception 'pre-flight failed: venue % schedule cohort drifted (%, %)',
        r.loser_id, v_count, v_checksum;
    end if;
  end loop;

  select count(*) into v_count
    from public.venue_daily_tournaments d
    join pnm_pa_venue_losers expected on expected.loser_id = d.venue_id
   where d.is_active is true
     and d.is_suppressed is false
     and d.data_quality in (
       'scraped_verified', 'scraped_inferred', 'manual_research'
     );
  if v_count <> 151 then
    raise exception 'pre-flight failed: expected 151 duplicate schedules, found %',
      v_count;
  end if;
end
$preflight$;

insert into public.venue_duplicate_retirement_log (
  retired_venue_id, canonical_venue_id, actor_id, reason, before_record
)
select expected.loser_id, expected.canonical_id, null,
       'Retired exact PokerAtlas source-identity duplicate; schedules quarantined without deletion.',
       to_jsonb(actual)
  from pnm_pa_venue_losers expected
  join public.poker_venues actual on actual.id = expected.loser_id;

update public.venue_daily_tournaments d
   set is_active = false,
       is_suppressed = true,
       data_quality = 'stale',
       flags = case
         when coalesce(d.flags, '[]'::jsonb)
              @> '["pnm_duplicate_venue_schedule_quarantine_20260907"]'::jsonb
           then coalesce(d.flags, '[]'::jsonb)
         else coalesce(d.flags, '[]'::jsonb)
              || '["pnm_duplicate_venue_schedule_quarantine_20260907"]'::jsonb
       end
  from pnm_pa_venue_losers expected
 where d.venue_id = expected.loser_id
   and d.is_active is true
   and d.is_suppressed is false
   and d.data_quality in (
     'scraped_verified', 'scraped_inferred', 'manual_research'
   );

update public.poker_venues actual
   set canonical_venue_id = expected.canonical_id,
       is_active = false,
       is_suppressed = true,
       retired_at = now(),
       retired_by = null,
       retired_reason =
         'Retired exact PokerAtlas source-identity duplicate; schedules quarantined without deletion.',
       location_integrity_revision = clock_timestamp()
  from pnm_pa_venue_losers expected
 where actual.id = expected.loser_id;

-- Store the source-owned room slug on canonical rows. Mohegan retains its old
-- scrape URL as a historical alias while pokeratlas_url records the rebrand.
update public.poker_venues
   set pokeratlas_slug = case id
         when 1930 then 'lucky-chances-colma'
         when 1987 then 'south-point-las-vegas'
         when 2305 then 'mohegan-pa-wilkes-barre'
       end,
       pokeratlas_url = case id
         when 2305 then 'https://www.pokeratlas.com/poker-room/mohegan-pa-wilkes-barre'
         else pokeratlas_url
       end,
       location_integrity_revision = clock_timestamp()
 where id in (1930, 1987, 2305);

do $retirement_postcondition$
declare
  v_count integer;
begin
  select count(*) into v_count
    from public.venue_daily_tournaments d
    join pnm_pa_venue_losers expected on expected.loser_id = d.venue_id
   where d.is_active is false
     and d.is_suppressed is true
     and d.data_quality = 'stale'
     and coalesce(d.flags, '[]'::jsonb)
         @> '["pnm_duplicate_venue_schedule_quarantine_20260907"]'::jsonb;
  if v_count <> 151 then
    raise exception 'duplicate venue schedule quarantine updated %, expected 151',
      v_count;
  end if;

  if exists (
    select 1
      from pnm_pa_venue_losers expected
      join public.poker_venues actual on actual.id = expected.loser_id
     where actual.canonical_venue_id is distinct from expected.canonical_id
        or actual.is_active is distinct from false
        or actual.is_suppressed is distinct from true
        or actual.retired_at is null
        or actual.retired_reason is null
  ) then
    raise exception 'post-apply failed: duplicate venue retirement is incomplete';
  end if;

  if exists (
    select 1
      from public.venue_daily_tournaments d
      join pnm_pa_venue_losers expected on expected.loser_id = d.venue_id
     where d.is_active is true
       and d.is_suppressed is false
       and d.data_quality in (
         'scraped_verified', 'scraped_inferred', 'manual_research'
       )
  ) then
    raise exception 'post-apply failed: a duplicate venue schedule remains servable';
  end if;
end
$retirement_postcondition$;

create or replace function public.pnm_pokeratlas_room_slug(p_url text)
returns text
language sql
immutable
parallel safe
strict
set search_path = pg_catalog
as $fn$
  select lower((regexp_match(
    p_url,
    '^https?://(?:www\.)?pokeratlas\.com/poker-room/([a-z0-9][a-z0-9-]*)(?:[/?#]|$)',
    'i'
  ))[1]);
$fn$;

alter function public.fn_pokeratlas_ingest_venues(jsonb, uuid)
  rename to fn_pokeratlas_ingest_venues_slug_only_v2;

revoke all on function public.fn_pokeratlas_ingest_venues_slug_only_v2(jsonb, uuid)
  from public, anon, authenticated, service_role;

create function public.fn_pokeratlas_ingest_venues(
  p_rows jsonb,
  p_batch_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
declare
  r record;
  v_match_count integer;
  v_match_id integer;
begin
  if p_batch_id is null then
    raise exception 'batch id is required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'rows must be a JSON array' using errcode = '22023';
  end if;

  -- Different batches for the same source room must resolve the legacy URL
  -- alias before either can enter the slug-only validated upsert.
  for r in
    select lower(btrim(value ->> 'pokeratlas_slug')) as room_slug
      from jsonb_array_elements(p_rows)
     order by lower(btrim(value ->> 'pokeratlas_slug'))
  loop
    if r.room_slug ~ '^[a-z0-9][a-z0-9-]*$' then
      perform pg_advisory_xact_lock(
        hashtextextended('pokeratlas-room:' || r.room_slug, 0)
      );

      select count(*), min(v.id)
        into v_match_count, v_match_id
        from public.poker_venues v
       where v.canonical_venue_id is null
         and coalesce(v.is_active, true)
         and not coalesce(v.is_suppressed, false)
         and r.room_slug = any (array[
           nullif(lower(btrim(v.pokeratlas_slug)), ''),
           public.pnm_pokeratlas_room_slug(v.pokeratlas_url),
           public.pnm_pokeratlas_room_slug(v.poker_atlas_url),
           public.pnm_pokeratlas_room_slug(v.scrape_url),
           public.pnm_pokeratlas_room_slug(v.schedule_scrape_url)
         ]);

      if v_match_count > 1 then
        raise exception 'ambiguous canonical PokerAtlas room identity: %', r.room_slug
          using errcode = '23505';
      end if;

      if v_match_count = 1 then
        update public.poker_venues
           set pokeratlas_slug = r.room_slug,
               location_integrity_revision = clock_timestamp()
         where id = v_match_id
           and lower(btrim(coalesce(pokeratlas_slug, ''))) is distinct from r.room_slug;
      end if;
    end if;
  end loop;

  -- The renamed v2 function performs the complete payload/provenance checks,
  -- exact audit replay contract, atomic insert, and postcondition verification.
  return public.fn_pokeratlas_ingest_venues_slug_only_v2(p_rows, p_batch_id);
end
$fn$;

revoke all on function public.fn_pokeratlas_ingest_venues(jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.fn_pokeratlas_ingest_venues(jsonb, uuid)
  to service_role;

revoke all on function public.pnm_pokeratlas_room_slug(text)
  from public, anon, authenticated;
grant execute on function public.pnm_pokeratlas_room_slug(text)
  to service_role;

do $rpc_postcondition$
begin
  if to_regprocedure('public.fn_pokeratlas_ingest_venues(jsonb,uuid)') is null
     or to_regprocedure('public.fn_pokeratlas_ingest_venues_slug_only_v2(jsonb,uuid)')
        is null
     or to_regprocedure('public.pnm_pokeratlas_room_slug(text)') is null then
    raise exception 'post-apply failed: derived PokerAtlas RPC contract is incomplete';
  end if;
  if public.pnm_pokeratlas_room_slug(
       'https://www.pokeratlas.com/poker-room/south-point-las-vegas/tournaments'
     ) is distinct from 'south-point-las-vegas' then
    raise exception 'post-apply failed: PokerAtlas room URL extraction drifted';
  end if;
end
$rpc_postcondition$;

commit;

-- ROLLBACK: retired venue rows and quarantined schedules are intentional audit
-- history. A forward migration may replace the wrapper only after preserving
-- URL-derived aliases and the per-room serialization contract.
