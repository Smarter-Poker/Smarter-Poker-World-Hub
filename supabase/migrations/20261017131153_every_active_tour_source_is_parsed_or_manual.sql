-- Every active tour source either has a parser for its official schedule or
-- is marked manual with the reason (2026-10-17).
--
-- tour_stealth_scraper.py exits 1 when any active source yields no
-- certifiable stop, and 12 of 26 did on every run. Seven now parse their
-- official page (four of them at a corrected URL, below). Five publish no
-- dated stop schedule the collector can certify: they become
-- scrape_method='manual' so the collector skips them, with the reason in
-- last_error and notes. is_active is NOT touched: the tours stay listed on
-- the site exactly as before, and no tour_stop_events row is changed here.
BEGIN;

DO $$
DECLARE
  v_count int;
BEGIN
  IF (SELECT count(*) FROM tour_source_registry
        WHERE tour_code IN ('NAPT','CPPT','LODGE','TPO','FPN') AND scrape_method = 'manual') = 5
     AND (SELECT count(*) FROM tour_source_registry WHERE
           (tour_code, schedule_url) IN (('MSPT','https://msptpoker.com/'),
             ('BORGATA','https://borgata.mgmresorts.com/en/casino/poker.html'),
             ('BPO','https://barpokeropen.com/championship'),
             ('WTP','https://www.worldtavernpoker.info/open-2026'))) = 4 THEN
    RAISE NOTICE 'tour source registry already repaired; nothing to do';
    RETURN;
  END IF;

  SELECT count(*) INTO v_count FROM tour_source_registry
   WHERE tour_code IN ('MSPT','BORGATA','BPO','WTP','NAPT','CPPT','LODGE','TPO','FPN') AND is_active;
  IF v_count <> 9 THEN
    RAISE EXCEPTION 'refusing: expected 9 active target sources, found %', v_count;
  END IF;

  UPDATE tour_source_registry r
     SET schedule_url = v.new_url, updated_at = now()
    FROM (VALUES
      ('MSPT', 'https://msptpoker.com/schedule/', 'https://msptpoker.com/'),
      ('BORGATA', 'https://www.theborgata.com/casino/poker/tournaments', 'https://borgata.mgmresorts.com/en/casino/poker.html'),
      ('BPO', 'https://barpokeropen.com/', 'https://barpokeropen.com/championship'),
      ('WTP', 'https://worldtavernpoker.com/', 'https://www.worldtavernpoker.info/open-2026')
    ) AS v(code, old_url, new_url)
   WHERE r.tour_code = v.code AND r.schedule_url = v.old_url;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'expected 4 schedule URLs corrected, changed %', v_count;
  END IF;

  UPDATE tour_source_registry r
     SET scrape_method = 'manual',
         scrape_status = v.status,
         last_error = v.reason,
         notes = concat_ws(E'\n', nullif(r.notes, ''), v.reason),
         updated_at = now()
    FROM (VALUES
      ('NAPT', 'defunct', 'Collector paused 2026-10-17: pokerstarslive.com/napt/ and /napt/schedule/ return HTTP 404 and the PokerStars Live calendar lists no NAPT stop. Set scrape_method back to puppeteer with the new schedule URL if NAPT returns.'),
      ('CPPT', 'defunct', 'Collector paused 2026-10-17: cardplayerpokertour.com now redirects to the cardplayer.com home page, which publishes no CPPT schedule. Set scrape_method back to puppeteer with a new schedule URL if one is published.'),
      ('LODGE', 'manual', 'Collector paused 2026-10-17: the official LCS page lists only the 2026 series (February 22 to March 9, 2026) and no next LCS dates. Set scrape_method back to puppeteer when the next series is published.'),
      ('TPO', 'manual', 'Collector paused 2026-10-17: the official Texas Poker Open page lists only the 2026 edition (April 29 to May 11, 2026) and no next edition. Set scrape_method back to puppeteer when it is published.'),
      ('FPN', 'manual', 'Collector paused 2026-10-17: freepokernetwork.com publishes weekly bar-league games and qualifiers, and lists its championships with TBD dates, so it has no dated tour-stop schedule to collect.')
    ) AS v(code, status, reason)
   WHERE r.tour_code = v.code AND r.scrape_method = 'puppeteer';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 5 THEN
    RAISE EXCEPTION 'expected 5 sources marked manual, changed %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM tour_source_registry
   WHERE tour_code IN ('MSPT','BORGATA','BPO','WTP','NAPT','CPPT','LODGE','TPO','FPN') AND is_active;
  IF v_count <> 9 THEN
    RAISE EXCEPTION 'a target source stopped being listed (% still active)', v_count;
  END IF;
END $$;

COMMIT;
