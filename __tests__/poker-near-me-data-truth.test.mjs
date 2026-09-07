import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  DAILY_RECURRING_MAX_AGE_MS,
  classifyScraperHealth,
  combineDailyTournamentQueryResults,
  decodeScrapedTournamentText,
  dailyTournamentDedupKey,
  fetchAllRows,
  fetchAllDailyTournamentRows,
  formatStoredTournamentStartTime,
  hasVerifiedMorningScheduleEvidence,
  isRecurringScheduleRow,
  isSafeScrapedTournamentText,
  isServableDailyTournamentRow,
  isServableDailyTournamentStartTime,
  isValidIsoDate,
  isValidIsoMonth,
  matchesHomeGameTournamentFilters,
  parseDailyTournamentStartMinutes,
  projectDailyTournamentDate,
} from '../src/lib/poker-near-me/dailyTournamentData.mjs';
import {
  dedupeTourDetailRows,
  isServableTourDetailRow,
  isServableTourStopEventRow,
  mergeTourScheduleEvents,
  tourScheduleSemanticKey,
} from '../src/lib/poker-near-me/tourScheduleData.mjs';

const validTourStop = (overrides = {}) => ({
  id: 'stop-1',
  tour_code: 'RGPS',
  stop_name: 'RGPS Tulsa',
  event_name: '$400 PLO Ring Event',
  stop_start_date: '2026-09-18',
  stop_end_date: '2026-09-28',
  start_date: '2026-09-20',
  data_quality: 'scraped_verified',
  ...overrides,
});

const validTourDetail = (overrides = {}) => ({
  id: 1,
  tour_code: 'MSPT',
  series_name: 'Minnesota Poker State Championship',
  event_number: 2,
  event_name: '$250 Monster Stack NLH',
  start_date: '2026-04-01',
  event_date: '2026-04-01',
  start_time: '19:30',
  buy_in: 250,
  pdf_source_url: 'https://msptpoker.com/showpdf.aspx?eventID=588',
  source_url: 'https://msptpoker.com/showpdf.aspx?eventID=588',
  scrape_html_hash: 'a'.repeat(64),
  scrape_timestamp: '2026-04-08T19:58:11.229Z',
  data_quality: 'pdf_extracted',
  ...overrides,
});

const verifiedMorningDaily = (overrides = {}) => ({
  id: 'morning-1',
  venue_id: 3123,
  venue_name: 'Horseshoe Las Vegas',
  tournament_name: "No Limit Hold'em 9:00AM $100 Buy In",
  start_time: '9:00AM',
  buy_in: 100,
  source_url: 'https://www.pokeratlas.com/poker-room/horseshoe-las-vegas/tournaments',
  scrape_source: 'pokeratlas',
  scrape_html_hash: 'a'.repeat(64),
  scrape_batch_id: '123e4567-e89b-42d3-a456-426614174000',
  scrape_timestamp: '2026-09-06T13:51:45.150Z',
  last_scraped: '2026-09-06T13:51:45.150Z',
  data_quality: 'scraped_verified',
  ...overrides,
});

