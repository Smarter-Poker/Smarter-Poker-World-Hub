-- Mirrored from the live database on 2026-07-27. Applied via MCP as migration 20260727233932_remove_always_true_venue_news_write_policies.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.
-- 2026-07-27 security: venue_news carried three PERMISSIVE policies for the
-- `authenticated` role with unconditional expressions --
--   venue_news_auth_write  INSERT WITH CHECK (true)
--   venue_news_auth_update UPDATE USING (true) WITH CHECK (true)
--   venue_news_auth_delete DELETE USING (true)
-- Any signed-in player could therefore rewrite or delete every venue's news.
--
-- venue_news is scraper-populated (note the source_url / scraped_at columns).
-- Verified before dropping: the only writer in the codebase is the server route
-- pages/api/venue-scraper/receive.js, which uses the service role and is
-- already covered by the existing venue_news_service_write policy. Reads go
-- through pages/api/poker/venues.js and pages/api/public/venue/[id].js, also
-- server-side, and the public SELECT policy is left untouched. club-arena does
-- not reference the table at all. Dropping these three is therefore a pure
-- removal of unused write access.

drop policy if exists venue_news_auth_write  on public.venue_news;
drop policy if exists venue_news_auth_update on public.venue_news;
drop policy if exists venue_news_auth_delete on public.venue_news;

do $$
declare bad text;
begin
  -- No unconditional write policy may remain for a non-service role.
  select string_agg(policyname, ', ') into bad
  from pg_policies
  where schemaname='public' and tablename='venue_news'
    and cmd <> 'SELECT'
    and roles::text not like '%service_role%'
    and (coalesce(qual,'true') = 'true' or coalesce(with_check,'true') = 'true');
  if bad is not null then
    raise exception 'permissive write policy still present on venue_news: %', bad;
  end if;

  -- The scraper path and public reads must survive.
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='venue_news' and policyname='venue_news_service_write') then
    raise exception 'REGRESSION: service_role write policy was removed';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public'
                 and tablename='venue_news' and cmd='SELECT') then
    raise exception 'REGRESSION: public read policy was removed';
  end if;
end $$;
