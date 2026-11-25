// Production incident, 2026-11-24: every GET /learn/hud-stats/<stat>.md except
// /vpip.md threw `TypeError: Cannot read properties of undefined (reading
// 'toLowerCase')` inside `Array.find` (43 errors on /api/hub-tool-markdown in 24h).
//
// Root cause: the Markdown route rendered HUD stats from a second catalog, the
// MCP server's HUD_STATS_CATALOG, through a renderer that read fields that
// catalog does not have (`stat`, `formula`, `exploitHigh`, `exploitLow`; it has
// `code` and `exploitNote`) and whose slugs differ from the pages' slugs
// (`flop-cbet` vs `cbet-flop`). The HTML pages use src/content/learn/hudStats.js.
// The fix makes the Markdown twin render from that same canonical catalog.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HUD_STATS, HUD_STATS_URL } from '../src/content/learn/hudStats.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROUTE = 'pages/api/hub-tool-markdown.js';
const routeSource = fs.readFileSync(path.join(ROOT, ROUTE), 'utf8');

// Resolve the module the Markdown route actually imports a renderer from, so the
// assertions below exercise the code the route runs, not a copy of it.
function routeImportOf(name) {
  const re = /import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g;
  for (const m of routeSource.matchAll(re)) {
    const names = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    if (names.includes(name)) return path.resolve(ROOT, 'pages/api', m[2]);
  }
  return null;
}

async function routeRenderer(name) {
  const file = routeImportOf(name);
  assert.ok(file, `${ROUTE} must import ${name}`);
  const mod = await import(pathToFileURL(file).href);
  assert.equal(typeof mod[name], 'function', `${name} must be exported by ${file}`);
  return { file, fn: mod[name] };
}

test('the HUD Markdown twin imports its renderers from the canonical page catalog', () => {
  for (const name of ['renderHudStatsIndexMarkdown', 'renderHudStatDetailMarkdown']) {
    assert.equal(
      path.relative(ROOT, routeImportOf(name) || ''),
      'src/content/learn/hudStats.js',
      `${name} must come from the same catalog as /learn/hud-stats pages`
    );
  }
  const ingestion = fs.readFileSync(path.join(ROOT, 'src/lib/seo/markdownIngestion.mjs'), 'utf8');
  assert.doesNotMatch(
    ingestion,
    /function\s+renderHudStat(sIndex|Detail)Markdown/,
    'a second HUD renderer over another catalog must not come back'
  );
});

test('every published HUD stat page has a working Markdown twin', async () => {
  const { fn: renderDetail } = await routeRenderer('renderHudStatDetailMarkdown');
  assert.equal(HUD_STATS.length, 15);
  for (const stat of HUD_STATS) {
    const md = renderDetail(stat.slug);
    assert.ok(md.length > 200, `${stat.slug}.md must render`);
    assert.ok(md.startsWith(`# ${stat.h1}`), `${stat.slug}.md must describe ${stat.slug}`);
    assert.ok(md.includes(`${HUD_STATS_URL}/${stat.slug}`), `${stat.slug}.md must cite its own page`);
    assert.doesNotMatch(md, /\bundefined\b|\bnull\b/, `${stat.slug}.md must not print a missing field`);
    // The route lower-cases nothing itself; the HUD code works as an alias too.
    assert.equal(renderDetail(stat.code), md);
  }
});

test('an unknown HUD stat is not served as another stat', async () => {
  const { fn: renderDetail } = await routeRenderer('renderHudStatDetailMarkdown');
  // An empty body makes the route answer 404, matching the HTML page's notFound.
  for (const slug of ['', 'not-a-stat', 'flop-cbet', 'x-vpip-y']) {
    assert.equal(renderDetail(slug), '', `${JSON.stringify(slug)} must not render a stat`);
  }
  assert.match(routeSource, /if \(!md\) \{[\s\S]{0,200}status\(404\)/);
});

test('the HUD Markdown index lists every stat page and no missing field', async () => {
  const { fn: renderIndex } = await routeRenderer('renderHudStatsIndexMarkdown');
  const md = renderIndex();
  for (const stat of HUD_STATS) assert.ok(md.includes(`${HUD_STATS_URL}/${stat.slug})`), stat.slug);
  assert.doesNotMatch(md, /\bundefined\b/);
});

test('every catalog entry carries each field the renderer reads', () => {
  const fields = [
    'slug', 'code', 'name', 'h1', 'formula', 'gto6MaxTarget', 'gtoFullRingTarget',
    'lowStakesPopulationAvg', 'highStakesPopulationAvg', 'sampleSizeRequired',
    'calculatorHref', 'exploitLow', 'exploitHigh', 'ifThenBecause',
  ];
  const slugs = new Set();
  for (const stat of HUD_STATS) {
    for (const f of fields) {
      assert.equal(typeof stat[f], 'string', `${stat.slug || '?'}.${f}`);
      assert.ok(stat[f].trim(), `${stat.slug}.${f} must not be blank`);
    }
    assert.ok(Array.isArray(stat.faqs) && stat.faqs.every((f) => f.q && f.a), `${stat.slug}.faqs`);
    assert.ok(!slugs.has(stat.slug), `duplicate slug ${stat.slug}`);
    slugs.add(stat.slug);
  }
});