test('morning daily schedules require exact source-owned evidence', () => {
  const nowMs = Date.parse('2026-09-07T00:00:00Z');
  assert.equal(parseDailyTournamentStartMinutes('9:00AM'), 540);
  assert.equal(parseDailyTournamentStartMinutes('09:30:00'), 570);
  assert.equal(parseDailyTournamentStartMinutes('12AM'), 0);
  assert.equal(parseDailyTournamentStartMinutes('13PM'), -1);
  assert.equal(parseDailyTournamentStartMinutes('25:00'), -1);

  assert.equal(hasVerifiedMorningScheduleEvidence(verifiedMorningDaily(), nowMs), true);
  assert.equal(isServableDailyTournamentStartTime(verifiedMorningDaily(), nowMs), true);
  assert.equal(isServableDailyTournamentStartTime(verifiedMorningDaily({
    start_time: '8:00AM',
  }), nowMs), true);
  assert.equal(isServableDailyTournamentStartTime(verifiedMorningDaily({
    start_time: '9:59AM',
  }), nowMs), true);

  const rejected = [
    { data_quality: 'scraped_inferred' },
    { scrape_source: 'cardplayer' },
    { start_time: '7:59AM' },
    { start_time: '9:00' },
    { start_time: '12:00AM' },
    { source_url: 'https://www.pokeratlas.com/poker-room/horseshoe-las-vegas' },
    { source_url: 'https://pokeratlas.example/poker-room/horseshoe-las-vegas/tournaments' },
    { source_url: 'https://cardplayer@pokeratlas.com/poker-room/horseshoe-las-vegas/tournaments' },
    { scrape_html_hash: '0'.repeat(64) },
    { scrape_html_hash: null },
    { scrape_batch_id: 'not-a-uuid' },
    { last_scraped: '2099-01-01T00:00:00Z' },
    {
      scrape_timestamp: '2099-01-01T00:00:00Z',
      last_scraped: '2026-09-06T20:00:00Z',
    },
    { scrape_timestamp: null },
    { tournament_name: '<script>event</script>' },
    { buy_in: 0 },
  ];
  for (const mutation of rejected) {
    assert.equal(
      isServableDailyTournamentStartTime(verifiedMorningDaily(mutation), nowMs),
      false,
      JSON.stringify(mutation),
    );
  }

  assert.equal(isServableDailyTournamentStartTime(verifiedMorningDaily({
    start_time: '10:00AM',
    data_quality: 'scraped_inferred',
    source_url: null,
    scrape_html_hash: null,
    scrape_batch_id: null,
  }), nowMs), true);
  assert.equal(isServableDailyTournamentStartTime({ start_time: null }, nowMs), true);
  assert.equal(isServableDailyTournamentStartTime({ start_time: 'TBD' }, nowMs), true);
  assert.equal(isServableDailyTournamentStartTime({ start_time: 'nineish' }, nowMs), false);
});

test('daily readers, writer, and freshness RPC share the morning evidence contract', () => {
  const dailyApi = fs.readFileSync('pages/api/poker/daily-tournaments.js', 'utf8');
  const calendarApi = fs.readFileSync('pages/api/poker/events-calendar.js', 'utf8');
  const writer = fs.readFileSync('scripts/tournament-schedule-daemon.py', 'utf8');
  const migration = fs.readFileSync(
    'supabase/migrations/20260907037000_pnm_verified_morning_schedule_contract.sql',
    'utf8',
  );

  for (const reader of [dailyApi, calendarApi]) {
    assert.match(reader, /isServableDailyTournamentStartTime/);
    assert.match(reader, /scrape_source/);
    assert.match(reader, /scrape_html_hash/);
    assert.match(reader, /scrape_batch_id/);
    assert.match(reader, /data_quality/);
    assert.doesNotMatch(reader, /SUSPICIOUS_TIME_FLOOR_MINUTES/);
  }
  assert.match(writer, /def has_verified_morning_source_evidence/);
  assert.match(writer, /source_type != "pokeratlas"/);
  assert.match(writer, /"scrape_source": source_type/);
  assert.match(migration, /add column scrape_source text/);
  assert.match(migration, /1819593f1326f6fc64192ad460725921/);
  assert.match(migration, /v_count <> 76/);
  assert.match(migration, /scrape_source = 'pokeratlas'/);
  assert.match(migration, /between 480 and 599/);
  assert.doesNotMatch(migration, /^\s*delete\s+from\s+/im);
  assert.doesNotMatch(migration, /set\s+(?:is_active|is_suppressed|data_quality)\s*=/i);
});

test('tour detail source is explicit, source-bound, and fail closed', () => {
  assert.equal(isServableTourDetailRow(validTourDetail(), 'MSPT'), true);
  assert.equal(isServableTourDetailRow(validTourDetail({
    start_time: '12:00 PM',
  }), 'MSPT'), true);
  assert.equal(isServableTourDetailRow(validTourDetail({
    start_time: '9:05 am',
  }), 'MSPT'), true);
  assert.equal(isServableTourDetailRow(validTourDetail({
    start_time: '13:00 PM',
  }), 'MSPT'), false);
  assert.equal(isServableTourDetailRow(validTourDetail({
    data_quality: 'scraped_verified',
  }), 'MSPT'), false);
  assert.equal(isServableTourDetailRow(validTourDetail({
    tour_code: 'WSOP',
  }), 'MSPT'), false);
  assert.equal(isServableTourDetailRow(validTourDetail({
    start_date: null,
  }), 'MSPT'), false);
  assert.equal(isServableTourDetailRow(validTourDetail({
    pdf_source_url: 'javascript:alert(1)',
  }), 'MSPT'), false);
  assert.equal(isServableTourDetailRow(validTourDetail({
    scrape_html_hash: 'placeholder',
  }), 'MSPT'), false);
});

