/**
 * Offline fixtures for e2e/pnm-smarterdesign-render.spec.ts.
 *
 * Every browser request the Poker Near Me pages make is answered here: the
 * page's own /api routes from the fixtures below, Supabase REST with empty
 * rows, Supabase Auth with the synthetic session (signed in) or a 401
 * (signed out), and every third-party host (map tiles, fonts, analytics) is
 * refused. Nothing the browser does reaches production. Server-side rendering
 * still runs in the Next server the workflow starts, with whatever Supabase
 * configuration that job gives it, exactly as for every other spec in that job.
 *
 * The shapes follow the live handlers (pages/api/poker/*.js): a list
 * endpoint answers { success, data: [...] } plus the extra keys its readers
 * use, so pages render populated rows rather than an empty state.
 */
import type { BrowserContext, Page, Route } from '@playwright/test';
import { installRealtimeSessionGuard } from './realtimeSessionGuard';

export const FIXTURE_VENUE_ID = 1823;
export const FIXTURE_SERIES_ID = 468;
export const FIXTURE_TOUR_CODE = 'wsop';

const now = new Date();
const iso = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();
const day = (days: number) => iso(days).slice(0, 10);
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()];

function venue(id: number, name: string, city: string, state: string, lat: number, lng: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    name,
    venue_type: 'casino',
    address: `${100 + id} Fixture Boulevard`,
    city,
    state,
    country: 'US',
    latitude: lat,
    longitude: lng,
    lat,
    lng,
    phone: '(702) 555-0100',
    website: 'https://example.test/' + id,
    hours: 'Open 24 Hours',
    has_tournaments: true,
    trust_score: 82,
    is_featured: false,
    is_active: true,
    profile_photo_url: null,
    cover_photo_url: null,
    logo_url: null,
    about: `${name} runs a full poker room with daily tournaments and cash games.`,
    games_offered: ['NLH', 'PLO'],
    stakes_cash: ['1/2', '2/5'],
    poker_tables: 24,
    follower_count: 12,
    timezone: 'America/Los_Angeles',
    last_scraped: iso(-1),
    last_scraped_at: iso(-1),
    location_quality: 'verified',
    data_quality: 'scraped_verified',
    daily_tournaments: [],
    schedule_unavailable: false,
    ...extra,
  };
}

export const VENUES = [
  venue(FIXTURE_VENUE_ID, 'Fixture Grand Poker Room', 'Las Vegas', 'NV', 36.1147, -115.1728, { is_featured: true }),
  venue(1824, 'Fixture Desert Card Club', 'Henderson', 'NV', 36.0395, -114.9817),
  venue(1825, 'Fixture Strip Casino', 'Las Vegas', 'NV', 36.1215, -115.1696),
  venue(1826, 'Fixture Reno Poker Lounge', 'Reno', 'NV', 39.5296, -119.8138),
  venue(1827, 'Fixture Lakeside Card Room', 'Stateline', 'NV', 38.9619, -119.9406),
  venue(1828, 'Fixture Lodge Card Club', 'Round Rock', 'TX', 30.5083, -97.6789),
];

export const TOURNAMENTS = VENUES.slice(0, 4).map((v, i) => ({
  id: 9000 + i,
  venue_id: v.id,
  venue_name: v.name,
  city: v.city,
  state: v.state,
  latitude: v.latitude,
  longitude: v.longitude,
  name: ['Morning Deepstack', 'Afternoon Turbo', 'Evening Bounty', 'Late Night Freezeout'][i],
  tournament_name: ['Morning Deepstack', 'Afternoon Turbo', 'Evening Bounty', 'Late Night Freezeout'][i],
  day_of_week: WEEKDAY,
  start_time: ['10:00', '14:00', '19:00', '23:00'][i],
  game_type: i === 1 ? 'PLO' : 'NLH',
  buy_in: [80, 120, 200, 60][i],
  guarantee: [2000, 5000, 10000, 0][i],
  starting_stack: 20000,
  blind_levels: '20 Minutes',
  late_reg: '2 Hours',
  source_url: 'https://example.test/schedule',
  last_scraped: iso(-1),
}));

export const SERIES = [
  {
    id: FIXTURE_SERIES_ID,
    name: 'Fixture Summer Poker Series',
    short_name: 'Fixture Summer',
    tour: 'WSOP',
    tour_code: 'WSOP',
    venue_id: FIXTURE_VENUE_ID,
    venue_name: VENUES[0].name,
    venue: VENUES[0].name,
    location: 'Las Vegas, NV',
    city: 'Las Vegas',
    state: 'NV',
    start_date: day(3),
    end_date: day(20),
    startDate: day(3),
    endDate: day(20),
    total_events: 24,
    guaranteed_pool: 5000000,
    main_event_buyin: 1500,
    main_event_guarantee: 1000000,
    is_featured: true,
    source_url: 'https://example.test/series',
    data_quality: 'scraped_verified',
    events: [
      { id: 1, event_number: 1, name: 'Opening Deepstack', start_date: day(3), buy_in: 400, guarantee: 100000, game_type: 'NLH' },
      { id: 2, event_number: 2, name: 'Pot Limit Omaha', start_date: day(4), buy_in: 600, guarantee: 75000, game_type: 'PLO' },
    ],
  },
];

