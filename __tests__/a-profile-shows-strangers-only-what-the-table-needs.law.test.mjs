/**
 * A PROFILE SHOWS STRANGERS ONLY WHAT THE TABLE NEEDS (2026-09-30)
 * ─────────────────────────────────────────────────────────────────────────
 * Decided by Claude on Dan's delegation of 2026-09-30 ("these are all for you
 * to decide not me ... FIX AND FINISH ALL OF THESE"): anything in
 * public.profiles that reveals a person's money, real identity or whereabouts
 * is readable only by that person and platform staff. `authenticated` holds
 * no SELECT grant on those columns for ANY row, and Postgres refuses the
 * whole statement (42501) when one of them is named - so a browser read that
 * names one is not a leak any more, it is an outage ("User Not Found", a
 * balance of 0). The owner reads their own through readOwnProfile().
 *
 * This file holds both halves:
 *   1. readOwnProfile() returns the caller's own columns and nobody else's.
 *   2. No browser-side read of profiles (a file that imports the browser
 *      client) names an owner-only column - in a select, a filter, an
 *      upsert (ON CONFLICT reads the column back), an embedded
 *      `profiles(...)` or a /rest/v1/profiles URL. A plain update that sets
 *      one is fine: UPDATE needs no SELECT on the column it writes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { readOwnProfile, OWNER_PROFILE_RPC } from '../src/lib/ownProfile.js';
import { OWNER_ONLY_PROFILE_COLUMNS, SAFE_PROFILE_COLUMNS } from '../src/lib/profileColumns.js';

const ROOT = new URL('..', import.meta.url).pathname;

function fakeClient(row, error = null) {
  const calls = [];
  return {
    calls,
    rpc: async (name) => {
      calls.push(name);
      return { data: row ? [row] : [], error };
    },
  };
}

test('the owner reads exactly the columns asked for, from the owner path', async () => {
  const sb = fakeClient({ id: 'me', diamonds: 1250, diamond_multiplier: 1.5, username: 'dan' });
  const { data, error } = await readOwnProfile(sb, 'diamonds, diamond_multiplier', {
    expectId: 'me',
  });
  assert.equal(error, null);
  assert.deepEqual(data, { diamonds: 1250, diamond_multiplier: 1.5 });
  assert.deepEqual(sb.calls, [OWNER_PROFILE_RPC]);
});

test("asking for somebody else's private columns reads nothing", async () => {
  const sb = fakeClient({ id: 'me', diamonds: 1250 });
  assert.deepEqual(await readOwnProfile(sb, 'diamonds', { expectId: 'stranger' }), {
    data: null,
    error: null,
  });
});

test('no id means no read at all', async () => {
  const sb = fakeClient({ id: 'me', diamonds: 1250 });
  assert.deepEqual(await readOwnProfile(sb, 'diamonds', { expectId: undefined }), {
    data: null,
    error: null,
  });
  assert.deepEqual(sb.calls, []);
});

test('a refused owner read is an error, not a zero balance', async () => {
  const refusal = { code: '42501', message: 'Not authenticated' };
  const { data, error } = await readOwnProfile(fakeClient(null, refusal), 'diamonds', {
    expectId: 'me',
  });
  assert.equal(data, null);
  assert.equal(error, refusal);
});

test('the stranger allow-list and the owner-only list do not overlap', () => {
  const safe = SAFE_PROFILE_COLUMNS.split(',').map((c) => c.trim());
  const overlap = OWNER_ONLY_PROFILE_COLUMNS.filter((c) => safe.includes(c));
  assert.deepEqual(overlap, []);
  for (const kept of ['id', 'username', 'display_name', 'avatar_url', 'player_number']) {
    assert.ok(safe.includes(kept), `${kept} must stay readable by strangers`);
  }
});

// ── 2. the browser never names an owner-only column on profiles ───────────
const OWNER_ONLY = new Set(OWNER_ONLY_PROFILE_COLUMNS);
const BROWSER_CLIENT =
  /from\s+['"][^'"]*(?:\/lib\/supabase|\.\.\/supabase|\.\/supabase)(?:\.ts|\.js)?['"]|import\(\s*['"][^'"]*\/lib\/supabase['"]\s*\)/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(js|jsx|ts|tsx|mjs)$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(p);
  }
  return out;
}

function browserFiles() {
  const files = [
    ...walk(join(ROOT, 'pages')).filter((f) => !relative(ROOT, f).startsWith('pages/api/')),
    ...walk(join(ROOT, 'src')).filter((f) => !/\/(__tests__|content-engine)\//.test(f)),
    ...walk(join(ROOT, 'vendor/commander-shared/src')),
  ];
  return files.filter((f) => BROWSER_CLIENT.test(readFileSync(f, 'utf8')));
}

function ownerOnlyNamesIn(text) {
  return [...new Set((text.match(/[a-z_]+/g) || []).filter((w) => OWNER_ONLY.has(w)))];
}

test('no browser read of profiles names an owner-only column', () => {
  const offenders = [];
  for (const file of browserFiles()) {
    const src = readFileSync(file, 'utf8');
    const rel = relative(ROOT, file);
    // a .from('profiles') chain: every select/filter argument up to the chain's end
    const chainRe =
      /\.from\(\s*['"`]profiles['"`]\s*\)((?:\s*\.\s*(?:select|upsert|eq|neq|in|ilike|like|or|order|gt|gte|lt|lte|is|not|filter|match)\s*\((?:[^()]|\([^()]*\))*\))+)/g;
    for (const m of src.matchAll(chainRe)) {
      const names = ownerOnlyNamesIn(m[1].replace(/\$\{[^}]*\}/g, ''));
      if (names.length) offenders.push(`${rel}: .from('profiles')${m[1].slice(0, 80)} -> ${names}`);
    }
    // an embedded profiles(...) in any select string
    const embedRe = /\bprofiles(?:\s*!\s*\w+)?\s*\(([^)]*)\)/g;
    for (const m of src.matchAll(embedRe)) {
      const names = ownerOnlyNamesIn(m[1]);
      if (names.length) offenders.push(`${rel}: profiles(${m[1].trim().slice(0, 60)}) -> ${names}`);
    }
    // a hand-built REST read
    for (const m of src.matchAll(/\/rest\/v1\/profiles\?[^`'"]*/g)) {
      const names = ownerOnlyNamesIn(m[0].replace(/\$\{[^}]*\}/g, ''));
      if (names.length) offenders.push(`${rel}: ${m[0].slice(0, 80)} -> ${names}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'These browser reads name a column only its owner may read. Postgres refuses the whole ' +
      'statement (42501) for every signed-in account - read your own through readOwnProfile(), ' +
      "and leave a stranger's out:\n" +
      offenders.join('\n')
  );
});