test('primary tour rows require coherent event or stop date evidence', () => {
  assert.equal(isServableTourStopEventRow(validTourStop(), 'RGPS'), true);
  assert.equal(isServableTourStopEventRow(validTourStop({
    start_date: null,
    stop_start_date: null,
    stop_end_date: null,
  }), 'RGPS'), false);
  assert.equal(isServableTourStopEventRow(validTourStop({
    start_date: '2026-09-30',
  }), 'RGPS'), false);
  assert.equal(isServableTourStopEventRow(validTourStop({
    data_quality: 'stale',
  }), 'RGPS'), false);
  assert.equal(isServableTourStopEventRow(validTourStop({
    tour_code: 'WPT',
  }), 'RGPS'), false);
  assert.equal(isServableTourStopEventRow(validTourStop({
    stop_name: '!!!',
    event_name: '???',
  }), 'RGPS'), false);
  assert.equal(isServableTourStopEventRow(validTourStop({
    event_name: 'Poker &bogus; Event',
  }), 'RGPS'), false);
});

test('physical PDF rows collapse to one best row per exact semantic identity', () => {
  const rows = [];
  for (let key = 0; key < 24; key += 1) {
    const copies = key < 19 ? 5 : 4;
    for (let copy = 0; copy < copies; copy += 1) {
      rows.push(validTourDetail({
        id: `${key}-${copy}`,
        event_number: key + 1,
        event_name: `Event ${key + 1}`,
        scrape_timestamp: `2026-04-0${copy + 1}T12:00:00Z`,
      }));
    }
  }
  assert.equal(rows.length, 115);
  const deduped = dedupeTourDetailRows(rows);
  assert.equal(deduped.length, 24);
  assert.equal(deduped.find((row) => row.event_number === 1).id, '0-4');
});

test('tour merge updates seen keys, preserves primary provenance, and exposes detail provenance', () => {
  const primary = validTourDetail({
    id: 'primary', data_quality: 'scraped_verified', start_time: null,
    starting_chips_display: 'TBD', source_url: 'https://tour.example/schedule',
  });
  delete primary.series_name;
  primary.stop_name = 'Minnesota Poker State Championship';
  const matching = validTourDetail({
    id: 'detail-1', starting_chips: 30000, starting_chips_display: '30,000',
  });
  const duplicate = validTourDetail({ id: 'detail-2' });
  const second = validTourDetail({
    id: 'detail-3', event_number: 3, event_name: '$360 Main Event',
  });
  const secondDuplicate = validTourDetail({
    id: 'detail-4', event_number: 3, event_name: '$360 Main Event',
  });

  assert.equal(tourScheduleSemanticKey(primary), tourScheduleSemanticKey(matching));
  const merged = mergeTourScheduleEvents(
    [primary],
    [matching, duplicate, second, secondDuplicate],
  );
  assert.equal(merged.length, 2);
  assert.equal(merged[0].data_quality, 'scraped_verified');
  assert.equal(merged[0].detail_data_quality, 'pdf_extracted');
  assert.equal(merged[0].detail_source_url, matching.source_url);
  assert.equal(merged.filter((row) => row.event_number === 3).length, 1);
});

test('tour API only reads PDF details on explicit opt-in and propagates read failure', () => {
  const tourApi = fs.readFileSync(
    new URL('../pages/api/poker/tour-schedule.js', import.meta.url),
    'utf8',
  );
  assert.match(tourApi, /if \(pdf_detail === 'true'\)/);
  assert.match(tourApi, /\.or\('start_date\.not\.is\.null,stop_start_date\.not\.is\.null'\)/);
  assert.match(tourApi, /isServableTourStopEventRow\(row, tour_code\.toUpperCase\(\)\)/);
  assert.match(tourApi, /\.eq\('data_quality', SERVABLE_TOUR_DETAIL_QUALITIES\[0\]\)/);
  assert.match(tourApi, /if \(pdfError\)/);
  assert.match(tourApi, /res\.status\(503\)/);
  assert.match(tourApi, /mergeTourScheduleEvents\(dbEvents, pdfEvents\)/);
  assert.match(tourApi, /data_quality: row\.data_quality/);
  assert.doesNotMatch(tourApi, /data_quality:\s*'enriched'/);
});

