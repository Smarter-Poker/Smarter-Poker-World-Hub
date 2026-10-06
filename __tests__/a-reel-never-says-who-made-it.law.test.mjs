/**
 * LAW - A REEL NEVER SAYS WHO MADE IT (2026-10-05)
 *
 * Dan, 2026-09-02: "NOBODY SHOULD EVER EVER EVER BE ABLE TO LOOK AT OUR CODE
 * OR USE A DEVELOPER TOOL AND FIND THIS OUT."
 *
 * public.social_reels.origin_type is 'horse' on every Reel a horse published
 * (202+ rows, 2026-10-05) and on nothing else. A census of every other column
 * (2026-10-05, horse authors = profiles joined to content_authors) found none
 * that is set only on a horse's Reel: a player who pastes a YouTube link and
 * shares it to Reels gets the same source_type ('youtube'), playback, rights,
 * identity and lineage columns (publish_user_video_reel and
 * fn_social_posts_video_to_reel_mirror build both).
 *
 * Before this law, three things told a player which Reels a horse made:
 *
 *   - /api/reels/feed (and every reader behind it) returned origin_type;
 *   - the Reel's source name was read from the linked post's metadata
 *     clip_source, which only the publishing pipeline writes, so a horse's
 *     YouTube Reel named its channel and a player's said "Original YouTube
 *     Source";
 *   - anon and authenticated held table-level SELECT on social_reels, so the
 *     public key read origin_type from REST and from every Realtime payload.
 *
 * Now:
 *
 *   - every Reel a server route hands a browser leaves the reader through
 *     toBrowserReel() (src/lib/socialReelShape.js): a horse's Reel and a
 *     player's Reel come back with the same keys, none of them origin_type;
 *   - a source name is the video's own (the Reel's attribution or the shared
 *     library's record), never the post's metadata;
 *   - no browser file names origin_type or reads social_reels with `*` or a
 *     server-only column; Realtime handlers never depend on it;
 *   - SOCIAL_REEL_COLUMN_ACCESS classifies every column of the live table, so
 *     the database grant (column by column, origin_type withheld) is built
 *     from the same decision. Once the client is live the grant lands, and a
 *     browser read that names origin_type is an outage as well as a leak.
 *
 * IF THIS FILE GOES RED, YOUR CHANGE IS THE BUG. Read the Reel on the server
 * and send the browser toBrowserReel(row).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import {
  BROWSER_REEL_COLUMNS,
  BROWSER_REEL_SELECT,
  SERVER_ONLY_REEL_COLUMNS,
  SOCIAL_REEL_COLUMN_ACCESS,
  toBrowserReel,
} from '../src/lib/socialReelShape.js';
import { REEL_PLAYBACK_FIELDS } from '../src/lib/reelsRealtimeRefresh.mjs';
import { VIDEO_LIBRARY_MAX_FUTURE_SKEW_MS, VIDEO_LIBRARY_VERIFICATION_MAX_AGE_MS } from '../src/lib/videoLibraryAvailability.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CODE_EXT = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const rel = (abs) => relative(ROOT, abs).split('\\').join('/');
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');

/** Every column of public.social_reels, in catalogue order (live, 2026-10-05). */
const LIVE_COLUMNS = [
  'id', 'author_id', 'video_url', 'thumbnail_url', 'caption', 'view_count', 'like_count',
  'created_at', 'source_story_id', 'is_public', 'source_post_id', 'share_count',
  'comment_count', 'updated_at', 'source_type', 'youtube_video_id', 'media_status',
  'original_youtube_url', 'origin_type', 'playback_type', 'topic', 'rights_status',
  'source_asset_id', 'canonical_asset_key', 'publication_key', 'legacy_transition_expires_at',
  'is_deleted', 'native_processing_requested', 'attribution_name', 'attribution_url',
  'disclosure_kind', 'sponsor_name', 'made_for_kids', 'moderation_state', 'takedown_case_id',
  'taken_down_at',
];

// ── The browser file set (pages, their imports, React and service code) ────

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (CODE_EXT.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

const isServerPath = (r) => r.startsWith('pages/api/') || r.startsWith('app/api/') || r.startsWith('src/lib/server/');

const SPECIFIERS = [
  /\bfrom\s*['"]([^'"\n]+)['"]/g,
  /\bimport\s*['"]([^'"\n]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
];

function resolveSpecifier(fromFile, spec) {
  let base;
  if (spec.startsWith('./') || spec.startsWith('../')) base = resolve(dirname(fromFile), spec);
  else if (spec.startsWith('@/')) base = join(ROOT, spec.slice(2));
  else return null;
  const candidates = [base, ...CODE_EXT.map((e) => base + e), ...CODE_EXT.map((e) => join(base, 'index' + e))];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile() && CODE_EXT.some((e) => c.endsWith(e))) return c;
  }
  return null;
}

