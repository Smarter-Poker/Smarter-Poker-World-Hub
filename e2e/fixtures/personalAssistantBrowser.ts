import type { BrowserContext, Page, Route } from '@playwright/test';
import { installRealtimeSessionGuard } from './realtimeSessionGuard';
import { parseHandHistory } from '../../src/engines/HandHistoryParser.js';
import { buildImportedSavedHandRows } from '../../src/lib/personal-assistant/importedSavedHands.mjs';

// Deliberately fabricated identity. These fixtures are only for a local build;
// they are not evidence of production authentication, permissions or storage.
export const OWNER = '66666666-6666-4666-8666-666666666666';
const archetype = { id: 'gto_neutral', name: 'GTO Neutral' };
const turn = {
  gameType: 'tournament', heroPosition: 'CO', heroStack: 85, potBase: 6.5,
  heroHand: { card1: 'As', card2: 'Ad' },
  board: { flop: ['Kh', '7c', '2d'], turn: '9c', river: null },
  villains: [
    { id: 7, position: 'BB', stack: 95, range: 'QQ', archetype },
    { id: 9, position: 'SB', stack: 45, range: 'KK', archetype },
  ],
  actionHistory: [], preflopPosts: [], authority: 'authored-sandbox-ungraded',
};
export const TEMPLATES = [
  { id: 'multiway-turn', name: 'Multiway Turn', scenario_json: turn },
  { id: 'heads-up-turn', name: 'Heads Up Turn', scenario_json: { ...turn, villains: turn.villains.slice(0, 1) } },
  {
    id: 'replay-river', name: 'Replay River', scenario_json: {
      ...turn, board: { ...turn.board, river: '4s' },
      actionHistory: [
        { street: 'flop', actorKey: 'hero', isHero: true, action: 'bet', amount: 5, label: 'Bet 5 BB' },
        { street: 'flop', actorKey: 'villain_0', isVillain: true, action: 'call', amount: 5, label: 'Call 5 BB' },
        { street: 'flop', actorKey: 'villain_1', isVillain: true, action: 'fold', amount: 0, label: 'Fold' },
      ],
    },
  },
  {
    id: 'different-spot', name: 'Different Spot', scenario_json: {
      gameType: 'cash', heroPosition: 'BTN', heroStack: 120, potBase: 12,
      heroHand: { card1: 'Js', card2: 'Ts' },
      board: { flop: ['Qs', '8h', '3d'], turn: null, river: null },
      villains: [{ id: 12, position: 'BB', stack: 120, range: 'JJ,TT', archetype }],
      actionHistory: [], preflopPosts: [], authority: 'authored-sandbox-ungraded',
    },
  },
];

