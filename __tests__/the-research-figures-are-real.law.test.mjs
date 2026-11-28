// LAW (2026-11-28): every figure on the research pages, in the whitepaper and
// in the market and state guides has a basis, and the basis is shown.
//
// Sibling of the-venue-claims-are-real.law.test.mjs. The research pages read
// like studies ("84% Of Surveyed US Rooms", "185,000+ Logged Hands", "50,000+
// Simulated Bounty Paths", "Audit Of 4,500+ Weekly Tournaments"), but no
// survey, hand sample, waitlist log or simulation exists in the repo, the
// database or the Zenodo deposit, which is a self-archived copy of the page
// text. The guides typed table and room counts by hand. On 2026-11-28:
//
//   1. Each research page declares a basis (computed, statute, directory or
//      editorial) and renders it with its sources. Editorial pages state no
//      measured figure.
//   2. Computed figures are recomputed here: bet-size frequencies, bubble
//      factor equities, Omaha combinations, and the short deck enumeration
//      (whose old "1.96% Flush Vs 3.26% Full House" and "AA 54.4% Vs JTs"
//      the enumeration refutes).
//   3. Directory figures come from src/lib/research/tournamentDirectoryFacts.mjs
//      (a dated read: 824 events in the week, not 4,500+) and every
//      "N+ Weekly Tournaments" claim uses WEEKLY_TOURNAMENT_LABEL.
//   4. Table counts in the guides come only from VENUE_TABLES_ON_FILE through
//      tablesLabel(); market totals are not stated; state room counts come
//      from listedVenueLabel().
//   5. The retired figures, and the DOI 10.5281/zenodo.15129481 that never
//      resolved, never come back.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RESEARCH_REPORTS, RESEARCH_BASIS, renderResearchReportMarkdown } from '../src/content/research/reports.js';
import * as TF from '../src/lib/research/tournamentDirectoryFacts.mjs';
import * as SD from '../src/lib/research/shortDeckFacts.mjs';
import { AA_VS_KK, JJ_VS_AKS } from '../src/lib/research/holdemFacts.mjs';
import { VENUE_TABLES_ON_FILE, tablesLabel } from '../src/lib/research/venueTablesOnFile.mjs';
import {
  choose,
  card,
  SHORT_RANKS,
  exactEquity,
  shortDeckSevenCardCounts,
  hitProbability,
} from '../scripts/research/short-deck-math.mjs';
import { POKER_MARKET_GUIDES } from '../src/content/guides/markets.js';
import { listedVenueLabel } from '../src/lib/venueCount.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SOURCE_EXT = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.md', '.txt']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (SOURCE_EXT.has(path.extname(entry.name))) out.push(rel);
  }
  return out;
}

const STATIC_FILES = [
  'public/llms.txt',
  'public/llms-full.txt',
  'public/.well-known/ai-facts.json',
  'public/.well-known/agent.json',
  'public/.well-known/ai-plugin.json',
  'public/.well-known/mcp.json',
  'public/.well-known/mcp-registry.json',
  'public/api/openapi.json',
];
// The fact modules quote the retired figures in their own history notes.
const FACT_MODULES = new Set([
  path.join('src', 'lib', 'research', 'tournamentDirectoryFacts.mjs'),
  path.join('src', 'lib', 'research', 'shortDeckFacts.mjs'),
  path.join('src', 'lib', 'research', 'holdemFacts.mjs'),
  path.join('src', 'lib', 'research', 'venueTablesOnFile.mjs'),
]);
const SCANNED = [...walk('src'), ...walk('pages'), ...STATIC_FILES.filter((f) => fs.existsSync(path.join(ROOT, f)))].filter(
  (f) => !FACT_MODULES.has(f),
);

const reportText = (r) =>
  [
    r.title,
    r.shortTitle,
    r.summary,
    r.methodology,
    r.sampleSize || '',
    ...r.keyFindings,
    r.table.caption,
    ...r.table.columns,
    ...r.table.rows.flat(),
    ...r.faq.flatMap((f) => [f.q, f.a]),
  ].join('\n');