function browserFiles() {
  const seen = new Set();
  const stack = [
    ...walk(join(ROOT, 'pages')).filter((f) => !rel(f).startsWith('pages/api/')),
    ...walk(join(ROOT, 'app')).filter((f) => !rel(f).startsWith('app/api/')),
  ];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const code = stripComments(readFileSync(file, 'utf8'));
    for (const re of SPECIFIERS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(code))) {
        const target = resolveSpecifier(file, m[1]);
        if (target && !isServerPath(rel(target))) stack.push(target);
      }
    }
  }
  for (const dir of ['src/components', 'src/hooks', 'src/contexts', 'src/services', 'src/stores']) {
    for (const f of walk(join(ROOT, dir))) seen.add(f);
  }
  return [...seen].filter((f) => !isServerPath(rel(f)));
}

const BROWSER_FILES = browserFiles();

/**
 * Browser files that may name origin_type, and why. Neither reads a Reel's:
 * socialHelpers builds the provenance a player's own new post is written
 * with (the database overwrites it for a horse), and socialPostShape is the
 * filter that strips origin_type from a post (World Hub #2130).
 */
const ORIGIN_TYPE_WRITERS = new Set(['src/lib/socialHelpers.js', 'src/lib/socialPostShape.js']);

// ── Reading a social_reels chain out of source ──────────────────────────────

