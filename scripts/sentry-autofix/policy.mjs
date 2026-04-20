// Code-modification policy for the WH autofix runner.
//
// DENYLIST: paths Claude may NEVER touch. Matches by substring.
// If *any* changed file matches, the PR is opened as diagnostic-only
// (explanation + Sentry link) with no code changes, labelled
// `sentry-autofix-blocked` for human attention.
//
// ALLOWLIST (for future auto-merge): if every changed file matches,
// the PR may be auto-merged after CI passes. Otherwise PR waits for
// human merge. Controlled by AUTOFIX_MODE env — 'dry-run' forces PR
// regardless. (Phase 5.2.1 sets AUTOFIX_MODE=dry-run in the workflow.)
//
// WORLD HUB LAYOUT NOTES (Next.js 14 Pages Router):
//   pages/           — SSR pages, App Router not in use
//   pages/hub/       — 20 subdirs, public user surface
//   pages/commander/ — club back-office (mixed read/write)
//   pages/api/       — 54 API dirs, 716+ endpoints
//   pages/api/admin/ pages/api/debug/ pages/api/emergency/ — middleware 403
//   lib/             — shared helpers, includes lib/supabaseAdmin
//   components/      — React components
//   middleware.ts    — route gate + admin-secret check
//   scripts/         — CLI/cron/bootstrap scripts, some fire SQL
//   supabase/migrations/ — schema mutations (irreversible)
//   vercel.json      — cron schedule + build config

const DENYLIST = [
  // Middleware / auth / RLS / admin surface. Never autofix.
  'middleware.ts',
  'middleware.js',
  'pages/api/admin/',
  'pages/api/debug/',
  'pages/api/emergency/',
  'pages/api/auth/',
  'pages/api/webhooks/',
  // Ledger / wallet / rake / purchase — money paths.
  '/ledger/',
  '/wallet/',
  '/rake/',
  '/purchase/',
  '/diamonds/',
  '/payouts/',
  '/kyc/',
  '/mfa/',
  '/step-up/',
  // Seven destructive poker routes middleware explicitly protects.
  'pages/api/poker/game/create',
  'pages/api/poker/game/delete',
  'pages/api/poker/game/reset',
  'pages/api/poker/tournament/create',
  'pages/api/poker/tournament/delete',
  'pages/api/poker/table/',
  'pages/api/poker/buyin',
  // Database migrations — irreversible.
  'supabase/migrations/',
  'migrations/',
  // Cron handlers + ledger reconciliation — business-critical.
  'pages/api/cron/',
  'pages/api/crons/',
  'pages/api/reconcile',
  // Supabase service-role helpers.
  'lib/supabaseAdmin',
  'lib/supabase-admin',
  'lib/stripe',
  'lib/serviceRole',
  'lib/auth/',
  'lib/security/',
  'lib/rateLimit',
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
  '.env.example',
  // Webhook receiver + autofix runner — don't let autofix rewrite itself.
  'services/sentry-autofix/',
  'scripts/sentry-autofix/',
];

// Paths considered safe for auto-merge once Phase 5.2.2 flips the flag.
// These are user-visible UI and documentation; zero-risk to chip pool
// integrity.
const ALLOWLIST = [
  'pages/hub/',
  'pages/commander/docs/',
  'pages/commander/reports/',
  'pages/commander/displays/',
  'pages/_document',
  'pages/_app',
  'pages/index',
  'pages/landing/',
  'pages/play/',
  'pages/training/',
  'pages/social/',
  'pages/poker-near-me/',
  'pages/faq',
  'pages/support',
  'pages/about',
  'pages/blog/',
  'components/',
  'styles/',
  'public/hub/club-arena/',
  'public/images/',
  'docs/',
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
 * @param {string[]} paths  file paths Claude's patch touches
 * @returns {{ok:boolean, denied:string[], allowMerge:boolean}}
 */
export function assessPaths(paths) {
  const denied = paths.filter(isDenied);
  if (denied.length) return { ok: false, denied, allowMerge: false };
  const allowMerge = paths.length > 0 && paths.every(isAllowedForAutoMerge);
  return { ok: true, denied: [], allowMerge };
}

export { DENYLIST, ALLOWLIST };
