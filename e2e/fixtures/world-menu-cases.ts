import registry from '../../src/config/world-footer-navigation.json';

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

export const WORLD_MENU_VISUAL_CASES: WorldMenuVisualCase[] = registry.worlds.map((world) => ({
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
