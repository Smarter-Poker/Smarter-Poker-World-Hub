// Code-modification policy for the World Hub autofix runner.
//
// WH surface includes: Next.js Pages Router monolith (pages/, lib/,
// components/, middleware.ts), Club Commander (pages/commander/), the
// 57 cron jobs under pages/api/cron/, and the hub-side rendering of the
// Club Arena SPA. The engine itself is NOT in this repo.
//
// DENYLIST: paths Claude may NEVER touch. Substring match.
// ALLOWLIST (for Phase 5.2.2 auto-merge): every changed file must match.
// Phase 5.2.1 runs dry-run regardless → every fix is a draft PR.

const DENYLIST = [
  // Security surface.
  'middleware.ts',
  'pages/api/admin/',
  'pages/api/debug/',
  'pages/api/emergency/',
  'pages/api/auth/',
  'pages/api/webhooks/',

  // Money / balance surface — never auto-fix.
  '/ledger/',
  '/wallet/',
  '/rake/',
  '/purchase/',
  '/diamonds/',
  '/payouts/',
  '/chip-pool',
  '/kyc/',
  '/mfa/',
  '/step-up/',

  // The 7 destructive poker routes that middleware.ts explicitly 410s.
  'pages/api/poker/game/create',
  'pages/api/poker/game/delete',
  'pages/api/poker/game/reset',
  'pages/api/poker/tournament/create',
  'pages/api/poker/tournament/delete',
  'pages/api/poker/table/',
  'pages/api/poker/buyin',

  // Cron jobs — 57 of them, each tied to vercel.json schedule.
  // A bad autofix here can misfire once an hour, forever.
  'pages/api/cron/',

  // Database migrations (irreversible).
  'supabase/migrations/',

  // Service-role Supabase clients — admin privilege leak risk.
  'lib/supabaseAdmin',
  'lib/supabase-admin',
  'lib/serviceRole',
  'lib/stripe',

  // Infra configs.
  'vercel.json',
  'next.config',
  '.github/workflows/',
  '.husky/',

  // Dependency manifests.
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',

  // Env + secrets.
  '.env',
  '.env.local',
  '.env.production',

  // Autofix pipeline self-modification (loop risk).
  'services/sentry-autofix/',
  'scripts/sentry-autofix/',

  // Commander admin scope (separate review track).
  'pages/commander/admin/',
  'pages/commander/td/',
];

const ALLOWLIST = [
  // Hub-side user pages.
  'pages/hub/',
  'pages/landing/',
  'pages/play/',
  'pages/training/',
  'pages/social/',
  'pages/poker-near-me/',
  'pages/blog/',
  'pages/_app',
  'pages/_document',
  'pages/_error',

  // Safe Commander subpages only (docs/reports/displays).
  'pages/commander/docs/',
  'pages/commander/reports/',
  'pages/commander/displays/',

  // Generic components / styling / assets.
  'components/',
  'styles/',
  'public/hub/club-arena/',
  'public/images/',
  'docs/',

  // Common lib helpers (non-admin).
  'src/components/',
  'src/hooks/',
  'src/lib/',
  'src/styles/',
];

export function isDenied(path) {
  return DENYLIST.some(p => path.includes(p));
}

export function isAllowedForAutoMerge(path) {
  return ALLOWLIST.some(p => path.includes(p));
}

/**
 * @param {string[]} paths
 * @returns {{ok:boolean, denied:string[], allowMerge:boolean}}
 */
export function assessPaths(paths) {
  const denied = paths.filter(isDenied);
  if (denied.length) return { ok: false, denied, allowMerge: false };
  const allowMerge = paths.length > 0 && paths.every(isAllowedForAutoMerge);
  return { ok: true, denied: [], allowMerge };
}

export { DENYLIST, ALLOWLIST };