export const TOURS = [
  {
    id: 1,
    code: 'WSOP',
    tour_code: 'WSOP',
    name: 'World Series Of Poker',
    short_name: 'WSOP',
    tour_type: 'major',
    description: 'Fixture tour description for the rendered style audit.',
    website: 'https://example.test/wsop',
    upcoming_series: SERIES,
    series_count: 1,
  },
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function apiResponse(url: URL): unknown {
  const p = url.pathname;
  const id = url.searchParams.get('id') || url.searchParams.get('venue_id');
  if (p === '/api/poker/venues') {
    if (id) {
      const match = VENUES.find((v) => String(v.id) === String(id)) || VENUES[0];
      return { success: true, data: match };
    }
    return {
      success: true,
      data: VENUES,
      total: VENUES.length,
      count: VENUES.length,
      complete: true,
      degraded: false,
      data_source: 'supabase',
      home_groups: [],
      total_home_groups: 0,
    };
  }
  if (p === '/api/poker/daily-tournaments') {
    return {
      success: true,
      meta: { generatedAt: now.toISOString(), degraded: false, source: 'venue_daily_tournaments', warnings: [], truncated: false },
      day: WEEKDAY,
      totalVenues: 4,
      lastUpdated: iso(-1),
      tournaments: TOURNAMENTS,
      data: TOURNAMENTS,
      byTimeSlot: {},
      byState: { NV: TOURNAMENTS },
    };
  }
  if (p === '/api/poker/series') {
    if (id) return { success: true, data: SERIES[0], series: SERIES[0] };
    return { success: true, data: SERIES, series: SERIES, total: SERIES.length };
  }
  if (p === '/api/poker/tours') {
    return { success: true, data: TOURS, total: TOURS.length, summary: { total_tours: 1, by_type: { major: 1 }, upcoming_series_count: 1 }, metadata: { source: 'fixture' } };
  }
  if (p === '/api/poker/tour-schedule') return { success: true, tour: TOURS[0], data: SERIES, series: SERIES };
  if (p === '/api/poker/events-calendar') {
    const events = TOURNAMENTS.map((t) => ({ ...t, date: day(0), event_date: day(0), title: t.name }));
    return { success: true, data: events, events, days: { [day(0)]: events } };
  }
  if (p === '/api/poker/live-tables') return { venues: [], truncated: false, rows_scanned: 0 };
  if (p === '/api/poker/venue-schedules') return { success: true, data: [], schedules: [] };
  if (p === '/api/poker/promotions') return { success: true, data: [], promotions: [] };
  if (p === '/api/poker/reviews') return { success: true, data: [], reviews: [], average: null, count: 0 };
  if (p.startsWith('/api/poker/checkins')) return { success: true, data: [], checkins: [], hours: [] };
  if (p === '/api/poker/platform-counts') return { success: true, venues: VENUES.length, tournaments: TOURNAMENTS.length, series: SERIES.length };
  if (p === '/api/public/home-games/discover') return { success: true, data: [], groups: [], total: 0 };
  return { success: true, data: [] };
}

export const SESSION_USER = {
  id: '00000000-0000-4000-8000-000000000628',
  email: 'pnm-smarterdesign@example.test',
  role: 'authenticated',
  aud: 'authenticated',
  user_metadata: { full_name: 'Fixture Player' },
};

// HS256 with no key id: realtimeSessionGuard keeps it off live Realtime.
const FIXTURE_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDA2MjgiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImF1ZCI6ImF1dGhlbnRpY2F0ZWQiLCJleHAiOjQxMDI0NDQ4MDB9.pnmsmarterdesign';

export async function installPnmOffline(context: BrowserContext, page: Page, origin: string, signedIn: boolean) {
  await installRealtimeSessionGuard(context);
  await context.addInitScript(
    ({ signedIn: si, token, user }) => {
      try {
        localStorage.setItem('pnm_lobby_tutorial_seen', '1');
        localStorage.setItem('pnm_tutorial_seen_v1', '1');
        localStorage.setItem('pnm_location_prompt_dismissed', '1');
        localStorage.removeItem('sp-filters-poker-near-me');
        if (si) {
          localStorage.setItem('smarter-poker-auth', JSON.stringify({
            access_token: token,
            refresh_token: 'pnm-smarterdesign-refresh',
            expires_at: 4102444800,
            expires_in: 2147483647,
            token_type: 'bearer',
            user,
          }));
        } else {
          localStorage.removeItem('smarter-poker-auth');
        }
      } catch (_) { /* storage disabled: the page renders signed out */ }
    },
    { signedIn, token: FIXTURE_TOKEN, user: SESSION_USER }
  );

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.startsWith('/auth/v1/')) {
      if (!signedIn) return json(route, { code: 401, msg: 'not signed in' }, 401);
      if (url.pathname.startsWith('/auth/v1/user')) return json(route, SESSION_USER);
      return json(route, { access_token: FIXTURE_TOKEN, refresh_token: 'pnm-smarterdesign-refresh', expires_in: 3600, token_type: 'bearer', user: SESSION_USER });
    }
    if (url.pathname.startsWith('/rest/v1/')) {
      const single = request.headers().accept?.includes('vnd.pgrst.object');
      return json(route, single ? null : []);
    }
    if (url.pathname.startsWith('/functions/v1/') || url.pathname.startsWith('/storage/v1/')) return route.abort();
    if (url.origin === origin && url.pathname.startsWith('/api/')) {
      if (request.method() !== 'GET') return json(route, { success: true });
      return json(route, apiResponse(url));
    }
    if (url.origin === origin) return route.continue();
    return route.abort();
  });
}