test('scraped tournament entity decoding is text-only and deterministic', () => {
  assert.equal(
    decodeScrapedTournamentText('NLH w/Rebuys &amp; Add-On'),
    'NLH w/Rebuys & Add-On',
  );
  assert.equal(
    decodeScrapedTournamentText('&lt;script&gt;'),
    '',
  );
  assert.equal(
    decodeScrapedTournamentText('High Roller &mdash; Final'),
    'High Roller - Final',
  );
  assert.equal(
    decodeScrapedTournamentText('High Roller \u2014 Final'),
    'High Roller - Final',
  );
  assert.equal(
    decodeScrapedTournamentText('Players don&rsquo;t miss &#038; match'),
    "Players don't miss & match",
  );
  assert.equal(
    decodeScrapedTournamentText('Double &amp;rsquo; escape'),
    "Double ' escape",
  );
  assert.equal(decodeScrapedTournamentText('><div class='), '');
  assert.equal(decodeScrapedTournamentText('--> Earn &#038; tickets'), '');
  assert.equal(decodeScrapedTournamentText('<a href="/schedule">Schedule'), '');
  assert.equal(decodeScrapedTournamentText('$5,000 GTD | &lt;'), '');
  assert.equal(decodeScrapedTournamentText('Texas Hold&#x27'), '');
  assert.equal(decodeScrapedTournamentText('Texas Hold&#x27 tournament'), '');
  assert.equal(decodeScrapedTournamentText('Qualifier &lt next'), '');
  assert.equal(decodeScrapedTournamentText('H&M Main Event'), 'H&M Main Event');
  assert.equal(decodeScrapedTournamentText(null), '');
  assert.equal(decodeScrapedTournamentText(5000), '');
  assert.equal(isSafeScrapedTournamentText('Main Event &amp; Finale'), true);
  assert.equal(isSafeScrapedTournamentText('><div class='), false);
});

test('supplemental Home Games obey every daily discovery filter', () => {
  const homeGame = {
    id: 'game-1',
    title: 'Friday PLO Tournament',
    game_type: 'PLO',
    buyin_min: 250,
    scheduled_date: '2026-09-11',
    group: { id: 'group-1', name: 'Austin Rounders' },
  };

  assert.equal(matchesHomeGameTournamentFilters(homeGame, {}), true);
  assert.equal(matchesHomeGameTournamentFilters(homeGame, {
    venueId: 'home_game_group-1', venue: 'Austin', gameType: 'PLO',
    minBuyin: 200, maxBuyin: 300, targetDate: '2026-09-11',
  }), true);
  assert.equal(matchesHomeGameTournamentFilters(homeGame, { venueId: '42' }), false);
  assert.equal(matchesHomeGameTournamentFilters(homeGame, { venueId: 'home_game_group-2' }), false);
  assert.equal(matchesHomeGameTournamentFilters(homeGame, { venue: 'Dallas' }), false);
  assert.equal(matchesHomeGameTournamentFilters(homeGame, { gameType: 'NLH' }), false);
  assert.equal(matchesHomeGameTournamentFilters(homeGame, { minBuyin: 251 }), false);
  assert.equal(matchesHomeGameTournamentFilters(homeGame, { maxBuyin: 249 }), false);
  assert.equal(matchesHomeGameTournamentFilters(homeGame, { targetDate: '2026-09-12' }), false);
  assert.equal(matchesHomeGameTournamentFilters(
    { ...homeGame, buyin_min: null },
    { maxBuyin: 300 },
  ), false);
  // A null target date is the `day=all` contract and intentionally applies no
  // scheduled-date predicate.
  assert.equal(matchesHomeGameTournamentFilters(homeGame, { targetDate: null }), true);
});

test('Home Games never acquire a fabricated public start time', () => {
  assert.equal(formatStoredTournamentStartTime('19:00'), '7:00 PM');
  assert.equal(formatStoredTournamentStartTime('00:05:00'), '12:05 AM');
  assert.equal(formatStoredTournamentStartTime(null), null);
  assert.equal(formatStoredTournamentStartTime(''), null);
  assert.equal(formatStoredTournamentStartTime('25:00'), null);
  assert.equal(formatStoredTournamentStartTime('7:99'), null);
});

