#!/usr/bin/env node
/**
 * AN INTERNAL LINK REACHES A PAGE, CHECKED BEFORE MERGE (2026-11-28).
 *
 * The Live SEO Contract (scripts/ci/check-live-seo-contract.mjs) finds broken
 * internal links only after a deploy, and only on the ~40 pages it samples.
 * On 2026-11-28 it found three by luck: a footer link to a redirect shim,
 * rules chips linking glossary terms that do not exist, and a series page
 * linking an empty state directory. This check reads the links the site
 * builds from its own source and fails before merge when one points nowhere.
 *
 * Link sources read:
 *   - src/config/** and src/content/** : every quoted string or markdown
 *     target that starts with "/<known top-level route>"
 *   - pages/** and src/components/** : literal href="..", href={'..'},
 *     href: '..', and redirect destination: '..' values
 * A link resolves when it is a file in public/, a physical Pages Router
 * route, a content-backed dynamic route whose slug exists in its content
 * module (glossary, compare, learn, learn category, rules, odds matchups,
 * Smarter Rewards), another dynamic route, or a next.config.js redirect or
 * rewrite source.
 *
 * ALLOW lists only links that resolve somewhere this static reader cannot
 * see, each with its reason. A broken link is fixed at its source, not
 * allowed here.
 *
 * Usage: node scripts/ci/check-internal-links.mjs [--json]
 * Exit 1 and a list of "file:line link (reason)" when any link is broken.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const read = (p) => fs.readFileSync(p, 'utf8');

// Links that resolve where a static reader cannot see. Reason required.
export const ALLOW = new Map([
  // Served by middleware.ts or an external origin, not by pages/.
]);

// Strings in content modules that look like links but are only ever joined
// with a slug, never rendered bare. Reason required.
export const NOT_LINKS = new Map([
  ['/tools/odds', 'TOOL_MATCHUPS_BASE_PATH in src/content/tools/handMatchups.js; toolMatchupPath() appends the matchup slug'],
]);

const PAGE_EXT = /\.(?:js|jsx|ts|tsx)$/;
const SOURCE_EXT = /\.(?:js|jsx|mjs|cjs|ts|tsx|json)$/;

function walk(dir, filter, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, filter, out);
    else if (filter.test(entry.name)) out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------- routes
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function loadRoutes(root = ROOT) {
  const pagesDir = path.join(root, 'pages');
  const routes = [];
  for (const file of walk(pagesDir, PAGE_EXT)) {
    const r = rel(file).replace(/^pages\//, '');
    if (/^_(?:app|document|error)\./.test(r) || /\.test\./.test(r)) continue;
    let route = '/' + r.replace(PAGE_EXT, '');
    route = route.replace(/\/index$/, '') || '/';
    const segments = route.split('/').filter(Boolean);
    let pattern = '';
    let dynamic = false;
    for (const seg of segments) {
      let m;
      if ((m = seg.match(/^\[\[\.\.\.(.+)\]\]$/))) { pattern += '(?:/.*)?'; dynamic = true; }
      else if ((m = seg.match(/^\[\.\.\.(.+)\]$/))) { pattern += '/.+'; dynamic = true; }
      else if ((m = seg.match(/^\[(.+)\]$/))) { pattern += '/[^/]+'; dynamic = true; }
      else pattern += '/' + escapeRe(seg);
    }
    routes.push({ route, file: rel(file), dynamic, re: new RegExp(`^${pattern || '/'}$`) });
  }
  // Static routes win over dynamic ones, as Next resolves them.
  routes.sort((a, b) => Number(a.dynamic) - Number(b.dynamic));
  return routes;
}

// next.config.js redirect and rewrite sources, read as text: loading the
// config pulls in the PWA plugin and its build-only dependencies. Only the
// redirects() and rewrites() bodies count (headers() also has `source:`
// entries, and they serve no page), and an entry with `has` or `missing`
// applies only to some requests (another host, an Accept header), so it
// cannot vouch for a link every reader follows.
function blockBody(src, signature) {
  const start = src.indexOf(signature);
  if (start < 0) return '';
  const open = src.indexOf('{', start + signature.length);
  return src.slice(open, matchClose(src, open) + 1);
}

function skipString(src, i) {
  const q = src[i];
  let j = i + 1;
  while (j < src.length && src[j] !== q) j += src[j] === '\\' ? 2 : 1;
  return j;
}

function matchClose(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === '`') { i = skipString(src, i); continue; }
    if (ch === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (ch === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 1; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') { depth -= 1; if (depth === 0) return i; }
  }
  return src.length - 1;
}

function enclosingObject(body, index) {
  // Walk back to the "{" that opens the object holding this property.
  let depth = 0;
  for (let i = index; i >= 0; i -= 1) {
    const ch = body[i];
    if (ch === '}') depth += 1;
    else if (ch === '{') { if (depth === 0) return body.slice(i, matchClose(body, i) + 1); depth -= 1; }
  }
  return '';
}

export function loadConfigSources(root = ROOT) {
  const src = read(path.join(root, 'next.config.js'));
  const out = [];
  for (const signature of ['async redirects()', 'async rewrites()']) {
    const body = blockBody(src, signature);
    for (const m of body.matchAll(/source:\s*(['"`])(\/[^'"`]*)\1/g)) {
      if (m[2].includes('${')) continue;
      const entry = enclosingObject(body, m.index);
      if (/\b(?:has|missing)\s*:/.test(entry)) continue;
      out.push({ source: m[2], re: pathToRegexp(m[2]) });
    }
  }
  return out;
}

function pathToRegexp(source) {
  let re = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === ':') {
      const nm = source.slice(i + 1).match(/^[A-Za-z0-9_]+/);
      i += 1 + (nm ? nm[0].length : 0);
      let custom = null;
      if (source[i] === '(') {
        let depth = 0;
        let j = i;
        for (; j < source.length; j += 1) {
          if (source[j] === '(') depth += 1;
          else if (source[j] === ')') { depth -= 1; if (depth === 0) break; }
        }
        custom = source.slice(i + 1, j);
        i = j + 1;
      }
      const mod = source[i];
      if (mod === '*' || mod === '+' || mod === '?') i += 1;
      const one = custom ? `(?:${custom})` : '[^/]+';
      if (mod === '*') {
        // "/:path*" covers the bare prefix too.
        if (re.endsWith('/')) re = `${re.slice(0, -1)}(?:/${one}(?:/${one})*)?`;
        else re += `(?:${one}(?:/${one})*)?`;
      } else if (mod === '+') re += `${one}(?:/${one})*`;
      else if (mod === '?') re += `(?:${one})?`;
      else re += one;
    } else if (ch === '(') {
      let depth = 0;
      let j = i;
      for (; j < source.length; j += 1) {
        if (source[j] === '(') depth += 1;
        else if (source[j] === ')') { depth -= 1; if (depth === 0) break; }
      }
      re += source.slice(i, j + 1);
      i = j + 1;
    } else {
      re += escapeRe(ch);
      i += 1;
    }
  }
  try { return new RegExp(`^${re}$`, 'i'); } catch { return /^\0$/; }
}

// Content-backed dynamic routes: the slug must exist in its module.
export async function loadContentSlugs(root = ROOT) {
  const imp = (p) => import(pathToFileURL(path.join(root, p)).href);
  const [glossary, compare, matchups, learn, learnSite, rules] = await Promise.all([
    imp('src/content/glossary/terms.js'),
    imp('src/content/compare/pages.js'),
    imp('src/content/tools/handMatchups.js'),
    imp('src/content/learn/lessons.js'),
    imp('src/lib/learn/learnSite.js'),
    imp('src/content/rules/rules.js'),
  ]);
  const rewardsSrc = read(path.join(root, 'pages/hub/smarter-rewards/[rewardId].js'));
  const rewardsBlock = rewardsSrc.slice(rewardsSrc.indexOf('const ALL_REWARDS'), rewardsSrc.indexOf('];', rewardsSrc.indexOf('const ALL_REWARDS')));
  // /hub/[orbId] serves ORB_METADATA keys, registry orbs and three aliases,
  // and 404s everything else (its getServerSideProps).
  const orbSrc = read(path.join(root, 'pages/hub/[orbId].js'));
  const orbBlock = orbSrc.slice(orbSrc.indexOf('const ORB_METADATA'), orbSrc.indexOf('\n};', orbSrc.indexOf('const ORB_METADATA')));
  const orbKeys = new Set([...orbBlock.matchAll(/^  '?([a-z0-9-]+)'?:\s*\{/gm)].map((m) => m[1]));
  for (const alias of (orbSrc.match(/const aliases = \[([^\]]*)\]/)?.[1] || '').matchAll(/'([^']+)'/g)) orbKeys.add(alias[1]);
  let getOrbById = () => null;
  try { ({ getOrbById } = await imp('src/orbs/manifest/registry.js')); } catch { /* keys only */ }
  const orbTest = (key) => orbKeys.has(key.toLowerCase()) || Boolean(getOrbById(key.toLowerCase()));
  const rewardIds = new Set([...rewardsBlock.matchAll(/\bid:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]));
  return [
    { route: '/glossary/[term]', has: new Set(glossary.GLOSSARY_TERMS.map((t) => t.slug)) },
    { route: '/compare/[slug]', has: new Set(compare.COMPARE_PAGES.map((p) => p.slug)) },
    { route: '/tools/odds/[matchup]', has: new Set(matchups.TOOL_HAND_MATCHUPS.map((m) => m.slug)) },
    { route: '/learn/[topic]', has: new Set(learn.LESSONS.map((l) => l.slug)) },
    { route: '/learn/category/[category]', has: new Set(learn.LEARN_CATEGORIES.map((c) => learnSite.categoryAnchor(c))) },
    { route: '/rules/[slug]', test: (slug) => Boolean(rules.getRuleBySlug(slug)) },
    { route: '/hub/smarter-rewards/[rewardId]', has: rewardIds },
    { route: '/hub/[orbId]', test: orbTest },
  ];
}

