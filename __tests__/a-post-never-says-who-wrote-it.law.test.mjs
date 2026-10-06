/**
 * LAW - A POST NEVER SAYS WHO WROTE IT (2026-10-05)
 *
 * Dan, 2026-09-02: "NOBODY SHOULD EVER EVER EVER BE ABLE TO LOOK AT OUR CODE
 * OR USE A DEVELOPER TOOL AND FIND THIS OUT."
 *
 * Two columns of public.social_posts labelled a horse's post:
 *
 *   - origin_type, 'horse' on every clip a horse published;
 *   - metadata, the publishing pipeline's notes (scheduler, publication_key,
 *     semantic_key, grounding, clip_source, phase6_mode, ...), which only a
 *     horse's posts carry, including the ones whose origin_type is
 *     'user_upload'.
 *
 * The feed read both with `select('*')`, /api/social/feed returned both, and
 * any player could read both with the public key from the Network tab. Now:
 *
 *   - no browser file selects `*` from social_posts, names origin_type or
 *     metadata in a social_posts read, or filters on them; whole-post reads
 *     name BROWSER_POST_SELECT (src/lib/socialPostShape.js);
 *   - every column a browser read names is classified in
 *     SOCIAL_POST_COLUMN_ACCESS, so a new column is a decision, not an
 *     accident (the database grants SELECT per column: a new column is not
 *     readable by anon or authenticated until a GRANT says so);
 *   - a Realtime payload is never trusted for metadata: the feed re-reads the
 *     post through GET /api/social/post;
 *   - every server route that hands a post to a browser passes it through
 *     toBrowserPost() / displayMetadata(): no origin_type, and only the
 *     metadata keys the UI renders, none of which the pipeline writes.
 *
 * Once the client is live, anon and authenticated lose SELECT on the two
 * columns, so a browser read that names them is an outage as well as a leak.
 *
 * IF THIS FILE GOES RED, YOUR CHANGE IS THE BUG. Read the post in a pages/api
 * route with the service role and send the browser toBrowserPost(row).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as socialPostShape from '../src/lib/socialPostShape.js';
import {
  BROWSER_POST_COLUMNS,
  BROWSER_POST_SELECT,
  POST_DISPLAY_METADATA_KEYS,
  SOCIAL_POST_COLUMN_ACCESS,
  displayMetadata,
  toBrowserPost,
} from '../src/lib/socialPostShape.js';
import { id as harnessId, runFeed, textPost, youtubeVideoPost } from './social-feed-api-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const CODE_EXT = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const rel = (abs) => relative(ROOT, abs).split('\\').join('/');

const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');

/** Every key the publishing pipeline writes into a horse's post metadata (live census, 2026-10-05). */
const PIPELINE_KEYS = [
  'scheduler', 'publication_key', 'publication_contract', 'semantic_key', 'phrase_norm',
  'verification_source', 'asset_key', 'clip_source', 'clip_id', 'clip_type', 'topic',
  'grounded', 'grounded_type', 'grounding', 'phase6_mode', 'news_type', 'source_id',
  'youtube_video_id',
];

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

function entryFiles() {
  return [
    ...walk(join(ROOT, 'pages')).filter((f) => !rel(f).startsWith('pages/api/')),
    ...walk(join(ROOT, 'app')).filter((f) => !rel(f).startsWith('app/api/')),
  ];
}

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

/** Every page, everything it imports (transitively), and all React and service code under src. */
function browserFiles() {
  const seen = new Set();
  const stack = entryFiles();
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
  for (const dir of ['src/components', 'src/hooks', 'src/contexts', 'src/services']) {
    for (const f of walk(join(ROOT, dir))) seen.add(f);
  }
  return [...seen].filter((f) => !isServerPath(rel(f)));
}

const BROWSER_FILES = browserFiles();

// ── Reading a social_posts chain out of source ──────────────────────────────

