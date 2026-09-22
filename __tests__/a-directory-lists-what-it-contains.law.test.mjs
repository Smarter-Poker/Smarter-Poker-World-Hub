/**
 * A DIRECTORY LISTS WHAT IT CONTAINS (AEO phase 3, 2026-09-19).
 *
 * Every on-page defect the earlier laws chased was about what a page said.
 * This one is about whether a page can be found at all.
 *
 * Measured on production, crawling from / as OAI-SearchBot with no
 * JavaScript, depth 3, and comparing what was discovered against the 1,191
 * routes in the sitemap:
 *
 *     family                       in sitemap   reachable
 *     /hub/venues/<id>                    478    476  100%
 *     /hub/poker-near-me/in/...           389    389  100%
 *     /hub/series/<id>                    225      0    0%
 *     /hub/tours/<code>                    28      0    0%
 *     /hub/home-games/in/...                4      0    0%
 *                                        ----   ----
 *                                        1191    915   77%
 *
 * 276 pages, 23 percent of the site, were listed in the sitemap and linked
 * from nowhere. The cause was the same in each case and it was not subtle:
 * the directory card navigated through its wrapper's onClick with
 * router.push, so the server HTML carried no href. A reader with a mouse
 * never noticed. A crawler saw a grid of divs.
 *
 * A sitemap is an invitation. A link is the road. The venue directory had
 * the road all along (PokerNearMeLocationPage.jsx renders a real Link per
 * venue) which is exactly why venues measured 100 percent while the two
 * directories beside it measured zero.
 *
 * THIS LAW: every detail family the sitemap offers must be reachable by an
 * href somewhere in the tree. It does not accept router.push, because a
 * crawler cannot click. It resolves one property and one function deep, so
 * a card may keep its URL in a field (tour.detail_path) rather than
 * building the string inline, which is how the tour link stays equal to the
 * sitemap's.
 *
 * Reads source files; runs in the Build Safety Gate with no install.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The dynamic route families the sitemap fills in. Each one is a directory
 * of real pages, and each one needs a road in. Taken from the page files
 * that serve them rather than written out twice.
 */
const FAMILIES = [
  {
    prefix: '/hub/tours/',
    page: 'pages/hub/tours/[code].js',
    directory: 'src/components/poker-series/TourCard.js',
  },
  {
    prefix: '/hub/series/',
    page: 'pages/hub/series/[id].js',
    directory: 'pages/hub/poker-series.js',
  },
  {
    prefix: '/hub/venues/',
    page: 'pages/hub/venues/[id].js',
    directory: 'src/components/poker-near-me/PokerNearMeLocationPage.jsx',
  },
  {
    prefix: '/hub/home-games/in/',
    page: 'pages/hub/home-games/in/[state]',
    directory: 'pages/hub/home-games/in/index.js',
  },
];

const SOURCE_DIRS = ['pages', 'src'];
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'coverage']);

function sourceFiles() {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|jsx|mjs)$/.test(entry.name)) out.push(full);
    }
  };
  for (const dir of SOURCE_DIRS) walk(path.join(ROOT, dir));
  return out;
}

/**
 * Comments are stripped line by line. A block-comment regex over a file this
 * size eats most of it: that bug hid a missing title for a whole afternoon
 * earlier in this programme, so it is not repeated here.
 */
function stripComments(src) {
  const kept = [];
  let inBlock = false;
  for (const line of src.split('\n')) {
    const trimmed = line.trim();
    if (inBlock) {
      if (trimmed.includes('*/')) inBlock = false;
      continue;
    }
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) inBlock = true;
      continue;
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
    kept.push(line.replace(/\s\/\/\s.*$/, ''));
  }
  return kept.join('\n');
}

const IDENT = /[A-Za-z_$][\w$]*/g;

/**
 * WHY THIS RESOLVES BY IMPORT AND NOT BY NAME.
 *
 * The first version of this law built one map of every name in the tree and
 * followed any identifier in an href through it. "canonical" is declared in
 * dozens of files, one of them mentions /hub/tours/, and so every href in
 * the site resolved to every family. The law passed with the links deleted,
 * which is the only result a law must never give.
 *
 * Names are therefore looked up in the file that used them, and a name that
 * came from an import is looked up in the file it was imported from. A card
 * may hold its URL in a helper, but the law has to be able to walk to it.
 */
