-- ============================================================================
-- Poker Near Me public event-text quarantine
-- Migration: 20260907022000_pnm_public_event_text_quarantine.sql
-- ============================================================================
-- A full read-only scan of every currently servable poker_events and
-- tour_stop_events row found nine exact parser or promotion fragments. Keep
-- the source rows for audit, but remove them from quality-gated public APIs.

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

do $preflight$
begin
  if to_regclass('public.poker_events') is null
     or to_regclass('public.tour_stop_events') is null then
    raise exception 'pre-flight failed: Poker Near Me event tables are missing';
  end if;

  -- Runtime-generated rows may not exist in a fresh database. If an audited
  -- ID does exist, require its full text identity before changing its quality.
  if exists (
    with expected(id, event_uid, series_uid, event_name) as (
      values
        ('04b674e4-b5b2-413b-938e-da0420ccfab9'::uuid, '2627_html_e1_ba12a279', '2627', '$5,000 Cash --> Earn &#038; Get April 1 - 18 Durant Earn Tickets t'),
        ('051ea095-d9d5-4e5b-bb43-cf94cfe8d85e'::uuid, '2626_html_e2_a464b016', '2626', '$200 Buy-In. 20,000 in Starting Chips - No Limit Texas Hold&#x27'),
        ('061df441-5b19-43b8-b678-2c2c2925a1a4'::uuid, '2692_html_e1_93b163f5', '2692', '$10 Optional Staff Add-On Spots are limited, don&rsquo;t miss y'),
        ('0e25566b-f105-4c97-b03c-ed7c10fe080c'::uuid, '2626_html_e3_21cfe069', '2626', '$250 Buy-In. 20,000 in Starting Chips - No Limit Texas Hold&#x27'),
        ('7a1b58b5-a483-4de7-9b5a-1fdc3b373a98'::uuid, '2626_html_e3_b2642880', '2626', '$200 Buy in. 25,000 in Starting Chips - No Limit Texas Hold&#x27'),
        ('9ef50488-598f-40c4-a1a6-539ece5798ec'::uuid, '2712_html_e10_534371b7', '2712', '><div class=')
    )
    select 1
      from public.poker_events actual
      join expected using (id)
     where actual.event_uid is distinct from expected.event_uid
        or actual.series_uid is distinct from expected.series_uid
        or actual.event_name is distinct from expected.event_name
  ) then
    raise exception 'pre-flight failed: audited poker_events identity drifted';
  end if;

  if exists (
    with expected(id, tour_code, source_url, event_name) as (
      values
        ('10838483-6ea5-4fdf-8b43-3e6a7a20069c'::uuid, 'MSPT', 'https://msptpoker.com/', 'MSPT Festival ' || chr(8211) || ' TBD Guarantee&nbsp; <a href="/'),
        ('6e1b5eac-679d-43f7-9834-d1c5b0386153'::uuid, 'MSPT', 'https://msptpoker.com/', 'MSPT Festival ' || chr(8211) || ' TBD Guarantee&nbsp; <a href="/'),
        ('72546d3c-20ad-4038-b53a-7dd8c997edd9'::uuid, 'GCPT', 'https://gulfcoastpoker.net/7-clans/schedule/', '$5,000 GTD | &lt;')
    )
    select 1
      from public.tour_stop_events actual
      join expected using (id)
     where actual.tour_code is distinct from expected.tour_code
        or actual.source_url is distinct from expected.source_url
        or actual.event_name is distinct from expected.event_name
  ) then
    raise exception 'pre-flight failed: audited tour_stop_events identity drifted';
  end if;
end
$preflight$;

update public.poker_events
   set data_quality = 'stale',
       flags = case
         when coalesce(flags, '[]'::jsonb)
              @> '["pnm_public_text_quarantine_20260907"]'::jsonb
           then coalesce(flags, '[]'::jsonb)
         else coalesce(flags, '[]'::jsonb)
              || '["pnm_public_text_quarantine_20260907"]'::jsonb
       end
 where id in (
   '04b674e4-b5b2-413b-938e-da0420ccfab9'::uuid,
   '051ea095-d9d5-4e5b-bb43-cf94cfe8d85e'::uuid,
   '061df441-5b19-43b8-b678-2c2c2925a1a4'::uuid,
   '0e25566b-f105-4c97-b03c-ed7c10fe080c'::uuid,
   '7a1b58b5-a483-4de7-9b5a-1fdc3b373a98'::uuid,
   '9ef50488-598f-40c4-a1a6-539ece5798ec'::uuid
 );

update public.tour_stop_events
   set data_quality = 'stale',
       notes = concat_ws(
         ' | ',
         nullif(notes, ''),
         'Quarantined 2026-09-07: public event text contained a parser fragment.'
       )
 where id in (
   '10838483-6ea5-4fdf-8b43-3e6a7a20069c'::uuid,
   '6e1b5eac-679d-43f7-9834-d1c5b0386153'::uuid,
   '72546d3c-20ad-4038-b53a-7dd8c997edd9'::uuid
 );

do $post_apply$
begin
  if exists (
    select 1
      from public.poker_events
     where id in (
       '04b674e4-b5b2-413b-938e-da0420ccfab9'::uuid,
       '051ea095-d9d5-4e5b-bb43-cf94cfe8d85e'::uuid,
       '061df441-5b19-43b8-b678-2c2c2925a1a4'::uuid,
       '0e25566b-f105-4c97-b03c-ed7c10fe080c'::uuid,
       '7a1b58b5-a483-4de7-9b5a-1fdc3b373a98'::uuid,
       '9ef50488-598f-40c4-a1a6-539ece5798ec'::uuid
     )
       and data_quality in (
         'scraped_verified', 'scraped_inferred', 'manual_research'
       )
  ) then
    raise exception 'post-apply failed: poker event fragments remain servable';
  end if;

  if exists (
    select 1
      from public.tour_stop_events
     where id in (
       '10838483-6ea5-4fdf-8b43-3e6a7a20069c'::uuid,
       '6e1b5eac-679d-43f7-9834-d1c5b0386153'::uuid,
       '72546d3c-20ad-4038-b53a-7dd8c997edd9'::uuid
     )
       and data_quality in (
         'scraped_verified', 'scraped_inferred', 'manual_research'
       )
  ) then
    raise exception 'post-apply failed: tour event fragments remain servable';
  end if;
end
$post_apply$;

commit;

-- ROLLBACK: restore quality only after exact source evidence proves a real event.
