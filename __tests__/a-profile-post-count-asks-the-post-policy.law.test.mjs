/**
 * LAW - A PROFILE POST COUNT ASKS THE POST POLICY, SET-WISE (2026-11-26)
 *
 * Dan, 2026-11-26: fix every bug at the root, harden it, and test it before
 * claiming success.
 *
 * A signed-out visitor opening a profile sent
 *   HEAD /rest/v1/social_posts?author_id=eq.<id>  (Prefer: count=exact)
 * and got 500. Postgres evaluated the social_posts SELECT policies once per
 * row; the restrictive video_posts_public_select_guard calls SECURITY DEFINER
 * helpers that re-plan on every nested call. Author 00000000-...-0001 has
 * 5,636 posts: 7.9 s against anon's 3 s statement_timeout.
 *
 * public.fn_social_profile_post_count (Club Arena migration
 * 20261126232411_a_profile_post_count_asks_the_post_policy_set_wise.sql)
 * counts exactly what those policies show the caller, evaluated set-wise
 * (about 0.5 s for that author), and refuses if the rule changes.
 *
 * IF THIS FILE GOES RED, YOUR CHANGE IS THE BUG. Count an author's posts with
 * fetchVisiblePostCount from src/lib/socialPostCount.js.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchVisiblePostCount } from '../src/lib/socialPostCount.js';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

const CALLERS = {
  'pages/hub/user/[username].js': 3,
  'src/lib/cacheWarmer.js': 1,
};

// .from('social_posts').select(..., { count: 'exact' ... })
const RAW_COUNT = /from\(\s*['"]social_posts['"]\s*\)\s*\.select\([^)]*count:\s*['"]exact['"]/g;

test('no profile caller counts social_posts per row through RLS', () => {
  for (const [rel, uses] of Object.entries(CALLERS)) {
    const src = read(rel);
    assert.deepEqual(src.match(RAW_COUNT) ?? [], [], `${rel}: count posts with fetchVisiblePostCount`);
    assert.equal(
      (src.match(/fetchVisiblePostCount\(supabase, /g) ?? []).length,
      uses,
      `${rel}: every post count goes through fetchVisiblePostCount`
    );
    assert.match(src, /import \{ fetchVisiblePostCount \} from '[./]+(src\/lib\/)?socialPostCount'/);
  }
});

test('no other browser or API file counts social_posts the slow way', () => {
  // verify-profile-schema.js counts the whole table as service_role (no RLS).
  const allowed = new Set(['src/lib/socialPostCount.js', 'pages/api/admin/verify-profile-schema.js']);
  const walk = (dir) =>
    fs.readdirSync(path.join(REPO, dir), { withFileTypes: true }).flatMap((e) => {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(rel);
      return /\.(m?js|jsx|ts|tsx)$/.test(e.name) ? [rel] : [];
    });
  const offenders = ['pages', 'src', 'components']
    .filter((d) => fs.existsSync(path.join(REPO, d)))
    .flatMap(walk)
    .filter((rel) => !allowed.has(rel))
    .filter((rel) => (read(rel).match(RAW_COUNT) ?? []).length > 0);
  assert.deepEqual(offenders, [], 'count an author\'s posts with fetchVisiblePostCount');
});

function fakeSupabase({ rpc, table }) {
  const calls = [];
  return {
    calls,
    rpc: async (name, args) => {
      calls.push(['rpc', name, args]);
      return rpc;
    },
    from(name) {
      calls.push(['from', name]);
      const q = {
        select: (cols, opts) => (calls.push(['select', cols, opts]), q),
        eq: async (col, val) => (calls.push(['eq', col, val]), table),
      };
      return q;
    },
  };
}

const AUTHOR = '00000000-0000-0000-0000-000000000001';

test('the count comes from fn_social_profile_post_count', async () => {
  const sb = fakeSupabase({ rpc: { data: 3013, error: null } });
  assert.deepEqual(await fetchVisiblePostCount(sb, AUTHOR), { count: 3013, error: null });
  assert.deepEqual(sb.calls, [['rpc', 'fn_social_profile_post_count', { p_author_id: AUTHOR }]]);
});

test('before the function exists, or when it refuses a changed rule, the table is asked', async () => {
  for (const code of ['PGRST202', '42883', '55000']) {
    const sb = fakeSupabase({
      rpc: { data: null, error: { code, message: 'x' } },
      table: { count: 7, error: null },
    });
    assert.deepEqual(await fetchVisiblePostCount(sb, AUTHOR), { count: 7, error: null }, code);
    assert.deepEqual(sb.calls.slice(1), [
      ['from', 'social_posts'],
      ['select', 'id', { count: 'exact', head: true }],
      ['eq', 'author_id', AUTHOR],
    ]);
  }
});

test('any other error keeps the old number instead of a second slow query', async () => {
  const error = { code: '57014', message: 'canceling statement due to statement timeout' };
  const sb = fakeSupabase({ rpc: { data: null, error } });
  assert.deepEqual(await fetchVisiblePostCount(sb, AUTHOR), { count: null, error });
  assert.equal(sb.calls.length, 1);
});

test('no author, no query', async () => {
  const sb = fakeSupabase({});
  assert.deepEqual(await fetchVisiblePostCount(sb, null), { count: null, error: null });
  assert.equal(sb.calls.length, 0);
});
