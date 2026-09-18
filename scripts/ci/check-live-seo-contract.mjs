/**
 * check-live-seo-contract - what a crawler gets from PRODUCTION, checked.
 *
 * DISCOVERABILITY PHASE 3 (2026-09-17). The SEO guarantees in this repo are
 * pinned by tests that read source files. This one reads the deployed site,
 * after every production deployment (deployment_status), the way Googlebot
 * does, and refuses if the contract is broken:
 *
 *   1. /api/health must report the deployed commit (retried while the alias
 *      moves), so the checks below are against THIS deployment;
 *   2. /robots.txt must name both sitemaps and disallow the account-only
 *      paths; every named sitemap must answer 200 and be a urlset;
 *   3. the home page and every /hub/commander URL in the sitemap must serve
 *      200 with a title, an indexable robots meta, its exact canonical, a
 *      description and a parseable JSON-LD document; the home page's
 *      JSON-LD must be a @graph (the numeric-keys bug of #1822);
 *   4. the default share image must answer 200 as an image;
 *   5. a sample of the remaining sitemap URLs must answer 200, be
 *      indexable, and carry a real description and a heading (the full list
 *      is hundreds of pages; a sample catches a broken section without
 *      turning a deploy check into a crawl).
 *
 * WHY THE SAMPLE CHECKS INDEXABILITY (2026-09-18). Until now the sample
 * only asserted HTTP 200, so a sitemap entry that loaded fine and then told
 * crawlers not to index it passed this gate: exactly the defect #1885 had
 * to fix in production, found by a source test rather than here. A sitemap
 * is a list of pages worth indexing; offering a crawler a page that refuses
 * indexing spends crawl budget to say nothing, and only the live response
 * can prove which it is. The rule is the one already applied to the home
 * page and every /hub/commander URL, applied to the sample too.
 *
 * Plain Node 20+, no dependencies, no hand-typed route list beyond '/'.
 *
 * USAGE  node scripts/ci/check-live-seo-contract.mjs [--sha <40 hex>] [--base https://smarter.poker] [--sample 40]
 */
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = opt('--base', 'https://smarter.poker').replace(/\/$/, '');
const EXPECTED_SHA = opt('--sha', '');
const SAMPLE = Number(opt('--sample', '40'));
const UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html) smarter-poker-seo-contract';

const problems = [];
const notes = [];
const fail = (msg) => problems.push(msg);