function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [base, `${base}.js`, `${base}.jsx`, `${base}.mjs`,
    path.join(base, 'index.js'), path.join(base, 'index.jsx')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** localName -> the file it was imported from, per file. */
function collectImports(file, src) {
  const map = new Map();
  for (const m of src.matchAll(/import\s+\{([^}]{1,300})\}\s+from\s+['"]([^'"]+)['"]/g)) {
    const target = resolveImport(file, m[2]);
    if (!target) continue;
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) map.set(name, target);
    }
  }
  return map;
}

/** name -> what it stands for, within one file. */
function collectDefinitions(src) {
  const defs = new Map();
  const add = (name, text) => {
    if (!name || !text) return;
    const prior = defs.get(name);
    defs.set(name, prior ? `${prior}\n${text}` : text);
  };
  for (const m of src.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g)) {
    add(m[1], src.slice(m.index, m.index + 1500));
  }
  for (const m of src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]{1,300})/g)) {
    add(m[1], m[2]);
  }
  return defs;
}

const isPlainLiteral = (expr) => /^\s*(['"`])(?:(?!\1).)*\1\s*$/.test(expr);

/**
 * Does this expression, written in `file`, lead to `prefix`? Two hops: the
 * href itself, and one name it names.
 */
function leadsTo(expr, prefix, file, world, depth = 2, seen = new Set()) {
  if (!expr) return false;
  if (expr.includes(prefix)) return true;
  if (isPlainLiteral(expr) || depth <= 0) return false;
  const here = world.get(file);
  if (!here) return false;
  for (const name of expr.match(IDENT) || []) {
    const key = `${file}::${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const local = here.defs.get(name);
    if (local && leadsTo(local, prefix, file, world, depth - 1, seen)) return true;
    const imported = here.imports.get(name);
    if (imported && world.has(imported)) {
      const there = world.get(imported).defs.get(name);
      if (there && leadsTo(there, prefix, imported, world, depth - 1, seen)) return true;
    }
  }
  return false;
}

/** Every href an element in this tree is given, with the file that wrote it. */
function collectHrefs(world) {
  const out = [];
  for (const [file, entry] of world) {
    for (const m of entry.src.matchAll(/href=\{([^}]{1,200})\}/g)) out.push([file, m[1]]);
    for (const m of entry.src.matchAll(/href="([^"]{1,200})"/g)) out.push([file, m[1]]);
  }
  return out;
}

test('the directory for every detail family renders a link into it', () => {
  const files = sourceFiles();
  assert.ok(files.length > 200, 'expected to walk the whole tree');

  const world = new Map();
  for (const file of files) {
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    world.set(file, { src, defs: collectDefinitions(src), imports: collectImports(file, src) });
  }

  const broken = [];
  for (const family of FAMILIES) {
    const file = path.join(ROOT, family.directory);
    const entry = world.get(file);
    if (!entry) {
      broken.push(`${family.prefix} - its directory ${family.directory} is gone`);
      continue;
    }
    const hrefs = [
      ...[...entry.src.matchAll(/href=\{([^}]{1,200})\}/g)].map((m) => m[1]),
      ...[...entry.src.matchAll(/href="([^"]{1,200})"/g)].map((m) => m[1]),
    ];
    if (!hrefs.some((href) => leadsTo(href, family.prefix, file, world))) {
      broken.push(`${family.prefix} - ${family.directory} renders no href into it`);
    }
  }

  assert.deepEqual(
    broken,
    [],
    'A directory that lists pages must link to them:\n  '
      + broken.join('\n  ')
      + '\nA card that navigates only through onClick and router.push is not '
      + 'a link, because a crawler cannot click. Measured on production on '
      + '2026-09-19, that one difference left 276 of 1,191 sitemap routes '
      + 'reachable from nowhere.',
  );
});

test('the pages behind those families exist', () => {
  for (const family of FAMILIES) {
    const target = path.join(ROOT, family.page);
    assert.ok(
      fs.existsSync(target) || fs.existsSync(`${target}.js`) || fs.existsSync(path.join(target, 'index.js')),
      `${family.prefix} has no page file at ${family.page}`,
    );
  }
});

/**
 * A CAP ON THE CARDS IS NOT A CAP ON THE LINKS (AEO phase 3, 2026-09-19).
 *
 * /hub/poker-series renders SSR_SERIES_PREVIEW_LIMIT cards, ordered by what
 * is running or starting soonest. That is the right page for a reader and it
 * is why, measured after the directory started rendering links at all, 67 of
 * the 225 series pages were still reachable from nowhere: the cap is a
 * reading decision that silently became a crawling one.
 *
 * The index below the cards carries every series as a name and a link. This
 * pins the difference: the preview may be capped, the index may not.
 */
test('the series index is not capped the way the cards are', () => {
  const src = fs.readFileSync(path.join(ROOT, 'pages/hub/poker-series.js'), 'utf8');

  const index = src.match(/function buildSeriesIndex\(rows\)\s*\{[\s\S]*?\n\}/);
  assert.ok(index, 'the series index is still built');
  assert.doesNotMatch(
    index[0],
    /\.slice\(/,
    'buildSeriesIndex must not cap the list. The cards are capped; the links '
      + 'are how a crawler reaches a page, and a page the sitemap offers has '
      + 'to have a road in.',
  );

  const preview = src.match(/function buildSeriesPreview\(rows, generatedAt\)\s*\{[\s\S]*?\n\}/);
  assert.ok(preview, 'the capped card preview is still there');
  assert.match(
    preview[0],
    /SSR_SERIES_PREVIEW_LIMIT/,
    'and it is the one that carries the cap, so the two are not confused',
  );

  assert.match(src, /seriesIndex\.map\(/, 'the index is rendered, not only computed');

  // This used to pin buildSeriesIndex(allData) as text and broke the day the
  // rows started being cleaned on the way through. What matters is that the
  // index and the capped preview are built from the SAME collection, so the
  // index can never be the preview by another name.
  const indexArg = src.match(/seriesIndex\s*=\s*buildSeriesIndex\(([A-Za-z_$][\w$]*)\)/);
  const previewArg = src.match(/initialSeries\s*=\s*buildSeriesPreview\(([A-Za-z_$][\w$]*),/);
  assert.ok(indexArg, 'the index is built from a named collection');
  assert.ok(previewArg, 'so is the preview');
  assert.equal(
    indexArg[1],
    previewArg[1],
    `the index is built from ${indexArg[1]} and the cards from ${previewArg[1]}. `
      + 'They have to read the same rows, or the index is a second, smaller '
      + 'list pretending to be the whole one.',
  );
  assert.notEqual(indexArg[1], 'initialSeries', 'and never from the capped preview itself');
});

/**
 * A CONTENT INDEX IS ONE HOP FROM THE FRONT DOOR (AEO phase 3, 2026-09-22).
 *
 * /learn, /glossary and /compare shipped with 128 pages between them. Crawled
 * from / the day they went live, the 41 lessons and 12 comparisons were
 * reachable from nowhere: in the sitemap, linked by no page. The same defect
 * this law was written for, arriving again with the next thing built.
 *
 * Every content index the sitemap generates from a module must be linked from
 * the landing page, which a crawler always starts from, and must be a real page.
 */
test('every content index is linked from the front page', () => {
  const landing = fs.readFileSync(path.join(ROOT, 'src/components/landing/LandingProductSummary.js'), 'utf8');
  const indexes = ['/learn', '/glossary', '/compare'];
  for (const index of indexes) {
    assert.match(landing, new RegExp(`href: '${index}'`), `the landing page links ${index}`);
    assert.ok(fs.existsSync(path.join(ROOT, 'pages', index.slice(1), 'index.js')), `${index} is a real page`);
  }
  assert.match(landing, /LANDING_GUIDES\.map\(/, 'and the guides are rendered, not only listed');
  const home = fs.readFileSync(path.join(ROOT, 'pages/index.js'), 'utf8');
  assert.match(home, /<LandingProductSummary \/>/, 'on the page a crawler starts from');
});