// ---------------------------------------------------------------- links
const QUOTED = /(['"`])(\/[A-Za-z0-9][^'"`\s<>]*)\1/g;
const MD_TARGET = /\]\((\/[A-Za-z0-9][^)\s]*)\)/g;
const HREF_ATTR = /(?:\bhref|\bdestination)\s*(?:=\s*\{?\s*|:\s*)(['"`])(\/[^'"`\s]*)\1/g;

function lineOf(src, index) {
  let n = 1;
  for (let i = 0; i < index; i += 1) if (src.charCodeAt(i) === 10) n += 1;
  return n;
}

export function extractLinks(root, topLevel) {
  const links = [];
  const add = (file, src, index, raw) => {
    if (raw.includes('${') || raw.startsWith('//')) return;
    // A trailing slash marks a prefix joined with an id in code
    // ("/hub/series/" + id), and brackets mark a route pattern, not a URL.
    if ((raw.length > 1 && /\/$/.test(raw.split(/[?#]/)[0])) || raw.includes('[')) return;
    if (NOT_LINKS.has(raw)) return;
    links.push({ file: rel(file), line: lineOf(src, index), link: raw });
  };
  const contentFiles = [
    ...walk(path.join(root, 'src/config'), SOURCE_EXT),
    ...walk(path.join(root, 'src/content'), SOURCE_EXT),
  ];
  for (const file of contentFiles) {
    const src = read(file);
    if (file.endsWith('.json')) {
      // Config JSON carries route prefixes and patterns beside its links;
      // only "href" values are links.
      for (const m of src.matchAll(/"href"\s*:\s*"(\/[^"]*)"/g)) add(file, src, m.index, m[1]);
      continue;
    }
    for (const re of [QUOTED, MD_TARGET]) {
      for (const m of src.matchAll(re)) {
        const raw = m[2] ?? m[1];
        const first = raw.split(/[/?#]/)[1];
        if (!topLevel.has(first)) continue;
        add(file, src, m.index, raw);
      }
    }
  }
  const codeFiles = [
    ...walk(path.join(root, 'pages'), PAGE_EXT).filter((f) => !rel(f).startsWith('pages/api/')),
    ...walk(path.join(root, 'src/components'), /\.(?:js|jsx|ts|tsx)$/),
  ];
  for (const file of codeFiles) {
    const src = read(file);
    for (const m of src.matchAll(HREF_ATTR)) add(file, src, m.index, m[2]);
  }
  return links;
}

export function normalize(link) {
  let p = link.split('#')[0].split('?')[0];
  if (p.length > 1) p = p.replace(/\/+$/, '');
  try { p = decodeURI(p); } catch { /* keep raw */ }
  return p || '/';
}

export function makeResolver({ root = ROOT, routes, configSources, contentSlugs }) {
  const publicDir = path.join(root, 'public');
  const contentByRoute = new Map(contentSlugs.map((c) => [c.route, c]));
  return function resolve(link) {
    const p = normalize(link);
    if (ALLOW.has(p)) return { ok: true, via: 'allow' };
    if (/\.[a-z0-9]{2,5}$/i.test(p) && fs.existsSync(path.join(publicDir, p))) return { ok: true, via: 'public' };
    for (const r of routes) {
      if (!r.re.test(p)) continue;
      const content = contentByRoute.get(r.route);
      if (content) {
        const slug = p.split('/').pop();
        const exists = content.test ? content.test(slug) : content.has.has(slug);
        if (!exists) {
          // A redirect may still rescue a retired slug.
          if (configSources.some((s) => s.re.test(p))) return { ok: true, via: 'config' };
          return { ok: false, reason: `${r.route} has no "${slug}" in its content` };
        }
      }
      return { ok: true, via: r.route };
    }
    if (configSources.some((s) => s.re.test(p))) return { ok: true, via: 'config' };
    // "/x.md" markdown twins are served by the page for "/x".
    if (p.endsWith('.md')) return resolve(p.slice(0, -3));
    return { ok: false, reason: 'no page, redirect or rewrite' };
  };
}

export async function checkInternalLinks(root = ROOT) {
  const routes = loadRoutes(root);
  const configSources = loadConfigSources(root);
  const contentSlugs = await loadContentSlugs(root);
  const topLevel = new Set(routes.map((r) => r.route.split('/')[1]).filter((s) => s && !s.startsWith('[')));
  const resolve = makeResolver({ root, routes, configSources, contentSlugs });
  const broken = [];
  const links = extractLinks(root, topLevel);
  for (const l of links) {
    const result = resolve(l.link);
    if (!result.ok) broken.push({ ...l, reason: result.reason });
  }
  return { checked: links.length, broken };
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const started = Date.now();
  const { checked, broken } = await checkInternalLinks(ROOT);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ checked, broken }, null, 2));
  } else if (broken.length) {
    console.error(`check-internal-links: ${broken.length} of ${checked} internal link(s) reach no page:`);
    for (const b of broken) console.error(`  ${b.file}:${b.line}  ${b.link}  (${b.reason})`);
    console.error('Fix the link at its source. ALLOW in this script is only for links served outside pages/ and next.config.js, with a reason.');
  } else {
    console.log(`check-internal-links: OK - ${checked} internal links reach a page (${Date.now() - started}ms).`);
  }
  process.exit(broken.length ? 1 : 0);
}
