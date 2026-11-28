#!/usr/bin/env node
/**
 * Rewrite the room counts in the static files crawlers read (public/llms*.txt,
 * public/opensearch.xml, public/.well-known/*.json) from the LIVE listed-room
 * set, at build time. Runs in `build:vercel` just before `next build`.
 *
 * WHY BUILD TIME, NOT A REWRITE TO AN API ROUTE
 * These files are served by the CDN as plain files (x-matched-path is the
 * file itself). Routing them through a function would put a database read on
 * every crawler request and change their headers, caching and failure mode;
 * an outage would make /llms.txt itself fail. Rewriting them at build time
 * keeps them static, fast and always available, and production builds happen
 * many times a day, so the figure is never older than the last deploy. The
 * pages and APIs that state counts read live data at request/ISR time
 * (src/lib/server/venueStats.mjs); these are the files that cannot.
 *
 * FALLBACK: when the database cannot answer, nothing is written and the
 * committed copy (the venueCount.mjs snapshot, which CI proves is not above
 * live) ships unchanged. This script never fails the build.
 *
 * It only ever replaces the snapshot's own tokens: the room-count label
 * (e.g. "470+") and the venue keys of ai-facts.json. The law tests pin those
 * files to the snapshot label, so every room count in them is that token.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SNAPSHOT_VENUE_STATS, snapshotOverClaims, snapshotBehind } from '../src/lib/venueCount.mjs';
import { readLiveVenueStats } from './lib/live-venue-stats.mjs';

export const STATIC_CLAIM_FILES = Object.freeze([
  'public/llms.txt',
  'public/llms-full.txt',
  'public/opensearch.xml',
  'public/.well-known/agent.json',
  'public/.well-known/ai-plugin.json',
  'public/.well-known/ai-facts.json',
  'public/.well-known/mcp.json',
  'public/.well-known/mcp-registry.json',
]);

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replace the snapshot label with the live one (whole tokens only). Pure. */
export function replaceRoomLabel(text, from, to) {
  if (!from || from === to) return text;
  return text.replace(new RegExp(`(?<![\\d.])${escapeRe(from)}`, 'g'), to);
}

/** ai-facts.json venue keys, wherever they appear. Pure; returns a new object. */
export function applyFactsKeys(json, live) {
  const values = {
    listedVenuesCount: live.listed,
    listedVenuesLabel: live.label,
    verifiedVenuesCount: live.floor,
    venuesWithRecordedVerificationCount: live.verified,
    venueStatesCount: live.stateCount,
  };
  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object') return node;
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      out[k] = Object.prototype.hasOwnProperty.call(values, k) && typeof v !== 'object' ? values[k] : walk(v);
    }
    return out;
  };
  return walk(json);
}

/** The new content of one static file, or null when it would not change / is invalid. */
export function refreshFileContent(rel, text, live, snapshot = SNAPSHOT_VENUE_STATS) {
  let next = replaceRoomLabel(text, snapshot.label, live.label);
  if (rel.endsWith('.json')) {
    let parsed;
    try { parsed = JSON.parse(next); } catch { return null; }
    if (rel.endsWith('ai-facts.json')) {
      next = `${JSON.stringify(applyFactsKeys(parsed, live), null, 2)}\n`;
    }
  }
  return next === text ? null : next;
}

export async function refreshVenueClaims({ root = process.cwd(), client, env, log = console.log } = {}) {
  const tag = '[refresh-venue-claims]';
  const { stats: live, error } = await readLiveVenueStats({ client, env });
  if (!live) {
    log(`${tag} live stats unavailable (${error?.message || 'unknown'}); static files keep the snapshot ${SNAPSHOT_VENUE_STATS.label}`);
    return { written: [], live: null };
  }
  for (const o of snapshotOverClaims(live)) log(`${tag} WARNING snapshot above live: ${o} (client-rendered labels still carry it; lower the snapshot)`);
  for (const b of snapshotBehind(live)) log(`${tag} snapshot behind live: ${b}`);
  const written = [];
  for (const rel of STATIC_CLAIM_FILES) {
    const path = join(root, rel);
    let text;
    try { text = await readFile(path, 'utf8'); } catch { continue; }
    const next = refreshFileContent(rel, text, live);
    if (next == null) continue;
    await writeFile(path, next);
    written.push(rel);
  }
  log(`${tag} live ${live.listed} listed rooms (${live.label}); updated ${written.length ? written.join(', ') : 'nothing (already current)'}`);
  return { written, live };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  refreshVenueClaims().catch((e) => {
    console.log('[refresh-venue-claims] skipped after an error; static files keep the snapshot:', e?.message || e);
  });
}