test('every research page declares a basis, and the page and its Markdown show it with the sources', () => {
  assert.equal(RESEARCH_REPORTS.length, 15);
  for (const r of RESEARCH_REPORTS) {
    assert.ok(Object.hasOwn(RESEARCH_BASIS, r.basis), `${r.slug} has no known basis`);
    assert.ok(Array.isArray(r.sources), `${r.slug} must list its sources (an empty list is allowed)`);
    for (const s of r.sources) assert.match(s.url, /^https:\/\//, `${r.slug} source ${s.label} needs a URL`);
    const md = renderResearchReportMarkdown(r);
    assert.ok(md.includes(RESEARCH_BASIS[r.basis]), `${r.slug} Markdown must state its basis`);
    for (const s of r.sources) assert.ok(md.includes(s.url), `${r.slug} Markdown must cite ${s.url}`);
    assert.doesNotMatch(md, /Key Empirical Findings/);
  }
  const page = read('pages/research/[slug].js');
  assert.match(page, /RESEARCH_BASIS\[report\.basis\]/, 'the research page renders the basis');
  assert.match(page, /report\.sources\.map/, 'the research page renders the sources next to the figures');
  assert.doesNotMatch(page, /Key Empirical Findings/);
  for (const kind of ['statute', 'directory']) {
    for (const r of RESEARCH_REPORTS.filter((x) => x.basis === kind)) {
      assert.ok(r.sources.length > 0, `${r.slug} (${kind}) must cite at least one source`);
    }
  }
});

test('editorial pages state no measured figure and present nothing as a survey, audit or simulation', () => {
  const editorial = RESEARCH_REPORTS.filter((r) => r.basis === 'editorial');
  assert.ok(editorial.length >= 8);
  for (const r of editorial) {
    const text = reportText(r);
    assert.doesNotMatch(text, /\d+(?:\.\d+)?\s*%/, `${r.slug} is editorial and must not state a percentage`);
    assert.doesNotMatch(text, /\b\d[\d,]*\+\s/, `${r.slug} is editorial and must not state an "N+" figure`);
    assert.doesNotMatch(text, /BB\/100/, `${r.slug} is editorial and must not state a win rate`);
    assert.equal(r.sampleSize, undefined, `${r.slug} is editorial and has no sample`);
  }
  for (const r of RESEARCH_REPORTS) {
    const text = reportText(r);
    assert.doesNotMatch(text, /\bSurveyed\b|\bSurvey Of\b|\bOf Surveyed\b/i, `${r.slug} presents a survey that never ran`);
    assert.doesNotMatch(text, /\b(?:Audit|Analysis|Telemetry|Simulation|Evaluations?) (?:Of|Across) \d/i, `${r.slug} cites a study that never ran`);
    assert.doesNotMatch(text, /\b\d[\d,]*\+? (?:Logged|Simulated|Surveyed)\b/i, `${r.slug} cites a sample that does not exist`);
  }
});

test('computed pages: every figure is the arithmetic, recomputed here', () => {
  const gto = RESEARCH_REPORTS.find((r) => r.slug === 'gto-vs-population-preflop-and-postflop-leak-study');
  for (const [size, mdf, bluff, need] of gto.table.rows) {
    const b = Number(size.replace('% Pot', '')) / 100;
    assert.equal(mdf, `${(100 / (1 + b)).toFixed(1)}%`);
    assert.equal(bluff, `${((100 * b) / (1 + 2 * b)).toFixed(1)}%`);
    assert.equal(need, bluff);
  }
  const icm = RESEARCH_REPORTS.find((r) => r.slug === 'tournament-icm-bubble-factor-and-risk-premium-study');
  for (const [bf, chip, req, premium] of icm.table.rows) {
    const B = Number(bf);
    assert.equal(chip, '50.0%');
    assert.equal(req, `${((100 * B) / (B + 1)).toFixed(1)}%`);
    assert.equal(premium, `+${((100 * B) / (B + 1) - 50).toFixed(1)}%`);
  }
  const plo = RESEARCH_REPORTS.find((r) => r.slug === 'pot-limit-omaha-plo4-plo5-plo6-equity-and-variance-study');
  const fmt = (n) => n.toLocaleString('en-US');
  const expected = [
    [2, fmt(choose(52, 2)), '1'],
    [4, fmt(choose(52, 4)), String(choose(4, 2))],
    [5, fmt(choose(52, 5)), String(choose(5, 2))],
    [6, fmt(choose(52, 6)), String(choose(6, 2))],
  ];
  plo.table.rows.forEach((row, i) => {
    assert.equal(row[1], String(expected[i][0]));
    assert.equal(row[2], expected[i][1]);
    assert.equal(row[3], expected[i][2]);
  });
  assert.doesNotMatch(reportText(plo), /BB\/100|Buy-Ins\b.*\d|\d+(?:\.\d+)?%/, 'no simulated PLO equity or variance figure');
});

test('short deck figures equal a full enumeration, run here', () => {
  assert.equal(SD.SHORT_DECK_STARTING_COMBOS, choose(36, 2));
  assert.equal(SD.FULL_DECK_STARTING_COMBOS, choose(52, 2));
  assert.equal(SD.SHORT_DECK_DISTINCT_HANDS, 9 + 2 * choose(9, 2));
  assert.equal(SD.FULL_DECK_DISTINCT_HANDS, 13 + 2 * choose(13, 2));
  assert.equal(SD.SHORT_DECK_BOARDS, choose(36, 5));
  assert.equal(SD.SHORT_DECK_SEVEN_CARD_SETS, choose(36, 7));
  assert.equal(SD.SHORT_DECK_OESD_FLOP_TO_RIVER, hitProbability(8, 31, 2));
  assert.equal(SD.SHORT_DECK_FLUSH_DRAW_FLOP_TO_RIVER, hitProbability(5, 31, 2));
  assert.equal(SD.FULL_DECK_OESD_FLOP_TO_RIVER, hitProbability(8, 47, 2));
  assert.equal(SD.FULL_DECK_FLUSH_DRAW_FLOP_TO_RIVER, hitProbability(9, 47, 2));

  const counts = shortDeckSevenCardCounts();
  assert.equal(counts.hands, SD.SHORT_DECK_SEVEN_CARD_SETS);
  assert.equal(counts.flush, SD.SHORT_DECK_SEVEN_CARD_FLUSHES);
  assert.equal(counts.fullHouse, SD.SHORT_DECK_SEVEN_CARD_FULL_HOUSES);

  const AA = [card(14, 0), card(14, 1)];
  const JTs = [card(11, 2), card(10, 2)];
  assert.equal(exactEquity(AA, JTs, SHORT_RANKS, true, false).equity, SD.SHORT_DECK_AA_VS_JTS_STRAIGHT_BEATS_TRIPS);
  assert.equal(exactEquity(AA, JTs, SHORT_RANKS, true, true).equity, SD.SHORT_DECK_AA_VS_JTS_TRIPS_BEAT_STRAIGHT);

  const sd = reportText(RESEARCH_REPORTS.find((r) => r.slug === 'short-deck-6-plus-holdem-equity-and-ante-math-benchmark'));
  for (const retired of ['1.96%', '3.26%', '54.4%', '74.8%', '48.5%', '79.6%']) {
    assert.ok(!sd.includes(retired), `short deck page still states the refuted ${retired}`);
  }
  assert.ok(sd.includes(SD.SHORT_DECK_FLUSH_PCT) && sd.includes(SD.SHORT_DECK_FULL_HOUSE_PCT));
});

test('statute page states the IRS rules with their primary sources, including the 2026 loss cap', () => {
  const tax = RESEARCH_REPORTS.find((r) => r.basis === 'statute');
  const text = reportText(tax);
  assert.ok(tax.sources.some((s) => s.url.startsWith('https://www.irs.gov/')));
  assert.ok(tax.sources.some((s) => s.url.includes('congress.gov')));
  assert.match(text, /5,000 Dollars/);
  assert.match(text, /10,000 Dollars/);
  assert.match(text, /90% Of Gambling Losses/, 'the Public Law 119-21 loss cap applies from tax year 2026');
});

test('directory figures are one dated read and agree with each other', () => {
  const sum = TF.TOURNAMENT_WEEK_BY_TIER.reduce((a, t) => a + t.events, 0);
  assert.equal(sum, TF.TOURNAMENT_WEEK_EVENTS, 'tier counts add up to the week');
  assert.ok(TF.TOURNAMENT_WEEK_MIN_BUY_IN <= TF.TOURNAMENT_WEEK_MEDIAN_BUY_IN);
  assert.ok(TF.TOURNAMENT_WEEK_MEDIAN_BUY_IN <= TF.TOURNAMENT_WEEK_MAX_BUY_IN);
  const floor = Number(TF.WEEKLY_TOURNAMENT_LABEL.replace('+', ''));
  assert.ok(floor > 0 && floor <= TF.TOURNAMENT_WEEK_EVENTS, 'the public weekly floor never exceeds the read');
  const idx = RESEARCH_REPORTS.find((r) => r.basis === 'directory');
  const text = reportText(idx);
  assert.ok(text.includes(String(TF.TOURNAMENT_WEEK_EVENTS)) && text.includes(TF.TOURNAMENT_SNAPSHOT_WEEK_START));
  assert.doesNotMatch(text, /Fee (?:Ratio|Allocation|Percentage) Of \d|\d+(?:\.\d+)?% (?:Median )?(?:House|Fee|Total Fee)/, 'the directory has no fee column');
});

test('every weekly tournament count on the site is the directory floor', () => {
  const WEEKLY = /(\d[\d.,  ]*)\+\s+(?:Weekly|Listed Weekly|Live (?:Poker )?Tournaments A Week|Torneos Semanales|Wöchentlichen Turnieren|Tournois Hebdomadaires|Torneios Semanais|Tornei Settimanali)\b/g;
  const bad = [];
  for (const rel of SCANNED) {
    const src = read(rel);
    for (const m of src.matchAll(WEEKLY)) {
      if (`${m[1].replace(/[\s  ]/g, '')}+` !== TF.WEEKLY_TOURNAMENT_LABEL) bad.push(`${rel}: ${m[0]}`);
    }
  }
  assert.deepEqual(bad, [], `weekly tournament claims must read ${TF.WEEKLY_TOURNAMENT_LABEL}`);
});

test('guide table counts come only from the directory, and market totals are not stated', () => {
  for (const [name, n] of Object.entries(VENUE_TABLES_ON_FILE)) {
    assert.ok(Number.isInteger(n) && n > 0, `${name} must have a positive table count`);
    assert.equal(tablesLabel(name), `${n} ${n === 1 ? 'Table' : 'Tables'}`);
  }
  const allowed = new Set(Object.keys(VENUE_TABLES_ON_FILE).map((k) => tablesLabel(k)));
  for (const g of POKER_MARKET_GUIDES) {
    assert.equal(g.activeRoomsEstimate, `${listedVenueLabel(g.stateCode)} In ${g.stateCode} (Smarter.Poker Directory)`);
    for (const v of g.topVenueHighlights) {
      if (v.tables !== undefined) assert.ok(allowed.has(v.tables), `${g.slug} ${v.name}: ${v.tables} is not on file`);
    }
  }
  const TYPED_TABLES = /(?<![/$\d.,])\b\d{1,3}(?:,\d{3})*\+?(?: To \d+)?\s+(?:(?:Permanent|Combined|Active|Live|Daily|Poker|High-Limit|Mid-Stakes|Mid-To-High Stakes)\s+)*Tables\b/;
  const TYPED_ROOMS = /(?<![/$\d.,])\b(?:Over |Nearly )?\d{1,3}(?:,\d{3})*\+?\s+(?:(?:Active|Licensed|Live|Brick-And-Mortar|Commercial|Tribal|Charitable|Pari-Mutuel|Casino|Poker|Card|Major)\s+)*(?:Poker Rooms|Cardrooms|Card Rooms|Card Clubs)\b/;
  const guideFiles = fs.readdirSync(path.join(ROOT, 'src/content/guides')).map((f) => `src/content/guides/${f}`);
  for (const rel of [...guideFiles, 'pages/poker-rooms/guides/index.js', 'pages/poker-rooms/states/index.js', 'src/lib/seo/datasetCatalog.mjs', 'pages/api/ai/corpus.js']) {
    const lines = read(rel).split('\n');
    lines.forEach((line, i) => {
      assert.doesNotMatch(line, TYPED_TABLES, `${rel}:${i + 1} types a table count by hand; use tablesLabel() or drop it`);
      assert.doesNotMatch(line, TYPED_ROOMS, `${rel}:${i + 1} types a room count by hand; use listedVenueLabel() or drop it`);
    });
  }
});

test('the whitepaper keeps only figures with a basis', () => {
  const src = read('pages/research/annual-state-of-poker-2026.js');
  assert.doesNotMatch(src, /TWENTY_FIVE_EMPIRICAL_STATISTICS|25 (?:Key |Canonical )?Empirical/);
  const block = src.slice(src.indexOf('export const WHITEPAPER_FIGURES'), src.indexOf('export function renderAnnualWhitepaperMarkdown'));
  const bases = [...block.matchAll(/basis: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(bases.length >= 8);
  for (const b of bases) assert.ok(['Computed', 'Statute', 'Directory Data'].includes(b), `unknown basis ${b}`);
  assert.equal(Math.ceil((1.96 * 85 / 5) ** 2 * 100), 111023, 'the confidence-sample figure is the arithmetic');
  assert.ok(AA_VS_KK > 0.81 && AA_VS_KK < 0.82, 'AA vs KK is about 81%, not the 85.2% of AA vs a random hand');
  assert.ok(JJ_VS_AKS > 0.53 && JJ_VS_AKS < 0.55);
  const bench = read('pages/research/benchmarks.js');
  assert.doesNotMatch(bench, /netWinrateRetentionScore|cashActionDensityIndex|Retention Score|\/ 100'|\/ 10 \(/, 'the market page carries no invented scores');
});

test('the retired figures and the DOI that never resolved do not come back', () => {
  const RETIRED = [
    /zenodo\.15129481/i,
    /\b4[,.  ]500\+/,
    /Over 4,500 (?:Recurring|Weekly)/,
    /84(?:\.0)?% Of (?:Surveyed )?US/,
    /\bOf Surveyed\b/,
    /185,000\+/,
    /\b10M\+ Simulated|10 Million Simulated/,
    /\b(?:15|25) (?:First-Party )?Empirical (?:Studies|Statistics|Research Studies|Research Reports|Benchmarks|Industry Benchmarks|Poker Studies)/,
    /First-Party Empirical/,
    /Win-Rate Retention Score|94\.8 \/ 100/,
    /Over 65% Of Atlantic City/,
    /28\+ Active Brick-And-Mortar/,
    /Nearly 30 Pari-Mutuel/,
    /\b(?:550|280|240|250)\+? Active (?:Poker )?Tables/,
    /85\.20% \(AA Vs KK\)/,
    /Flushes Significantly Rarer Than Full Houses \(1\.96%/,
  ];
  const hits = [];
  for (const rel of SCANNED) {
    const src = read(rel);
    for (const re of RETIRED) if (re.test(src)) hits.push(`${rel}: ${re}`);
  }
  assert.deepEqual(hits, []);
});