/** The text of every query chain on social_posts: `.from(<x>)` up to the end of its statement. */
function socialPostChains(code) {
  const tables = new Set(["'social_posts'", '"social_posts"', '`social_posts`']);
  // A variable that can name the table (`const t = a ? 'social_posts' : 'social_reels'`).
  const varRe = /\b(?:const|let|var)\s+(\w+)\s*=\s*[^;\n]*['"`]social_posts['"`]/g;
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

/** The first argument of every .select( in a chain, as source text. */
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

const LABEL_COLUMN = /(^|[^\w])(origin_type|metadata)([^\w]|$)/;

/** Problems with one select argument on social_posts, or []. */
function selectProblems(arg) {
  if (arg === '') return ['select() with no columns returns every column'];
  const problems = [];
  const literal = /^(['"`])([\s\S]*)\1$/.exec(arg);
  if (!literal) {
    if (arg !== 'BROWSER_POST_SELECT') problems.push(`select(${arg}): name BROWSER_POST_SELECT or literal columns`);
    return problems;
  }
  const text = literal[2].replace(/\$\{\s*BROWSER_POST_SELECT\s*\}/g, '');
  if (/\$\{/.test(text)) problems.push(`select(${arg}): only \${BROWSER_POST_SELECT} may be interpolated`);
  // Columns of social_posts itself: the top level, embeds removed.
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
    if (col === '*') { problems.push(`select(${arg}): * reads origin_type and metadata`); continue; }
    if (/:|!/.test(col)) continue; // an embed of another table
    const name = col.split(/::|->/)[0].trim();
    if (LABEL_COLUMN.test(name)) problems.push(`select(${arg}): ${name} is never a browser column`);
    else if (SOCIAL_POST_COLUMN_ACCESS[name] !== 'browser') {
      problems.push(`select(${arg}): ${name} is not classified 'browser' in SOCIAL_POST_COLUMN_ACCESS`);
    }
  }
  return problems;
}

// ── The browser never reads the labels ──────────────────────────────────────

test('the browser file set is real (pages, their imports, services)', () => {
  const files = BROWSER_FILES.map(rel);
  for (const f of ['pages/hub/social-media/index.js', 'pages/hub/user/[username].js', 'src/services/SocialService.js', 'src/lib/feedCache.js']) {
    assert.ok(files.includes(f), f);
  }
  assert.ok(!files.some((f) => f.startsWith('pages/api/')), 'API routes are server code');
});

test('the selector understands the shapes it guards', () => {
  assert.deepEqual(selectArgs(".select('*', { count: 'exact', head: true })"), ["'*'"]);
  assert.deepEqual(selectArgs('.insert(x).select().maybeSingle()'), ['']);
  assert.equal(selectProblems("'*'").length, 1);
  assert.equal(selectProblems("'*, author:profiles!author_id(id)'").length, 1);
  assert.equal(selectProblems("'id, metadata'").length, 1);
  assert.equal(selectProblems("'id,origin_type'").length, 1);
  assert.equal(selectProblems("'id, a_new_column'").length, 1, 'an unclassified column is a decision');
  assert.deepEqual(selectProblems("'id, media_urls, author:profiles!author_id(id, username)'"), []);
  assert.deepEqual(selectProblems('BROWSER_POST_SELECT'), []);
  assert.deepEqual(selectProblems('`${BROWSER_POST_SELECT}, author:profiles!author_id(id)`'), []);
  assert.equal(socialPostChains("const t = a ? 'social_posts' : 'social_reels'; db.from(t).select('*');").length, 1);
});

test('no browser read of social_posts asks for *, origin_type or metadata, or filters on them', () => {
  const offenders = [];
  let reads = 0;
  for (const file of BROWSER_FILES) {
    const code = stripComments(readFileSync(file, 'utf8'));
    for (const chain of socialPostChains(code)) {
      for (const arg of selectArgs(chain)) {
        reads++;
        for (const p of selectProblems(arg)) offenders.push(`${rel(file)}: ${p}`);
      }
      if (/\.(eq|neq|in|is|not|filter|match|contains|like|ilike|gt|gte|lt|lte|or|order)\(\s*['"`][^'"`]*(origin_type|metadata)/.test(chain)) {
        offenders.push(`${rel(file)}: filters social_posts on origin_type or metadata`);
      }
    }
    // Raw REST reads of the table.
    const restRe = /rest\/v1\/social_posts\?[^'"`\s]*/g;
    let m;
    while ((m = restRe.exec(code))) {
      const select = /(?:^|[?&])select=([^&]*)/.exec(m[0].slice(m[0].indexOf('?')));
      if (select) {
        reads++;
        for (const p of selectProblems(`'${decodeURIComponent(select[1])}'`)) offenders.push(`${rel(file)}: REST ${p}`);
      }
      if (LABEL_COLUMN.test(m[0])) offenders.push(`${rel(file)}: REST read names origin_type or metadata`);
    }
    // social_posts embedded from another table.
    const embedRe = /social_posts(?:![\w]+)?(?::\w+)?\s*\(([^)]*)\)/g;
    while ((m = embedRe.exec(code))) {
      if (/^\s*\*\s*$/.test(m[1]) || LABEL_COLUMN.test(m[1])) offenders.push(`${rel(file)}: embeds social_posts(${m[1].trim()})`);
    }
  }
  assert.ok(reads >= 15, `the scan found the reads (${reads})`);
  assert.deepEqual(offenders, [], 'a browser read names only BROWSER_POST_SELECT or browser columns');
});

test('a Realtime payload on social_posts is never trusted for metadata or origin_type', () => {
  const offenders = [];
  for (const file of BROWSER_FILES) {
    const code = stripComments(readFileSync(file, 'utf8'));
    if (!/table:\s*['"`]social_posts['"`]/.test(code)) continue;
    if (/payload\.(new|old)\??\.(metadata|origin_type)\b/.test(code)) offenders.push(`${rel(file)}: reads a label from the payload`);
    if (/\.\.\.\s*payload\.(new|old)\b/.test(code)) offenders.push(`${rel(file)}: spreads a raw payload into a post`);
  }
  assert.deepEqual(offenders, []);
  const feed = stripComments(read('pages/hub/social-media/index.js'));
  assert.match(feed, /fetchBrowserPost\(updatedPost\.id\)/, 'an update re-reads the post through the server');
  assert.doesNotMatch(feed, /updatedPost\.metadata/);
  assert.match(stripComments(read('src/services/SocialService.js')), /toBrowserPost\(payload\.new\)/);
});

test('the deep link reads one post through GET /api/social/post', () => {
  const feed = stripComments(read('pages/hub/social-media/index.js'));
  assert.match(feed, /const p = await fetchBrowserPost\(String\(postId\)\)/);
  assert.match(stripComments(read('src/lib/socialPostClient.js')), /\/api\/social\/post\?id=/);
});

test('feedCache decides a library post without origin_type or metadata', () => {
  const src = stripComments(read('src/lib/feedCache.js'));
  assert.doesNotMatch(src, /origin_type|\.metadata\b/);
});

// ── What the UI renders, and nothing else ───────────────────────────────────

test('displayMetadata keeps only the keys the UI renders', () => {
  const horse = Object.fromEntries(PIPELINE_KEYS.map((k) => [k, `value-${k}`]));
  assert.deepEqual(displayMetadata(horse), {}, "a horse's notes leave nothing behind");
  assert.deepEqual(displayMetadata(null), {});
  assert.deepEqual(displayMetadata([1, 2]), {});
  assert.deepEqual(displayMetadata('scheduler'), {});
  const page = { page_name: 'Club', page_avatar_url: 'https://x/a.png', scheduler: 'phase6', ended: false, notes: null };
  assert.deepEqual(displayMetadata(page), { page_name: 'Club', page_avatar_url: 'https://x/a.png', ended: false });
  const source = { puzzle: { id: 1 } };
  const out = displayMetadata(source);
  assert.notEqual(out, source, 'a fresh object');
});

test('no display key is a key the publishing pipeline writes', () => {
  assert.deepEqual(POST_DISPLAY_METADATA_KEYS.filter((k) => PIPELINE_KEYS.includes(k)), []);
  assert.equal(new Set(POST_DISPLAY_METADATA_KEYS).size, POST_DISPLAY_METADATA_KEYS.length);
});

const RENDERERS = [
  'pages/hub/social-media/index.js',
  'pages/hub/user/[username].js',
  'src/components/social/SmarterPokerStyleCard.jsx',
];

function renderedMetadataKeys() {
  const keys = new Set();
  for (const file of RENDERERS) {
    const code = stripComments(read(file));
    const res = [/\b(?:post|p|video)\??\.metadata\??\.(\w+)/g, /\bmeta\??\.(\w+)/g];
    for (const re of res) {
      let m;
      while ((m = re.exec(code))) keys.add(m[1]);
    }
  }
  return keys;
}

test('every display key is read by the UI, and every key the UI reads is a display key', () => {
  const rendered = renderedMetadataKeys();
  assert.deepEqual(POST_DISPLAY_METADATA_KEYS.filter((k) => !rendered.has(k)), [], 'an unrendered key does not belong on the list');
  assert.deepEqual([...rendered].filter((k) => !POST_DISPLAY_METADATA_KEYS.includes(k)), [], 'a rendered key that is not on the list would always be missing');
});

test('toBrowserPost drops origin_type, reduces metadata, keeps the rest', () => {
  const row = { id: 'p1', content: 'hi', origin_type: 'horse', metadata: { scheduler: 'x', stream_id: 's1' } };
  const out = toBrowserPost(row);
  assert.deepEqual(out, { id: 'p1', content: 'hi', metadata: { stream_id: 's1' } });
  assert.equal(Object.hasOwn(out, 'origin_type'), false);
  assert.deepEqual(toBrowserPost({ id: 'p2' }), { id: 'p2', metadata: {} }, 'metadata is always an object');
});

test('every column is classified, and the two labels are server-only', () => {
  assert.equal(SOCIAL_POST_COLUMN_ACCESS.origin_type, 'server');
  assert.equal(SOCIAL_POST_COLUMN_ACCESS.metadata, 'server');
  for (const [column, access] of Object.entries(SOCIAL_POST_COLUMN_ACCESS)) {
    assert.ok(access === 'browser' || access === 'server', column);
  }
  assert.ok(!BROWSER_POST_COLUMNS.includes('origin_type'));
  assert.ok(!BROWSER_POST_COLUMNS.includes('metadata'));
  assert.equal(BROWSER_POST_SELECT, BROWSER_POST_COLUMNS.join(','));
  assert.ok(BROWSER_POST_COLUMNS.includes('id') && BROWSER_POST_COLUMNS.includes('author_id'));
});

// ── Server routes hand a browser the same shape for anybody ─────────────────

test('/api/social/feed: a horse post and a human post come back in the same shape', async () => {
  const horse = harnessId(901);
  const human = harnessId(902);
  const rows = [
    textPost(1, {
      author: horse,
      origin_type: 'user_upload',
      metadata: { scheduler: 'phase6', publication_key: 'k', grounding: { a: 1 }, clip_type: 'x' },
    }),
    textPost(2, { author: human, metadata: {} }),
    youtubeVideoPost(3, {
      author: horse,
      metadata: { clip_source: 'c', semantic_key: 's', topic: 'poker', verification_source: 'v' },
    }),
    textPost(4, { author: human, metadata: { page_name: 'Club', scheduler: 'never-shown' } }),
  ];
  const { res } = await runFeed(rows, { query: { limit: '10' } });
  assert.equal(res.statusCode, 200);
  const posts = res.body.posts;
  assert.equal(posts.length, 4);
  const shape = (p) => Object.keys(p).sort().join(',');
  for (const post of posts) {
    assert.equal(shape(post), shape(posts[0]), 'every post has the same keys');
    assert.equal(Object.hasOwn(post, 'origin_type'), false);
    assert.deepEqual(Object.keys(post.metadata).filter((k) => !POST_DISPLAY_METADATA_KEYS.includes(k)), []);
  }
  const byId = new Map(posts.map((p) => [p.id, p]));
  assert.deepEqual(byId.get(harnessId(1)).metadata, {});
  assert.deepEqual(byId.get(harnessId(3)).metadata, {});
  assert.deepEqual(byId.get(harnessId(4)).metadata, { page_name: 'Club' });
  const body = JSON.stringify(res.body);
  for (const key of PIPELINE_KEYS.filter((k) => k !== 'topic' && k !== 'publication_key' && k !== 'youtube_video_id')) {
    assert.ok(!body.includes(`"${key}"`), `${key} never leaves the server`);
  }
  assert.ok(!body.includes('origin_type'));
});

test('every server route that selects the server column list hands back a browser shape', () => {
  const offenders = [];
  for (const file of walk(join(ROOT, 'pages/api'))) {
    const code = stripComments(readFileSync(file, 'utf8'));
    if (!/\bPOST_SELECT\b/.test(code)) continue;
    if (!/\b(toBrowserPost|displayMetadata)\b/.test(code)) offenders.push(rel(file));
  }
  assert.deepEqual(offenders, []);
  for (const route of ['pages/api/social/profile-videos.js', 'pages/api/social/saved-posts.js']) {
    assert.match(stripComments(read(route)), /data: eligible\.map\(toBrowserPost\)/, route);
  }
  assert.match(stripComments(read('pages/api/social/auto-post.js')), /data: toBrowserPost\(data\)/);
  const feed = stripComments(read('pages/api/social/feed.js'));
  assert.match(feed, /metadata: displayMetadata\(meta\)/);
  assert.doesNotMatch(feed, /origin_type: p\.origin_type/);
});

// ── GET /api/social/post, run for real with its imports injected ────────────

const ts = require('typescript');
const POST_ROUTE = read('pages/api/social/post.js');
const POST_ID = '00000000-0000-4000-8000-0000000000aa';
const TOKEN = 'caller-token-0123456789abcdef0123456789';

function loadPostRoute({ visibleRow, notes = { scheduler: 'phase6', ended: true }, visibleError = null }) {
  const calls = [];
  const createClient = (url, key, options) => {
    const auth = options?.global?.headers?.Authorization || null;
    return {
      from(table) {
        const q = { key, auth, table, filters: [] };
        calls.push(q);
        const builder = {
          select(cols) { q.select = cols; return builder; },
          eq(col, v) { q.filters.push([col, v]); return builder; },
          maybeSingle() {
            if (key === 'service-key') return Promise.resolve({ data: { metadata: notes }, error: null });
            return Promise.resolve({ data: visibleError ? null : visibleRow, error: visibleError });
          },
        };
        return builder;
      },
    };
  };
  const shape = { ...socialPostShape };
  const mocks = {
    '../../../src/lib/supabaseServerClient': { createClient },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {} } },
    '../../../src/lib/socialPostShape': shape,
  };
  const code = ts.transpileModule(POST_ROUTE, {
    fileName: 'post.js',
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'process', code)(
    (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
    module,
    module.exports,
    { env: { SUPABASE_URL: 'https://post.test.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key', SUPABASE_SERVICE_ROLE_KEY: 'service-key' } }
  );
  return { mod: module.exports, calls };
}

function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

test('/api/social/post reads the row as the caller and only the metadata with the service role', async () => {
  const { mod, calls } = loadPostRoute({ visibleRow: { id: POST_ID, content: 'x', author: { id: 'a' } } });
  const res = fakeRes();
  await mod.default({ method: 'GET', query: { id: POST_ID }, headers: { authorization: `Bearer ${TOKEN}` } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.post, { id: POST_ID, content: 'x', author: { id: 'a' }, metadata: { ended: true } });
  assert.equal(res.headers['cache-control'], 'private, no-store, max-age=0');
  const [visible, notes] = calls;
  assert.equal(visible.key, 'anon-key', 'row-level security decides who sees the row');
  assert.equal(visible.auth, `Bearer ${TOKEN}`);
  assert.ok(visible.select.startsWith(`${BROWSER_POST_SELECT},`), 'only browser columns, plus the author');
  assert.doesNotMatch(visible.select, LABEL_COLUMN);
  assert.doesNotMatch(visible.select, /\*/);
  assert.deepEqual(visible.filters, [['id', POST_ID], ['is_deleted', false]]);
  assert.equal(notes.key, 'service-key');
  assert.equal(notes.select, 'metadata', 'origin_type is never read');
});

test('/api/social/post: hidden or missing is 404, a bad id is 400, a failure says nothing', async () => {
  let { mod, calls } = loadPostRoute({ visibleRow: null });
  let res = fakeRes();
  await mod.default({ method: 'GET', query: { id: POST_ID }, headers: {} }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(calls.length, 1, 'no metadata is read for a post the caller cannot see');
  assert.equal(calls[0].auth, null, 'signed out reads with the public key');

  res = fakeRes();
  await mod.default({ method: 'GET', query: { id: 'nope' }, headers: {} }, res);
  assert.equal(res.statusCode, 400);

  ({ mod } = loadPostRoute({ visibleRow: null, visibleError: { message: 'down' } }));
  res = fakeRes();
  await mod.default({ method: 'GET', query: { id: POST_ID }, headers: {} }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.post, undefined);
});