export async function installPersonalAssistantFixtures(page: Page, context: BrowserContext, baseURL?: string) {
  if (!baseURL || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(baseURL).hostname)) {
    throw new Error('Fabricated Personal Assistant sessions are restricted to a loopback production build.');
  }
  const origin = new URL(baseURL).origin;
  await installRealtimeSessionGuard(context);
  // The app shell also has non-Realtime socket consumers. They must remain
  // local to this qualification, just like the Auth/REST/API fixtures below.
  await context.routeWebSocket(/^(?!.*\/realtime\/v1\/websocket).*$/, socket => socket.close());
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const user = {
    id: OWNER, aud: 'authenticated', role: 'authenticated',
    email: 'pa-browser@example.invalid', created_at: '2025-01-01T00:00:00.000Z',
    email_confirmed_at: '2025-01-01T00:00:00.000Z', phone_confirmed_at: '2025-01-01T00:00:00.000Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { poker_alias: 'Local Study Fixture', full_name: 'Local Study Fixture' },
  };
  const profile = {
    ...user, username: 'local-study-fixture', full_name: 'Local Study Fixture',
    is_vip: true, vip_expires_at: null, is_admin: false, diamonds: 0,
    avatar_url: null, arena_avatar_url: null, use_avatar_as_profile_pic: false,
  };
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: OWNER, exp: expiry, role: 'authenticated' })}.local-fixture-only`;
  const session = { access_token: token, refresh_token: 'local-fixture-only', token_type: 'bearer', expires_in: 3600, expires_at: expiry, user };
  const errors: string[] = [];
  const unexpected: string[] = [];
  const apiRequests: string[] = [];
  // In-memory API boundary only. The form's actual text is parsed into the
  // production row shape, but this does not exercise Supabase persistence.
  const imports = {
    failSave: false,
    requests: [] as Array<{ handHistoryText: string; evidenceScope: string; source: string }>,
    savedHands: new Map<string, ReturnType<typeof buildImportedSavedHandRows>[number]>(),
  };
  // WebKit logs "Fetch API cannot load <url> due to access control checks." for
  // a fetch that the page starts while its document is being unloaded, even
  // when the page catches the rejection, and Playwright reports every WebKit
  // console error from the javascript source as a page error. Reproduced in
  // isolation: a fetch() issued from a pagehide listener, with .catch(), on a
  // same-origin fulfilled route, raises exactly this "error" on reload. Global
  // chrome (header stats, the phone read, news preferences, saved-hand reads,
  // chunk warm-ups) refreshes on visibility and lifecycle events, so every
  // navigation in this suite can produce one, which made the WebKit project
  // flaky. They are not exceptions in the page. Only that exact message, for a
  // URL this fixture serves (the app origin or the mocked Supabase REST/Auth
  // paths), within a few seconds of a main-frame navigation, is set aside;
  // anything else is still a failure.
  const isWebKit = context.browser()?.browserType().name() === 'webkit';
  let lastMainFrameNavigation = -Infinity;
  page.on('request', request => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) lastMainFrameNavigation = Date.now();
  });
  const unloadFetches: string[] = [];
  const isUnloadFetchLog = (error: Error) => {
    if (!isWebKit || Date.now() - lastMainFrameNavigation > 5000) return false;
    // Playwright splits WebKit's text at its first colon, so the scheme lands
    // in error.name and the rest of the URL in error.message.
    const match = `${error.name}:${error.message}`.match(/^Fetch API cannot load (https?):\/*(\S+) due to access control checks\.$/);
    if (!match) return false;
    const url = new URL(`${match[1]}://${match[2]}`);
    return url.origin === origin || /^\/(rest|auth)\/v1\//.test(url.pathname);
  };
  page.on('pageerror', error => {
    if (isUnloadFetchLog(error)) unloadFetches.push(error.message);
    else errors.push(error.message);
  });
  await page.addInitScript(({ auth }) => {
    localStorage.setItem('smarter-poker-auth', JSON.stringify(auth));
    localStorage.setItem(`sp_firstrun_notif_v2_${auth.user.id}`, String(Date.now()));
    localStorage.setItem('pa-auto-detect-last', String(Date.now()));
    // Push delivery is unrelated to this suite. Model a supported browser with
    // no active push worker, avoiding WebKit's blocked-worker registration gap.
    const worker = navigator.serviceWorker;
    if (worker) {
      const registration = { active: null, waiting: null, installing: null, scope: `${location.origin}/`, update: async () => undefined, unregister: async () => true, addEventListener() {}, removeEventListener() {} };
      worker.register = async () => registration as unknown as ServiceWorkerRegistration;
      worker.getRegistration = async () => registration as unknown as ServiceWorkerRegistration;
      worker.getRegistrations = async () => [registration as unknown as ServiceWorkerRegistration];
    }
  }, { auth: session });
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.startsWith('/auth/v1/')) return json(route, path.endsWith('/token') ? session : user);
    if (path.startsWith('/rest/v1/')) {
      if (path.endsWith('/rpc/fn_caller_session_is_live')) return json(route, true);
      const rows = path.endsWith('/profiles') || path.endsWith('/rpc/get_my_full_profile') ? [profile] : [];
      return json(route, route.request().headers().accept?.includes('vnd.pgrst.object') ? (rows[0] || null) : rows);
    }
    if (url.origin !== origin) return route.abort('blockedbyclient');
    // The unchanged header idly prefetches this fabricated account's profile.
    // Keep that one prefetch inside the fixture; a scoped PA build has no
    // profile page. All PA page data and real navigation still reach Next.
    if (route.request().method() === 'GET'
      && route.request().headers().purpose === 'prefetch'
      && route.request().headers()['x-nextjs-data'] === '1'
      && /^\/_next\/data\/[^/]+\/hub\/user\/local-study-fixture\.json$/.test(path)) {
      return json(route, { pageProps: { profile } });
    }
    if (!path.startsWith('/api/')) return route.continue();
    apiRequests.push(path);
    // UniversalHeader reads its badge from header stats, independently of the
    // AvatarContext VIP endpoint. Both must describe the same local account.
    if (path === '/api/user/get-header-stats') return json(route, {
      success: true, profile, notificationCount: 0, unreadMessages: 0,
      messengerUnread: { total: 0, social: 0, clubs: {}, noticeBoard: {} },
    });
    if (path === '/api/vip/check-status') return json(route, { success: true, isVip: true });
    if (path === '/api/auth/ensure-profile') return json(route, { success: true, profile: { id: OWNER }, isNewUser: false, welcomePackageGranted: false });
    if (path === '/api/training/audit-hand-history') {
      if (route.request().method() !== 'POST') {
        unexpected.push(`Unexpected Import Method: ${route.request().method()}`);
        return json(route, { success: false }, 405);
      }
      const body = route.request().postDataJSON();
      imports.requests.push(body);
      if (body?.source !== 'personal-assistant-live-spot' || body?.evidenceScope !== 'self_reported_live' || typeof body?.handHistoryText !== 'string') {
        unexpected.push('Unexpected Live Spot Import Contract');
        return json(route, { success: false, error: 'Invalid Local Import Contract' }, 400);
      }
      if (imports.failSave) return json(route, {
        success: false, reviewQueue: { saved: false }, code: 'REVIEW_QUEUE_SAVE_INCOMPLETE',
        error: 'The Audit Finished, But Saving To Review My Play Could Not Be Confirmed. Retry This Import Safely To Finish Saving It.',
      }, 503);
      const hands = parseHandHistory(body.handHistoryText);
      const rows = buildImportedSavedHandRows({ userId: OWNER, hands, evidenceScope: body.evidenceScope });
      for (const row of rows) if (!imports.savedHands.has(row.id)) imports.savedHands.set(row.id, row);
      return json(route, {
        success: true, handsParsed: hands.length, complete: true, persisted: true, reconciled: true,
        analyses: hands.map(hand => ({ decisions: Object.entries(hand.streets).flatMap(([street, value]) => (
          (value as { actions?: Array<{ player: string; action: string }> }).actions || []
        ).filter(action => action.player === hand.hero.name).map(action => ({
          street, heroPosition: hand.hero.position, playerAction: action.action, solverVerified: false,
        }))) })),
        reviewQueue: { saved: true, count: rows.length, handIds: rows.map(row => row.id) },
      });
    }
    if (path === '/api/poker/saved-hands') {
      if (route.request().method() !== 'GET') {
        unexpected.push(`Unexpected Review Write: ${route.request().method()}`);
        return json(route, { success: false }, 405);
      }
      if (url.searchParams.has('suggested')) return json(route, { success: true, suggested: [], activePlayRestricted: false });
      if (url.searchParams.has('id')) {
        const hand = imports.savedHands.get(url.searchParams.get('id')!);
        return json(route, hand ? { success: true, hand } : { success: false, error: 'Saved Hand Not Found' }, hand ? 200 : 404);
      }
      const hands = [...imports.savedHands.values()];
      return json(route, { success: true, hands, totalCount: hands.length, unreviewedCount: hands.length, countsComplete: true, nextCursor: null });
    }
    if (path === '/api/assistant/stats') return json(route, { success: true, isDemo: false, stats: { leaksFound: 2, resolvedLeaks: 5 } });
    if (path === '/api/assistant/leaks') return json(route, { success: true, leaks: [], demoLeaks: [], isDemo: false });
    if (path === '/api/assistant/archetypes') return json(route, { success: true, archetypes: [archetype] });
    if (path === '/api/assistant/coaching') return json(route, {
      success: true, snapshot: { priorities: [], summary: { active: 0, resolved: 0, due: 0 }, coverage: {}, trainingPlan: { modules: [] } },
      decisions: [], reviews: [], goals: [], feedback: [], preferences: { saved_view: 'coach', analysis_depth: 'guided', panel_layout: {} },
    });
    if (path === '/api/assistant/sandbox/sandbox-templates') {
      if (route.request().method() !== 'GET') unexpected.push(`Unexpected Template Write: ${route.request().method()}`);
      return json(route, { success: true, templates: TEMPLATES });
    }
    if (path === '/api/assistant/leaks/audit-jobs') return json(route, { success: true, job: null });
    if (path === '/api/assistant/leaks/review') return json(route, { success: true, reviews: [] });
    if (path === '/api/assistant/leaks/examples') return json(route, { success: true, examples: [] });
    if (path === '/api/assistant/data-controls') return json(route, { success: true, counts: {}, receipts: [], retentionDays: null });
    if (path === '/api/sandbox/saved-hands') return json(route, { success: true, hands: [], folders: [] });
    if (path === '/api/sandbox/coach-accuracy') return json(route, { success: true, accuracy: null, total: 0, recent: [] });
    if (path === '/api/sandbox/quiz-leaderboard') return json(route, { success: true, leaderboard: [] });
    if (path.startsWith('/api/assistant/') || path.startsWith('/api/sandbox/') || path.startsWith('/api/poker/')) {
      unexpected.push(path);
      return json(route, { success: false, error: 'Unspecified Local Browser Fixture' }, 501);
    }
    // Unrelated global chrome services are isolated too; no fabricated token
    // or mutation is forwarded to the real app server or another origin.
    return json(route, { success: true, data: [], notifications: [], balance: 0 });
  });
  return { errors, unexpected, apiRequests, imports, unloadFetches };
}
