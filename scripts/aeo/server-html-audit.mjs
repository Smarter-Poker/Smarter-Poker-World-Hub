#!/usr/bin/env node
/**
 * WHAT THE SERVER ACTUALLY SAYS (AEO phase 3, 2026-09-19).
 *
 * Fetches every URL in the sitemap with a non-JavaScript crawler's user
 * agent and reports two things about the HTML that comes back: how many
 * words of readable text it carries, and whether it still says it is
 * loading.
 *
 * WHY THIS IS A SCRIPT AND NOT A LAW. Whether a loading branch reaches a
 * crawler depends on the state the component holds at render time, which
 * source cannot decide. A law written over the source flagged 30 loading
 * branches across 37 files, of which the live measurement showed 6 that a
 * crawler could ever see: the rest sit behind an auth check or a state that
 * starts false. A law that accuses thirty things to catch six is a law
 * people learn to ignore.
 *
 * The narrow, decidable part is in
 * __tests__/a-page-with-its-content-is-not-loading.law.test.mjs, which
 * covers the two detail families, 253 of the 1,191 routes. This measures
 * the rest.
 *
 * Usage:
 *   node scripts/aeo/server-html-audit.mjs [--origin https://smarter.poker]
 *                                          [--thin 140] [--json out.jsonl]
 *
 * Reads only.
 */

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const ORIGIN = flag('origin', 'https://smarter.poker').replace(/\/+$/, '');
const THIN = Number(flag('thin', '140'));
const JSON_OUT = flag('json', '');

const UA = 'Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)';
const LOADING = /\b(loading[^.<]{0,40}\.\.\.|please wait|fetching )/i;

async function get(url) {
  const response = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!response.ok && response.status !== 404) return { status: response.status, html: null };
  return { status: response.status, html: await response.text() };
}

function readableText(html) {
  const withoutCode = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  return withoutCode.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function main() {
  const xml = await get(`${ORIGIN}/sitemap.xml`);
  if (!xml.html) throw new Error('could not read the sitemap');
  const routes = [...xml.html.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].replace(ORIGIN, '').trim() || '/');

  const rows = [];
  const failures = [];
  for (const route of routes) {
    let result;
    try {
      result = await get(ORIGIN + route);
    } catch (err) {
      failures.push([route, err.message]);
      continue;
    }
    if (!result.html) {
      failures.push([route, `status ${result.status}`]);
      continue;
    }
    const text = readableText(result.html);
    const loading = text.match(LOADING);
    rows.push({
      route,
      status: result.status,
      words: text.split(' ').filter(Boolean).length,
      loading: loading ? loading[0].trim() : null,
    });
  }

  if (JSON_OUT) {
    const fs = await import('node:fs');
    fs.writeFileSync(JSON_OUT, rows.map((r) => JSON.stringify(r)).join('\n'));
  }

  const words = rows.map((r) => r.words).sort((a, b) => a - b);
  const loadingRows = rows.filter((r) => r.loading);
  const thin = rows.filter((r) => r.words < THIN).sort((a, b) => a.words - b.words);
  const notOk = rows.filter((r) => r.status !== 200);

  console.log(`\n${rows.length} routes measured as a non-JavaScript crawler\n`);
  console.log(`words   min ${words[0]}   median ${words[Math.floor(words.length / 2)]}   max ${words[words.length - 1]}`);
  console.log(`routes under ${THIN} words: ${thin.length}`);
  console.log(`routes still saying they are loading: ${loadingRows.length}`);
  console.log(`routes not answering 200: ${notOk.length}`);
  if (failures.length) console.log(`routes that could not be read: ${failures.length}`);

  if (notOk.length) {
    console.log('\nnot 200:');
    for (const row of notOk.slice(0, 20)) console.log(`   ${row.status}  ${row.route}`);
  }
  if (loadingRows.length) {
    const byText = new Map();
    for (const row of loadingRows) {
      byText.set(row.loading.toLowerCase(), (byText.get(row.loading.toLowerCase()) || 0) + 1);
    }
    console.log('\nstill loading:');
    for (const [text, count] of [...byText].sort((a, b) => b[1] - a[1])) {
      console.log(`   ${String(count).padStart(5)}  ${text}`);
    }
  }
  if (thin.length) {
    console.log('\nthinnest:');
    for (const row of thin.slice(0, 20)) console.log(`   ${String(row.words).padStart(5)}  ${row.route}`);
  }

  // A route that does not answer 200 is a failure of the sitemap's promise.
  process.exitCode = notOk.length || failures.length ? 1 : 0;
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 2;
});