async function get(url) {
  const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}seo-contract=${Date.now()}`, {
    headers: { 'user-agent': UA, 'cache-control': 'no-cache' },
    redirect: 'manual',
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, text };
}

const attr = (html, re) => {
  const m = html.match(re);
  return m ? m[1] : null;
};

/**
 * The document with scripts, styles and comments removed. A heading inside
 * a script string is not a heading: this file's own last-resort boot error
 * UI is assigned as `root.innerHTML = '<h1>Loading Failed</h1>...'`, so a
 * raw regex over the response counts three <h1> on every arena page when
 * there is one. Same defect the arena prerender verifier fixed in #4790.
 */
export function markupOnly(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

/** Real <h1> elements, not headings quoted inside scripts. */
export function headingCount(html) {
  return (markupOnly(html).match(/<h1[\s>]/gi) || []).length;
}

export function inspectHead(html) {
  const title = attr(html, /<title[^>]*>([^<]*)<\/title>/i);
  const robots = attr(html, /<meta\s+name="robots"\s+content="([^"]*)"/i);
  const canonical = attr(html, /<link\s+rel="canonical"\s+href="([^"]*)"/i);
  const description = attr(html, /<meta\s+name="description"\s+content="([^"]*)"/i);
  const ogImage = attr(html, /<meta\s+property="og:image"\s+content="([^"]*)"/i);
  const ldRaw = attr(html, /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  let ld = null;
  let ldError = null;
  if (ldRaw) {
    try {
      ld = JSON.parse(ldRaw);
    } catch (e) {
      ldError = e.message;
    }
  }
  return { title, robots, canonical, description, ogImage, ld, ldError };
}

export function ldTypes(ld) {
  if (!ld) return [];
  const nodes = Array.isArray(ld['@graph']) ? ld['@graph'] : [ld];
  return nodes.map((n) => n && n['@type']).filter(Boolean);
}

export function hasNumericKeys(ld) {
  return !!ld && Object.keys(ld).some((k) => /^\d+$/.test(k));
}

export function parseSitemapLocs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

/**
 * What every indexable page owes a crawler beyond loading: a description
 * long enough to be a snippet, and a heading. Checked on the sampled URLs
 * as well as the fully checked ones, because that is where the defects
 * hide: /hub/home-games/saturday-night-poker-club shipped a sixteen
 * character description ("Weekly home game") and nothing caught it live.
 * Returns the reasons, so a failure says which part is missing.
 */
export const SAMPLE_DESCRIPTION_MIN = 60;

export function pageEssentials(html) {
  const head = inspectHead(html || '');
  const reasons = [];
  const description = head.description || '';
  if (!description) reasons.push('no meta description');
  else if (description.length < SAMPLE_DESCRIPTION_MIN)
    reasons.push(`description is ${description.length} characters, under ${SAMPLE_DESCRIPTION_MIN}`);
  if (headingCount(html) === 0) reasons.push('no <h1>');
  return { ok: reasons.length === 0, reasons };
}

/**
 * Is this live response one a crawler may index? Reads the response the way
 * Googlebot resolves it: the X-Robots-Tag header first (it applies even when
 * the body never parses), then the robots meta in the document.
 * Returns { indexable, reason } so a failure names what said no.
 */
export function indexability({ status, headerRobots, html }) {
  if (status !== 200) return { indexable: false, reason: `HTTP ${status}` };
  if (/noindex/i.test(headerRobots || ''))
    return { indexable: false, reason: `X-Robots-Tag: ${String(headerRobots).trim()}` };
  const meta = inspectHead(html || '').robots;
  if (meta && /noindex/i.test(meta)) return { indexable: false, reason: `robots meta: ${meta}` };
  return { indexable: true, reason: null };
}

export function parseRobots(text) {
  const sitemaps = [];
  const disallow = new Set();
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    const i = line.indexOf(':');
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    if (key === 'sitemap') sitemaps.push(value);
    if (key === 'disallow') disallow.add(value);
  }
  return { sitemaps, disallow };
}

async function waitForDeploy(sha) {
  for (let i = 1; i <= 18; i += 1) {
    try {
      const { status, text } = await get(`${BASE}/api/health`);
      if (status === 200) {
        const info = JSON.parse(text);
        if (!sha || info.commitSha === sha) {
          notes.push(`/api/health reports ${info.commitSha} (${info.deploymentId})`);
          return info.commitSha;
        }
        notes.push(`attempt ${i}: production serves ${info.commitSha}, waiting for ${sha}`);
      } else notes.push(`attempt ${i}: /api/health ${status}`);
    } catch (e) {
      notes.push(`attempt ${i}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 10000));
  }
  fail(`/api/health never reported ${sha || 'a deployment'} within three minutes`);
  return null;
}

async function checkPage(url, { expectGraph = false } = {}) {
  const { status, headers, text } = await get(url);
  if (status !== 200) return fail(`${url}: HTTP ${status}, expected 200`);
  const xr = headers.get('x-robots-tag') || '';
  if (/noindex/i.test(xr)) fail(`${url}: X-Robots-Tag says noindex (${xr})`);
  const head = inspectHead(text);
  if (!head.title) fail(`${url}: no <title>`);
  if (!head.robots || !/^index,\s*follow/i.test(head.robots)) fail(`${url}: robots meta is ${JSON.stringify(head.robots)}, expected index, follow`);
  if (head.canonical !== url) fail(`${url}: canonical is ${JSON.stringify(head.canonical)}, expected ${url}`);
  if (!head.description || head.description.length < 40) fail(`${url}: description missing or under 40 characters`);
  if (head.ldError) fail(`${url}: JSON-LD does not parse: ${head.ldError}`);
  else if (!head.ld) fail(`${url}: no JSON-LD block`);
  else {
    if (hasNumericKeys(head.ld)) fail(`${url}: JSON-LD is an object with numeric keys (an array was spread into an object)`);
    if (expectGraph && !Array.isArray(head.ld['@graph'])) fail(`${url}: JSON-LD is not a @graph`);
    if (ldTypes(head.ld).length === 0) fail(`${url}: JSON-LD carries no @type`);
  }
  notes.push(`${url.replace(BASE, '') || '/'}: ok (${head.title}; ${ldTypes(head.ld).join(', ') || 'no schema'})`);
  return head;
}

