import { expect, type Page } from '@playwright/test';
import registry from '../../src/config/world-footer-navigation.json';
import exclusions from './world-menu-signed-out-exclusions.json';

const SCHEME_BY_WORLD: Record<string, string> = Object.freeze({
  'personal-assistant': 'intelligence',
  training: 'training-pulse',
  news: 'newsroom',
  trivia: 'arcade',
  'social-media': 'facebook',
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
  /** Every route that belongs to this world. A redirect between two of these is still this world. */
  routePrefixes: string[];
  accent: string;
  scheme: string;
  texture: string;
};

/**
 * The path and the skip list both come from scripts/ci/world-menu-coverage.mjs,
 * which reads the same registry this file does. There used to be a second,
 * hand-written map of world id to path here. It agreed with the registry for
 * 13 of 14 worlds and was silently wrong about the fourteenth for 16 hours -
 * see that file for what it cost. Scheme and texture stay local because they
 * are properties of the drawer's look, which no registry records.
 */
const SKIPPED: Record<string, { why: string }> = exclusions.worlds;

/** The world's canonical page: the first route prefix it declares. */
const canonicalPath = (world: { id: string; routePrefixes?: string[] }): string => {
  const path = world.routePrefixes?.[0];
  if (!path) throw new Error(`world ${world.id} declares no routePrefixes; the spec has nowhere to go`);
  return path;
};

export const WORLD_MENU_VISUAL_CASES: WorldMenuVisualCase[] = registry.worlds
  .filter((world) => !SKIPPED[world.id])
  .map((world) => ({
  id: world.id,
  label: world.label,
  path: canonicalPath(world),
  routePrefixes: world.routePrefixes,
  accent: world.id === 'social-media'
    ? '#1877F2'
    : world.id === 'poker-near-me'
      ? '#38bdf8'
      : world.accent,
  scheme: SCHEME_BY_WORLD[world.id],
  texture: TEXTURE_BY_WORLD[world.id],
}));

/**
 * SAY WHAT HAPPENED, NOT "TIMEOUT".
 *
 * When /hub/my-clubs started redirecting into the Social Media world, this
 * suite reported ten-second timeouts on an opaque `expect.poll` predicate,
 * twice per run, for sixteen hours. Nothing in that output said "the route
 * you asked for sent you somewhere else", which is the entire diagnosis.
 *
 * Checking the landing path against every route the world claims turns the
 * next one into a sentence. It has to be every route, not just the canonical
 * one: /hub/marketplace is an unconditional 307 to /hub/diamond-store, and
 * both are the Marketplace world, so that redirect is correct and must pass.
 */
export async function expectStillInWorld(page: Page, world: WorldMenuVisualCase) {
  const landed = new URL(page.url()).pathname;
  const inWorld = world.routePrefixes.some(
    (prefix) => landed === prefix || landed.startsWith(`${prefix}/`),
  );
  expect(
    inWorld,
    `${world.label}: asked for ${world.path} and landed on ${landed}, which belongs to no route this world claims `
    + `(${world.routePrefixes.join(', ')}). That route redirects out of the world, so it cannot render its drawer. `
    + 'Either the world moved (fix routePrefixes in src/config/world-footer-navigation.json) '
    + 'or it was retired (add it to e2e/fixtures/world-menu-signed-out-exclusions.json).',
  ).toBe(true);
}