test('every public tournament reader applies the shared text decoder', () => {
  const dailyApi = fs.readFileSync(
    new URL('../pages/api/poker/daily-tournaments.js', import.meta.url),
    'utf8',
  );
  const calendarApi = fs.readFileSync(
    new URL('../pages/api/poker/events-calendar.js', import.meta.url),
    'utf8',
  );
  const seriesApi = fs.readFileSync(
    new URL('../pages/api/poker/series.js', import.meta.url),
    'utf8',
  );
  const tourApi = fs.readFileSync(
    new URL('../pages/api/poker/tour-schedule.js', import.meta.url),
    'utf8',
  );

  assert.match(dailyApi, /const tournamentName = decodeScrapedTournamentText\(t\.tournament_name\)/);
  assert.match(dailyApi, /combineDailyTournamentQueryResults\(\{/);
  assert.match(dailyApi, /scheduleResult\.readErrorCount > 0/);
  assert.match(dailyApi, /res\.status\(503\)/);
  assert.match(dailyApi, /event_date\.is\.null,event_date\.eq\.1970-01-01/);
  assert.match(dailyApi, /projectDailyTournamentDate\(row, targetDateStr\)/);
  assert.match(dailyApi, /formatStoredTournamentStartTime\(hg\.start_time\)/);
  assert.doesNotMatch(dailyApi, /hg\.start_time\s*\|\|\s*['"]7:00 PM['"]/);
  assert.match(calendarApi, /const tName = decodeScrapedTournamentText\(t\.tournament_name\)/);
  assert.match(calendarApi, /storedEventDate !== '1970-01-01'/);
  assert.match(calendarApi, /SERVABLE_SERIES_QUALITIES/);
  assert.match(calendarApi, /\.in\('data_quality', SERVABLE_SERIES_QUALITIES\)/);
  assert.match(calendarApi, /if \(!isServableSeriesParentEvidence\(s\)\) continue/);
  assert.match(calendarApi, /const tourEventName = decodeScrapedTournamentText\(t\.event_name \|\| ''\)/);
  assert.match(
    calendarApi,
    /\.from\('tour_stop_events'\)[\s\S]*?\.not\('start_date', 'is', null\)/,
  );
  assert.match(seriesApi, /const eventName = decodeScrapedTournamentText\(event\.event_name\)/);
  assert.match(seriesApi, /events\.map\(decodeSeriesEventPayload\)\.filter\(Boolean\)/);
  assert.match(tourApi, /const eventName = decodeScrapedTournamentText\(event\.event_name\)/);
  assert.match(tourApi, /events = events\.map\(decodeTourEventPayload\)\.filter\(Boolean\)/);
  assert.match(calendarApi, /if \(!tourEventName \|\| !tourStopName/);
});

test('stale recurring schedules cannot manufacture future calendar occurrences', () => {
  const now = Date.parse('2026-09-06T12:00:00Z');
  const fresh = new Date(now - DAILY_RECURRING_MAX_AGE_MS + 1000).toISOString();
  const stale = new Date(now - DAILY_RECURRING_MAX_AGE_MS - 1000).toISOString();

  assert.equal(isServableDailyTournamentRow({
    event_date: '2026-09-12', is_recurring: true, last_scraped: fresh,
  }, now), true);
  assert.equal(isServableDailyTournamentRow({
    event_date: '2026-09-12', is_recurring: true, last_scraped: stale,
  }, now), false);
  assert.equal(isRecurringScheduleRow({
    event_date: '2026-09-12', is_recurring: false,
    flags: ['pnm_recurring_projection'],
  }), true);
  assert.equal(isServableDailyTournamentRow({
    event_date: '2026-09-12', is_recurring: false,
    flags: ['pnm_recurring_projection'], last_scraped: stale,
  }, now), false);
  assert.equal(isServableDailyTournamentRow({
    event_date: '1970-01-01', scrape_timestamp: fresh,
  }, now), true);
  assert.equal(isServableDailyTournamentRow({
    event_date: null, scrape_timestamp: null,
  }, now), false);
  assert.equal(isServableDailyTournamentRow({
    event_date: '2026-10-20', is_recurring: false, scrape_timestamp: stale,
  }, now), true);
});

test('both undated template representations project onto the requested date', () => {
  const targetDate = '2026-09-11';
  assert.deepEqual(
    projectDailyTournamentDate({ id: 1, event_date: null, is_recurring: true }, targetDate),
    { id: 1, event_date: targetDate, is_recurring: true },
  );
  assert.deepEqual(
    projectDailyTournamentDate({ id: 2, event_date: '1970-01-01', is_recurring: true }, targetDate),
    { id: 2, event_date: targetDate, is_recurring: true },
  );
  const dated = { id: 3, event_date: '2026-09-12', is_recurring: false };
  assert.equal(projectDailyTournamentDate(dated, targetDate), dated);
});

test('daily tournament retrieval exhausts more than one PostgREST page in order', async () => {
  const source = Array.from({ length: 2305 }, (_, id) => ({ id }));
  const ranges = [];
  const buildQuery = () => ({
    async range(from, to) {
      ranges.push([from, to]);
      return { data: source.slice(from, to + 1), error: null };
    },
  });

  const result = await fetchAllDailyTournamentRows(buildQuery);
  assert.equal(result.error, null);
  assert.equal(result.truncated, false);
  assert.equal(result.rows.length, 2305);
  assert.deepEqual(result.rows.map(row => row.id), source.map(row => row.id));
  assert.deepEqual(ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test('production-scale event enrichment exhausts beyond the former five-page ceiling', async () => {
  const source = Array.from({ length: 8971 }, (_, id) => ({ id }));
  const ranges = [];
  const result = await fetchAllRows(() => ({
    async range(from, to) {
      ranges.push([from, to]);
      return { data: source.slice(from, to + 1), error: null };
    },
  }));

  assert.equal(result.rows.length, 8971);
  assert.equal(result.truncated, false);
  assert.equal(result.pagesFetched, 9);
  assert.deepEqual(ranges.at(-1), [8000, 8999]);
});

test('series event enrichment cannot serve or cache a partial page set', () => {
  const seriesApi = fs.readFileSync(
    new URL('../pages/api/poker/series.js', import.meta.url),
    'utf8',
  );
  assert.match(seriesApi, /fetchPokerEventsForSeries/);
  assert.match(seriesApi, /SERIES_EVENT_MAX_ROWS = 50000/);
  assert.match(seriesApi, /poker_events_(?:scan_truncated|read_failed)/);
  assert.match(seriesApi, /degraded \? 'private, no-store'/);
  assert.doesNotMatch(seriesApi, /page < 5/);
});

test('series events fail closed for every non-human generic extractor source', () => {
  const seriesApi = fs.readFileSync(
    new URL('../pages/api/poker/series.js', import.meta.url),
    'utf8',
  );
  assert.match(
    seriesApi,
    /source\.not\.in\.\(html_fallback,cardplayer,venue_subpage,venue_website,bravo_venue,source_url,pdf_fallback\),human_verified\.eq\.true/,
  );

  const migration = fs.readFileSync(
    new URL(
      '../supabase/migrations/20260907033000_pnm_unverified_generic_series_event_quarantine.sql',
      import.meta.url,
    ),
    'utf8',
  );
  assert.match(migration, /9061719585fe480056a0e5317816d884/);
  assert.match(migration, /expected 2309/);
  assert.match(migration, /pnm_unverified_generic_series_event_quarantine_20260907/);
  assert.match(migration, /7f58dcf97d19007d6c4762da1047d2ca/);
  assert.match(migration, /2dcefb8c0f375f3199eb53047a163936/);
  assert.doesNotMatch(migration, /^\s*delete\s+from\s+/im);
});

test('daily location dependencies fail closed or disable caching', () => {
  const dailyApi = fs.readFileSync(
    new URL('../pages/api/poker/daily-tournaments.js', import.meta.url),
    'utf8',
  );
  assert.match(dailyApi, /const stateVenueResult = await fetchAllRows/);
  assert.match(dailyApi, /State venue lookup unavailable/);
  assert.match(dailyApi, /const \{ data: pvRows, error: pvError \}/);
  assert.match(dailyApi, /if \(pvError\) throw pvError/);
  assert.match(dailyApi, /sourceWarnings\.length > 0/);
  assert.match(dailyApi, /private, no-store/);
  assert.match(dailyApi, /if \(isSpecificDay && targetDateStr\)/);
  assert.match(dailyApi, /matchesHomeGameTournamentFilters/);
});

test('daily cohort combination counts every failed read and serves no partial rows', () => {
  const result = combineDailyTournamentQueryResults({
    dated: { rows: [{ id: 1 }], error: null, truncated: false, pagesFetched: 2 },
    recurring: {
      rows: [], error: new Error('read failed'), truncated: false, pagesFetched: 1,
    },
    secondary: { rows: [{ id: 2 }], error: null, truncated: true, pagesFetched: 3 },
  });
  assert.deepEqual(result.rows, []);
  assert.equal(result.readErrorCount, 2);
  assert.deepEqual(result.failedCohorts, ['recurring', 'secondary']);
  assert.equal(result.pagesFetched, 6);
});

test('pagination never serves a biased partial result after a later-page error', async () => {
  let calls = 0;
  const result = await fetchAllDailyTournamentRows(() => ({
    async range(from, to) {
      calls += 1;
      if (calls === 2) return { data: null, error: { message: 'timeout' } };
      return { data: Array.from({ length: to - from + 1 }, (_, i) => ({ id: from + i })), error: null };
    },
  }));

  assert.deepEqual(result.rows, []);
  assert.equal(result.error.message, 'timeout');
});

test('generic paging contract is reusable across every calendar source', async () => {
  const calls = [];
  const result = await fetchAllRows(() => ({
    range: async (lower, upper) => {
      calls.push([lower, upper]);
      return { data: lower === 0 ? [{ id: 1 }, { id: 2 }] : [{ id: 3 }], error: null };
    },
  }), { pageSize: 2, maxRows: 10 });
  assert.deepEqual(result.rows.map((item) => item.id), [1, 2, 3]);
  assert.deepEqual(calls, [[0, 1], [2, 3]]);
  assert.equal(result.truncated, false);
});

test('calendar date validators reject impossible dates and months', () => {
  assert.equal(isValidIsoDate('2026-02-28'), true);
  assert.equal(isValidIsoDate('2026-02-29'), false);
  assert.equal(isValidIsoDate('2026-13-01'), false);
  assert.equal(isValidIsoDate('2026-9-01'), false);
  assert.equal(isValidIsoMonth('2026-12'), true);
  assert.equal(isValidIsoMonth('2026-13'), false);
});

test('dedup identity preserves distinct days and named events', () => {
  const base = {
    venue_id: 7,
    event_date: '2026-09-06',
    start_time: '7:00 PM',
    buy_in: 200,
    game_type: "No Limit Hold'em",
    tournament_name: 'Sunday Deepstack',
  };
  assert.notEqual(
    dailyTournamentDedupKey(base),
    dailyTournamentDedupKey({ ...base, event_date: '2026-09-07' }),
  );
  assert.notEqual(
    dailyTournamentDedupKey(base),
    dailyTournamentDedupKey({ ...base, tournament_name: 'Sunday Bounty' }),
  );
});

test('fresh zero-output success is unhealthy unless explicitly valid-empty', () => {
  const zero = classifyScraperHealth({
    heartbeat: { run_status: 'success', records_saved: 0, errors: 0 },
    heartbeatStaleMinutes: 1,
    dataStaleMinutes: 1,
    healthyMinutes: 25,
    deadMinutes: 45,
  });
  assert.equal(zero.status, 'warning');

  const validEmpty = classifyScraperHealth({
    heartbeat: { run_status: 'valid_empty', records_attempted: 0, records_saved: 0, records_rejected: 0, errors: 0, status_reason: 'observed data covers all modeled venues' },
    heartbeatStaleMinutes: 1,
    dataStaleMinutes: 900,
    healthyMinutes: 25,
    deadMinutes: 45,
  });
  assert.equal(validEmpty.status, 'healthy');
});

test('fresh progress and maintenance checkpoints are healthy zero-write outcomes', () => {
  for (const runStatus of ['progress', 'maintenance']) {
    const checkpoint = classifyScraperHealth({
      heartbeat: {
        run_status: runStatus,
        records_saved: 0,
        records_attempted: 0,
        records_rejected: 0,
        errors: 0,
        status_reason: `${runStatus}_confirmed`,
      },
      heartbeatStaleMinutes: 1,
      dataStaleMinutes: 900,
      healthyMinutes: 25,
      deadMinutes: 45,
    });
    assert.equal(checkpoint.status, 'healthy');
    assert.equal(checkpoint.reason, `${runStatus}_confirmed`);
  }

  const malformed = classifyScraperHealth({
    heartbeat: {
      run_status: 'progress',
      records_saved: 1,
      records_attempted: 1,
      records_rejected: 0,
      errors: 0,
    },
    heartbeatStaleMinutes: 1,
    dataStaleMinutes: 1,
    healthyMinutes: 25,
    deadMinutes: 45,
  });
  assert.equal(malformed.status, 'warning');
  assert.match(malformed.reason, /progress.*zero-write/i);
});

test('nonlegacy health cannot accept missing truth counts as a healthy success', () => {
  const result = classifyScraperHealth({
    heartbeat: { run_status: 'success', records_saved: 12, errors: 0 },
    heartbeatStaleMinutes: 2,
    dataStaleMinutes: 2,
    healthyMinutes: 30,
    deadMinutes: 60,
  });
  assert.equal(result.status, 'warning');
  assert.match(result.reason, /missing attempted or rejected/i);
});

test('scraper health cannot be held green by future-dated metrics or source rows', () => {
  const heartbeat = {
    run_status: 'success',
    records_attempted: 3,
    records_saved: 3,
    records_rejected: 0,
    errors: 0,
  };
  const futureMetric = classifyScraperHealth({
    heartbeat,
    heartbeatStaleMinutes: -10,
    dataStaleMinutes: 1,
    healthyMinutes: 30,
    deadMinutes: 60,
  });
  const futureData = classifyScraperHealth({
    heartbeat,
    heartbeatStaleMinutes: 1,
    dataStaleMinutes: -10,
    healthyMinutes: 30,
    deadMinutes: 60,
  });

  assert.equal(futureMetric.status, 'warning');
  assert.match(futureMetric.reason, /future timestamp/);
  assert.equal(futureData.status, 'warning');
  assert.match(futureData.reason, /future timestamp/);
});

test('a success metric with rejected or unconfirmed rows is not healthy', () => {
  for (const heartbeat of [
    { run_status: 'success', records_attempted: 3, records_saved: 2, records_rejected: 1, errors: 0 },
    { run_status: 'success', records_attempted: 3, records_saved: 2, records_rejected: 0, errors: 0 },
  ]) {
    const health = classifyScraperHealth({
      heartbeat,
      heartbeatStaleMinutes: 1,
      dataStaleMinutes: 1,
      healthyMinutes: 25,
      deadMinutes: 45,
    });
    assert.equal(health.status, 'warning');
    assert.match(health.reason, /attempted|persist/i);
  }
});

test('a fresh failed metric is dead and a partial metric is warning', () => {
  const failed = classifyScraperHealth({
    heartbeat: { run_status: 'failed', records_saved: 0, status_reason: 'database rejected batch' },
    heartbeatStaleMinutes: 1,
    dataStaleMinutes: 1,
    healthyMinutes: 25,
    deadMinutes: 45,
  });
  assert.equal(failed.status, 'dead');

  const partial = classifyScraperHealth({
    heartbeat: { run_status: 'partial', records_saved: 9, records_attempted: 10 },
    heartbeatStaleMinutes: 1,
    dataStaleMinutes: 1,
    healthyMinutes: 25,
    deadMinutes: 45,
  });
  assert.equal(partial.status, 'warning');
});

test('migration retries reset aborted single-file transactions and fail closed for batches', () => {
  const runner = fs.readFileSync('scripts/antigravity_sql_push.js', 'utf8');

  assert.match(runner, /canResetTransaction = false/);
  assert.match(runner, /await client\.query\('ROLLBACK'\)/);
  assert.match(runner, /Transactional batch aborted; retry the full batch after rollback/);
  assert.match(runner, /canResetTransaction: !useTransaction/);
});

test('Poker Near Me schema migrations acquire the optional realtime lock first', () => {
  for (const filename of [
    '20260906220000_pnm_scraper_data_truth.sql',
    '20260906221000_home_games_membership_and_rsvp_gate.sql',
    '20260906222000_pokeratlas_atomic_venue_ingest.sql',
  ]) {
    const migration = fs.readFileSync(`supabase/migrations/${filename}`, 'utf8').toLowerCase();
    const realtimeLock = migration.indexOf('lock table realtime.subscription in access exclusive mode');
    const firstPublicTable = migration.indexOf("to_regclass('public.");

    assert.ok(realtimeLock > -1, `${filename} is missing the realtime lock-order guard`);
    assert.ok(firstPublicTable === -1 || realtimeLock < firstPublicTable,
      `${filename} touches a public table before acquiring the realtime lock`);
  }
});