async function main() {
  const sha = await waitForDeploy(EXPECTED_SHA);
  if (!sha) return;

  const robotsRes = await get(`${BASE}/robots.txt`);
  if (robotsRes.status !== 200) fail(`/robots.txt: HTTP ${robotsRes.status}`);
  const robots = parseRobots(robotsRes.text || '');
  for (const want of [`${BASE}/sitemap.xml`, `${BASE}/hub/club-arena/sitemap.xml`]) {
    if (!robots.sitemaps.includes(want)) fail(`/robots.txt does not name ${want}`);
  }
  for (const p of ['/hub/messenger', '/hub/settings', '/hub/notifications', '/api/']) {
    if (!robots.disallow.has(p)) fail(`/robots.txt does not disallow ${p}`);
  }

  const allLocs = [];
  for (const sm of robots.sitemaps) {
    const r = await get(sm);
    if (r.status !== 200) {
      fail(`${sm}: HTTP ${r.status}`);
      continue;
    }
    if (!/<urlset/.test(r.text)) fail(`${sm}: not a urlset`);
    const locs = parseSitemapLocs(r.text);
    if (locs.length === 0) fail(`${sm}: names no URLs`);
    notes.push(`${sm}: ${locs.length} URLs`);
    allLocs.push(...locs);
  }

  const home = await checkPage(`${BASE}/`, { expectGraph: true });
  if (home?.ogImage) {
    const img = await get(home.ogImage);
    const type = img.headers.get('content-type') || '';
    if (img.status !== 200 || !type.startsWith('image/')) fail(`share image ${home.ogImage}: HTTP ${img.status} ${type}`);
    else notes.push(`share image ${home.ogImage}: ok (${type})`);
  } else fail('/: no og:image');

  const commander = allLocs.filter((u) => u.startsWith(`${BASE}/hub/commander`));
  if (commander.length < 5) fail(`sitemap lists only ${commander.length} /hub/commander URLs; expected at least 5`);
  for (const url of commander) await checkPage(url);

  const rest = allLocs.filter((u) => !commander.includes(u) && u !== `${BASE}/` && !u.startsWith(`${BASE}/hub/club-arena`));
  const step = Math.max(1, Math.floor(rest.length / SAMPLE));
  const sample = rest.filter((_, i) => i % step === 0).slice(0, SAMPLE);
  let bad = 0;
  let unindexable = 0;
  let incomplete = 0;
  for (const url of sample) {
    const r = await get(url);
    const verdict = indexability({
      status: r.status,
      headerRobots: r.headers.get('x-robots-tag'),
      html: r.text,
    });
    if (!verdict.indexable) {
      if (r.status !== 200) {
        bad += 1;
        fail(`sitemap sample ${url}: HTTP ${r.status}`);
      } else {
        unindexable += 1;
        // A sitemap is a list of pages worth indexing. A page that loads and
        // then refuses indexing must leave the sitemap, not sit in it.
        fail(`sitemap sample ${url}: listed in the sitemap but not indexable (${verdict.reason})`);
      }
      continue;
    }
    const essentials = pageEssentials(r.text);
    if (!essentials.ok) {
      incomplete += 1;
      fail(`sitemap sample ${url}: ${essentials.reasons.join('; ')}`);
    }
  }
  notes.push(
    `sitemap sample: ${sample.length} of ${rest.length} other URLs fetched, ${bad} not 200, ` +
      `${unindexable} not indexable, ${incomplete} missing a description or heading`
  );
}

const invokedDirectly = process.argv[1] && new URL(`file://${process.argv[1]}`).pathname === new URL(import.meta.url).pathname;
if (invokedDirectly) {
  main()
    .catch((e) => fail(`checker crashed: ${e.stack || e.message}`))
    .finally(() => {
      for (const n of notes) console.log(`  ${n}`);
      if (problems.length) {
        console.error('\nLIVE SEO CONTRACT BROKEN');
        for (const p of problems) console.error(`  - ${p}`);
        process.exit(1);
      }
      console.log('\nlive SEO contract: OK');
    });
}
