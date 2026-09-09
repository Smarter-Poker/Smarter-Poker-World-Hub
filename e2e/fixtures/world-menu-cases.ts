import registry from '../../src/config/world-footer-navigation.json';

/*
 * Worlds these specs cannot visit, and why. Every spec that reads
 * WORLD_MENU_VISUAL_CASES runs with an EMPTY storage state on purpose, so a
 * world whose only route needs a session can never show its drawer here.
 *
 * my-clubs: `/hub/my-clubs` became a 307 into `/hub/social-pages?tab=managed`
 * on 2026-09-08 (PR #1586 retired a 1,127-line duplicate of Social Pages
 * Managed). That commit listed five things pointing at the old route and
 * satisfied all five with the redirect; this fixture was the sixth and was
 * missed. The world itself still exists in the registry, but its remaining
 * route prefix is `/hub/my-venues`, which redirects to /auth/login when there
 * is no session.
 *
 * The cost of missing it was not one red test. These specs run
 * `describe.configure({ mode: 'serial' })`, so the first failure SKIPS
 * everything after it: my-clubs sits seventh of fourteen, and Video Library,
 * Odds Calculator, Bankroll Manager, Toke Tracker, Preflop Charts, Poker Near
 * Me and Marketplace have not been checked in either browser since. Global
 * Footer E2E has been red on every branch in the repo since that merge, which
 * is the failure mode CLAUDE.md 10.8 is about: a check nobody can see.
 *
 * To restore this world's coverage, give it a route that renders its drawer
 * without a session and delete its entry here; the reference snapshots are
 * regenerated with `--update-snapshots`.
 */
const WORLDS_WITHOUT_A_PUBLIC_ROUTE: ReadonlySet<string> = new Set(['my-clubs']);

const PATH_BY_WORLD: Record<string, string> = Object.freeze({
  'personal-assistant': '/hub/personal-assistant',
  training: '/hub/training',
  news: '/hub/news',
  trivia: '/hub/trivia',
  'social-media': '/hub/social-media',
  'diamond-arena': '/hub/diamond-arena',
  'my-clubs': '/hub/my-clubs',
  'video-library': '/hub/video-library',
  'odds-calculator': '/hub/poker-tools',
  'bankroll-manager': '/hub/bankroll-manager',
  'toke-tracker': '/hub/toke-tracker',
  'preflop-charts': '/hub/preflop-charts',
  'poker-near-me': '/hub/poker-near-me',
  marketplace: '/hub/marketplace',
});

const SCHEME_BY_WORLD: Record<string, string> = Object.freeze({
  'personal-assistant': 'intelligence',
  training: 'training-pulse',
  news: 'newsroom',
  trivia: 'arcade',
  'social-media': 'facebook',
  'diamond-arena': 'diamond-lacquer',
  'my-clubs': 'club-crest',
  'video-library': 'cinema',
  'odds-calculator': 'analytics',
  'bankroll-manager': 'ledger',
  'toke-tracker': 'chip-vault',
  'preflop-charts': 'range-matrix',
  'poker-near-me': 'casino-realism',
  marketplace: 'luxury-market',
});

const TEXTURE_BY_WORLD: Record<string, string> = Object.freeze({
  'personal-assistant': 'circuit',
  training: 'pulse',
  news: 'ticker',
  trivia: 'scanline',
  'social-media': 'facebook-clean',
  'diamond-arena': 'facets',
  'my-clubs': 'crest',
  'video-library': 'cinema',
  'odds-calculator': 'analytic-grid',
  'bankroll-manager': 'ledger',
  'toke-tracker': 'chip-rings',
  'preflop-charts': 'range-matrix',
  'poker-near-me': 'machined',
  marketplace: 'luxury-facets',
});

export type WorldMenuVisualCase = {
  id: string;
  label: string;
  path: string;
  accent: string;
  scheme: string;
  texture: string;
};

export const WORLD_MENU_VISUAL_CASES: WorldMenuVisualCase[] = registry.worlds
  .filter((world) => !WORLDS_WITHOUT_A_PUBLIC_ROUTE.has(world.id))
  .map((world) => ({
    id: world.id,
    label: world.label,
    path: PATH_BY_WORLD[world.id],
    accent: world.id === 'social-media'
      ? '#1877F2'
      : world.id === 'poker-near-me'
        ? '#38bdf8'
        : world.accent,
    scheme: SCHEME_BY_WORLD[world.id],
    texture: TEXTURE_BY_WORLD[world.id],
  }));

/*
 * A world is excluded only because it has no route these specs can reach, and
 * that must stay a deliberate, visible decision rather than a silently
 * shrinking list. If an excluded id is no longer in the registry, the world is
 * gone and its entry above should go with it.
 */
const registryIds = new Set(registry.worlds.map((world) => world.id));
for (const id of WORLDS_WITHOUT_A_PUBLIC_ROUTE) {
  if (!registryIds.has(id)) {
    throw new Error(
      `world-menu-cases: "${id}" is excluded as unreachable but is no longer in `
      + 'src/config/world-footer-navigation.json. Remove it from '
      + 'WORLDS_WITHOUT_A_PUBLIC_ROUTE.',
    );
  }
}