function socialReelChains(code) {
  const tables = new Set(["'social_reels'", '"social_reels"', '`social_reels`']);
  const varRe = /\b(?:const|let|var)\s+(\w+)\s*=\s*[^;\n]*['"`]social_reels['"`]/g;
  let m;
  while ((m = varRe.exec(code))) tables.add(m[1]);
  const chains = [];
  const fromRe = /\.from\(\s*([^)\s]+)\s*\)/g;
  while ((m = fromRe.exec(code))) {
    if (!tables.has(m[1])) continue;
    const rest = code.slice(m.index + m[0].length);
    const stop = rest.search(/;|\n\s*\n|\.from\(/);
    chains.push(rest.slice(0, stop === -1 ? 600 : Math.min(stop, 1200)));
  }
  return chains;
}

function selectArgs(chain) {
  const out = [];
  const re = /\.select\(/g;
  let m;
  while ((m = re.exec(chain))) {
    let depth = 1;
    let i = m.index + m[0].length;
    let arg = '';
    let quote = null;
    for (; i < chain.length && depth > 0; i++) {
      const ch = chain[i];
      if (quote) {
        if (ch === quote && chain[i - 1] !== '\\') quote = null;
      } else if (ch === "'" || ch === '"' || ch === '`') quote = ch;
      else if (ch === '(') depth++;
      else if (ch === ')') { depth--; if (depth === 0) break; }
      else if (ch === ',' && depth === 1) break;
      arg += ch;
    }
    out.push(arg.trim());
  }
  return out;
}

function selectProblems(arg) {
  if (arg === '') return ['select() with no columns returns every column'];
  const literal = /^(['"`])([\s\S]*)\1$/.exec(arg);
  if (!literal) {
    return arg === 'BROWSER_REEL_SELECT' ? [] : [`select(${arg}): name BROWSER_REEL_SELECT or literal columns`];
  }
  const text = literal[2].replace(/\$\{\s*BROWSER_REEL_SELECT\s*\}/g, '');
  const problems = [];
  if (/\$\{/.test(text)) problems.push(`select(${arg}): only \${BROWSER_REEL_SELECT} may be interpolated`);
  let top = '';
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0) top += ch;
  }
  for (const raw of top.split(',')) {
    const col = raw.trim();
    if (!col) continue;
    if (col === '*') { problems.push(`select(${arg}): * reads origin_type`); continue; }
    if (/:|!/.test(col)) continue;
    const name = col.split(/::|->/)[0].trim();
    if (SOCIAL_REEL_COLUMN_ACCESS[name] !== 'browser') {
      problems.push(`select(${arg}): ${name} is not a browser column of social_reels`);
    }
  }
  return problems;
}

// ── The decision: one column map, matching the live table ──────────────────

test('every live column of social_reels is classified, and origin_type is server-only', () => {
  assert.deepEqual(Object.keys(SOCIAL_REEL_COLUMN_ACCESS), LIVE_COLUMNS);
  for (const [column, access] of Object.entries(SOCIAL_REEL_COLUMN_ACCESS)) {
    assert.ok(access === 'browser' || access === 'server', column);
  }
  assert.deepEqual(SERVER_ONLY_REEL_COLUMNS, ['origin_type']);
  assert.ok(!BROWSER_REEL_COLUMNS.includes('origin_type'));
  assert.equal(BROWSER_REEL_SELECT, BROWSER_REEL_COLUMNS.join(','));
  assert.equal(BROWSER_REEL_COLUMNS.length, LIVE_COLUMNS.length - 1);
});

test('toBrowserReel drops origin_type and the reader\'s working fields, keeps the rest', () => {
  const out = toBrowserReel({ id: 'r1', origin_type: 'horse', _cursor: 'c', _managedLibrary: false, topic: 'poker' });
  assert.deepEqual(out, { id: 'r1', topic: 'poker' });
  assert.equal(toBrowserReel(null), null);
});

// ── The browser never reads the label ───────────────────────────────────────

test('the browser file set is real', () => {
  const files = BROWSER_FILES.map(rel);
  for (const f of [
    'pages/hub/reels.js',
    'src/components/social/Reels.jsx',
    'src/components/social/ReelsFeedCarousel.jsx',
    'src/lib/reelsFeedClient.js',
    'src/lib/reelsRealtimeRefresh.mjs',
  ]) {
    assert.ok(files.includes(f), f);
  }
  assert.ok(!files.some((f) => isServerPath(f)), 'server code is not browser code');
});

test('no browser file names origin_type (only the poster\'s own write provenance)', () => {
  const offenders = BROWSER_FILES
    .map(rel)
    .filter((f) => !ORIGIN_TYPE_WRITERS.has(f))
    .filter((f) => /\borigin_type\b/.test(stripComments(read(f))));
  assert.deepEqual(offenders, []);
  for (const f of ORIGIN_TYPE_WRITERS) {
    assert.doesNotMatch(stripComments(read(f)), /\.origin_type\b/, `${f} only writes origin_type, it never reads one`);
  }
});

test('the selector understands the shapes it guards', () => {
  assert.equal(selectProblems("'*'").length, 1);
  assert.equal(selectProblems("'id, origin_type'").length, 1);
  assert.equal(selectProblems("'id, a_new_column'").length, 1);
  assert.deepEqual(selectProblems("'like_count'"), []);
  assert.deepEqual(selectProblems('BROWSER_REEL_SELECT'), []);
  assert.equal(
    socialReelChains("const t = a ? 'social_posts' : 'social_reels'; db.from(t).select('*');").length,
    1,
  );
});

test('no browser read of social_reels asks for *, origin_type or an unclassified column, or filters on origin_type', () => {
  const offenders = [];
  let reads = 0;
  for (const file of BROWSER_FILES) {
    const code = stripComments(readFileSync(file, 'utf8'));
    for (const chain of socialReelChains(code)) {
      for (const arg of selectArgs(chain)) {
        reads++;
        for (const p of selectProblems(arg)) offenders.push(`${rel(file)}: ${p}`);
      }
      if (/origin_type/.test(chain)) offenders.push(`${rel(file)}: filters social_reels on origin_type`);
    }
    const restRe = /rest\/v1\/social_reels\?[^'"`\s]*/g;
    let m;
    while ((m = restRe.exec(code))) {
      const select = /(?:^|[?&])select=([^&]*)/.exec(m[0].slice(m[0].indexOf('?')));
      if (!select) offenders.push(`${rel(file)}: REST read of social_reels without select`);
      else for (const p of selectProblems(`'${decodeURIComponent(select[1])}'`)) offenders.push(`${rel(file)}: REST ${p}`);
    }
    const embedRe = /social_reels(?:![\w]+)?(?::\w+)?\s*\(([^)]*)\)/g;
    while ((m = embedRe.exec(code))) {
      if (/^\s*\*\s*$/.test(m[1]) || /origin_type/.test(m[1])) offenders.push(`${rel(file)}: embeds social_reels(${m[1].trim()})`);
    }
  }
  assert.ok(reads >= 2, `the scan found the reads (${reads})`);
  assert.deepEqual(offenders, []);
});

test('Realtime never depends on origin_type: it is not in the playback signature', () => {
  for (const column of SERVER_ONLY_REEL_COLUMNS) {
    assert.ok(!REEL_PLAYBACK_FIELDS.includes(column), `${column} is never in a Realtime payload`);
  }
  for (const field of REEL_PLAYBACK_FIELDS) {
    assert.notEqual(SOCIAL_REEL_COLUMN_ACCESS[field], 'server', `${field} reaches the browser`);
  }
});

test('the client plays a community Reel without being told who made it', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test-project.supabase.co';
  const source = read('src/lib/reelsFeedClient.js');
  const { isUnclassifiedNativeCommunityReel, isPlayableReel } = await import(
    `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  );
  const authorId = '11111111-1111-4111-8111-111111111111';
  const community = {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    author_id: authorId,
    video_url: `https://test-project.supabase.co/storage/v1/object/public/social-media/videos/${authorId}/c.mp4`,
    source_post_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    canonical_asset_key: 'native:c',
    topic: 'unknown',
    is_public: true,
    is_deleted: false,
    media_status: 'ready',
    source_type: 'native',
    playback_type: 'native',
    rights_status: 'user_authorized',
    native_processing_requested: false,
  };
  assert.equal(isUnclassifiedNativeCommunityReel(community), true);
  assert.equal(isPlayableReel(community, { category: 'for-you' }), true);
});

// ── The server reader hands a browser the same shape for anybody ────────────

const SERVER = read('src/lib/server/reelsFeed.js');

function loadReader() {
  const transformed = SERVER
    .replace(/import \{ createClient \} from '[^']+';\n/, '')
    .replace(/import \{[\s\S]*?\} from '\.\.\/videoLibraryAvailability';\n/, '')
    .replace(/import \{ toBrowserReel \} from '\.\.\/socialReelShape';\n/, '')
    .replace(/export class /g, 'class ')
    .replace(/export async function /g, 'async function ')
    .replace(/export const /g, 'const ');
  assert.doesNotMatch(transformed, /^import /m, 'the harness strips every import it replaces');
  const context = {
    BLOCKED_VIDEO_LIBRARY_IDS: [],
    VIDEO_LIBRARY_ALLOWED_TYPES: ['cash', 'tournament', 'slots'],
    VIDEO_LIBRARY_MAX_FUTURE_SKEW_MS,
    VIDEO_LIBRARY_VERIFICATION_MAX_AGE_MS,
    toBrowserReel,
    Buffer, Date, Error, JSON, Map, Math, Number, Object, Promise, Set, String, URL, console,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://test-project.supabase.co' } },
    createClient() { throw new Error('not used'); },
  };
  context.globalThis = context;
  vm.runInNewContext(
    `${transformed}\nglobalThis.__normalize = normalizeEligibleRow; globalThis.__publicRow = publicRow;`,
    context,
  );
  return { normalize: context.__normalize, publicRow: context.__publicRow };
}

test('a horse\'s YouTube Reel and a player\'s come back in the same shape, with the same source name', () => {
  const { normalize, publicRow } = loadReader();
  const now = new Date().toISOString();
  const HORSE = '0a0a0a0a-0000-4000-8000-00000000000a';
  const PLAYER = '0b0b0b0b-0000-4000-8000-00000000000b';
  const reel = (n, author, postId, overrides = {}) => ({
    id: `00000000-0000-4000-8000-00000000000${n}`,
    author_id: author,
    caption: `clip ${n}`,
    video_url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE',
    thumbnail_url: null,
    view_count: 0, like_count: 0, comment_count: 0, share_count: 0,
    created_at: now, updated_at: now,
    is_public: true, is_deleted: false,
    source_type: 'youtube', source_post_id: postId, source_story_id: null,
    youtube_video_id: 'M7lc1UVf-VE', media_status: 'ready',
    original_youtube_url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE',
    playback_type: 'youtube_embed', topic: 'poker', rights_status: 'embed_only',
    source_asset_id: null, canonical_asset_key: 'youtube:M7lc1UVf-VE', publication_key: null,
    native_processing_requested: false, attribution_name: null, attribution_url: null,
    disclosure_kind: 'organic', sponsor_name: null, made_for_kids: null,
    moderation_state: 'active', takedown_case_id: null, taken_down_at: null,
    legacy_transition_eligible: false, legacy_transition_expires_at: null,
    ...overrides,
  });
  const horsePost = 'aaaaaaaa-0000-4000-8000-0000000000a1';
  const playerPost = 'bbbbbbbb-0000-4000-8000-0000000000b1';
  const post = (id, author, metadata) => ({
    id, author_id: author, content_type: 'video', visibility: 'public', audience_mode: 'public',
    is_deleted: false, is_flagged: false, metadata,
  });
  const context = {
    assetById: new Map(),
    assetByYoutube: new Map(),
    verificationByYoutube: new Map([['M7lc1UVf-VE', { verification_status: 'resolved', resolved: true, last_verified_at: now }]]),
    failedYoutubeIds: new Set(),
    livePostIds: new Set([horsePost, playerPost]),
    postById: new Map([
      [horsePost, post(horsePost, HORSE, { clip_source: 'Pipeline Channel', scheduler: 'x', clip_type: 'poker' })],
      [playerPost, post(playerPost, PLAYER, {})],
    ]),
    verifiedNativeObjects: new Set(),
  };
  const options = { category: 'poker' };
  const horse = normalize(reel(1, HORSE, horsePost, { origin_type: 'horse' }), context, 'all', options);
  const player = normalize(reel(2, PLAYER, playerPost, { origin_type: 'social_post' }), context, 'all', options);
  assert.ok(horse && player, 'both Reels are eligible');
  const profiles = new Map([
    [HORSE, { id: HORSE, username: 'h', full_name: 'H', avatar_url: null }],
    [PLAYER, { id: PLAYER, username: 'p', full_name: 'P', avatar_url: null }],
  ]);
  const out = [publicRow(horse, profiles), publicRow(player, profiles)];
  const keys = (row) => Object.keys(row).sort().join(',');
  assert.equal(keys(out[0]), keys(out[1]), 'the same keys for a horse and a player');
  for (const row of out) {
    assert.equal(Object.hasOwn(row, 'origin_type'), false);
    assert.equal(Object.keys(row).some((k) => k.startsWith('_')), false);
  }
  assert.equal(out[0].source_name, out[1].source_name, 'the source name is the video\'s, not the publisher\'s');
  assert.equal(out[0].channel_name, out[1].channel_name);
  assert.ok(!JSON.stringify(out).includes('Pipeline Channel'), 'a pipeline note never reaches the response');
  for (const field of ['source_type', 'playback_type', 'rights_status', 'canonical_asset_key', 'topic', 'thumbnail_url']) {
    assert.equal(out[0][field], out[1][field], field);
  }
});

test('the reader never reads a post\'s metadata or origin_type, and every exit is toBrowserReel', () => {
  const code = stripComments(SERVER);
  assert.doesNotMatch(code, /\.metadata\b|clip_source/);
  const context = code.match(/table: 'social_posts',\s*select: \[([\s\S]*?)\]\.join/)?.[1] || '';
  assert.ok(context, 'the eligibility context reads social_posts');
  assert.doesNotMatch(context, /'metadata'|'origin_type'/);
  assert.doesNotMatch(code, /^\s*origin_type:/m, 'a normalized Reel carries no origin_type');
  assert.match(code, /function publicRow[\s\S]*?return toBrowserReel\(\{/);
  assert.match(code, /data: detail\.row \? toBrowserReel\(detail\.row\) : null/);
  assert.doesNotMatch(stripComments(read('pages/api/news/videos.js')), /origin_type/);
  for (const route of ['pages/api/reels/feed.js', 'pages/api/reels/profile.js', 'pages/api/reels/mine.js', 'pages/api/reels/saved.js', 'pages/api/reels/saved-status.js', 'pages/api/news/reels.js']) {
    assert.doesNotMatch(stripComments(read(route)), /origin_type/, `${route} adds no origin_type`);
  }
});

test('the live verifier holds the API to it', () => {
  const live = stripComments(read('scripts/ci/reels-live-check.mjs'));
  assert.match(live, /'A Reel response says who published it'/);
  assert.doesNotMatch(live, /ALLOWED_ORIGINS/);
  const reads = live.match(/\.origin_type\b/g) || [];
  assert.equal(reads.length, 1, 'the probe classifies origins with the service role only');
  assert.match(live, /select\('id,origin_type'\)[\s\S]{0,200}origins\.set\(row\.id, row\.origin_type\)/);
});
