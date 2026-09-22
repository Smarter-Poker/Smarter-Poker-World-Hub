/**
 * EVERY LESSON ANSWERS FIRST (AEO section 3.7, 2026-09-22).
 *
 * /learn is forty poker strategy lessons written to be quoted: an engine
 * asked "what does UTG open in 6 max" or "how does ICM work" should find a
 * page whose first sentence is the answer, whose chart is a real table, and
 * whose numbers are right. This law pins all three.
 *
 *   - the corpus: forty lessons, unique slugs, 350 to 700 words of prose
 *     each, a one sentence answer first, Title Case, no em dashes, no
 *     ampersands, titles that survive a search result
 *   - the links: every related lesson resolves, every glossary term the
 *     page prints has a page, every training call to action points at a
 *     page file that exists and does not redirect a signed out reader
 *   - the charts: generated from src/config/solverRanges.js, checked cell
 *     by cell against the corpus, with the provenance /hub/preflop-charts
 *     states attached word for word
 *   - the numbers: every function behind a quoted figure is checked against
 *     a value derived independently here, ICM by brute force over every
 *     finishing order rather than by the recursion the module uses
 *   - the schema: an Article published by the organization, part of the
 *     /learn CollectionPage, with a BreadcrumbList and no author Person
 *   - the sitemap and llms.txt promote /learn
 *
 * Runs under plain node with no install; runs in the Build Safety Gate.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LESSONS,
  LEARN_CATEGORIES,
  PROVENANCE,
  TRAINING_TOOLS,
  JARVIS,
  lessonWords,
  trainingCta,
} from '../src/content/learn/lessons.js';
import { ORGANIZATION_ID, LEARN_COLLECTION_ID, LEARN_PUBLISHED, LEARN_MODIFIED } from '../src/lib/learn/learnSite.js';
import { readGlossaryTerms, glossaryLinksFor, GLOSSARY_MODULE, GLOSSARY_PAGE } from '../src/lib/learn/glossaryLinks.js';
import { handAt, GRID_RANKS } from '../src/lib/learn/rangeGrid.js';
import * as M from '../src/lib/learn/pokerMath.js';
import { fitsInAResult } from '../src/lib/seo/titleFit.js';
import { actionShare, supportShare } from '../src/lib/seo/preflopReference.js';
import { RFI, BB_DEFENSE, FOUR_BET, RFI_20BB } from '../src/config/solverRanges.js';
import { TRAINING_LIBRARY } from '../src/data/TRAINING_LIBRARY.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(ROOT, file));
const bySlug = new Map(LESSONS.map((l) => [l.slug, l]));
const lesson = (slug) => {
  const l = bySlug.get(slug);
  assert.ok(l, `the ${slug} lesson exists`);
  return l;
};
const close = (actual, expected, eps, what) =>
  assert.ok(Math.abs(actual - expected) <= eps, `${what}: ${actual} is not ${expected}`);

/** Every string a reader sees in a lesson, with where it came from. */
function copyOf(l) {
  const out = [['title', l.title], ['summary', l.summary]];
  for (const s of l.sections) {
    out.push(['heading', s.heading]);
    for (const p of s.paragraphs) out.push(['paragraph', p]);
    if (s.table) {
      out.push(['caption', s.table.caption]);
      for (const h of s.table.head) out.push(['table head', h]);
      for (const row of s.table.rows) for (const c of row) out.push(['table cell', String(c)]);
    }
    if (s.chart) out.push(['chart caption', s.chart.caption]);
  }
  return out;
}

// ─── The corpus ─────────────────────────────────────────────────────────────

test('forty lessons, each with a unique, stable slug and a known category', () => {
  assert.equal(LESSONS.length, 40, 'the launch corpus is forty lessons');
  assert.equal(bySlug.size, LESSONS.length, 'no two lessons share a slug');
  for (const l of LESSONS) {
    assert.match(l.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${l.slug} is a clean URL segment`);
    assert.ok(LEARN_CATEGORIES.includes(l.category), `${l.slug} has a known category, not ${l.category}`);
  }
  for (const c of LEARN_CATEGORIES) {
    assert.ok(LESSONS.some((l) => l.category === c), `the ${c} category has at least one lesson`);
  }
});

test('every lesson is a real answer: 350 to 700 words of prose', () => {
  for (const l of LESSONS) {
    // Counted here, independently of the module's own helper.
    const words = [l.summary, ...l.sections.flatMap((s) => s.paragraphs)].join(' ').split(/\s+/).filter(Boolean).length;
    assert.equal(words, lessonWords(l), `${l.slug}: the module counts its own words honestly`);
    assert.ok(words >= 350 && words <= 700, `${l.slug} has ${words} words of prose`);
    assert.ok(l.sections.length >= 3, `${l.slug} has at least three sections`);
  }
});

test('the answer comes first: the summary is one sentence that says it', () => {
  for (const l of LESSONS) {
    assert.ok(l.summary.endsWith('.'), `${l.slug}: the summary is a finished sentence`);
    // A sentence break is a full stop, question or exclamation mark followed
    // by a space. "Smarter.Poker" and "2.5" have no space after the dot.
    const sentences = l.summary.split(/[.!?]\s+/).filter(Boolean);
    assert.equal(sentences.length, 1, `${l.slug}: the answer is one sentence, not ${sentences.length}`);
    assert.ok(l.summary.length >= 80, `${l.slug}: the answer says enough to be quoted`);
  }
});

test('copy follows the house rules: Title Case, no em dashes, no ampersands', () => {
  for (const l of LESSONS) {
    for (const [where, text] of copyOf(l)) {
      assert.ok(!text.includes('—'), `${l.slug} ${where} has an em dash: ${text}`);
      assert.ok(!text.includes('&'), `${l.slug} ${where} has an ampersand: ${text}`);
      for (const m of text.matchAll(/[A-Za-z][A-Za-z0-9'’]*/g)) {
        const before = text[m.index - 1] || '';
        if (/\d/.test(before)) continue; // a suffix: 100bb, 2x, 6k
        assert.ok(
          m[0][0] === m[0][0].toUpperCase(),
          `${l.slug} ${where}: "${m[0]}" is not Title Case in "${text.slice(Math.max(0, m.index - 30), m.index + 30)}"`,
        );
      }
    }
  }
});

test('every lesson title survives a search result', () => {
  for (const l of LESSONS) {
    assert.ok(fitsInAResult(l.title), `"${l.title} | Smarter.Poker" is cut off in a result`);
  }
  assert.ok(fitsInAResult(`Learn Poker Strategy: ${LESSONS.length} Free Lessons`), 'the index title fits');
});

// ─── The links ──────────────────────────────────────────────────────────────

test('every related lesson is a lesson', () => {
  for (const l of LESSONS) {
    assert.ok(l.related.length >= 2, `${l.slug} links at least two related lessons`);
    for (const r of l.related) {
      assert.ok(bySlug.has(r), `${l.slug} links a lesson that does not exist: ${r}`);
      assert.notEqual(r, l.slug, `${l.slug} links itself`);
    }
  }
});

test('a lesson prints a glossary link only when the term has a page', () => {
  const terms = readGlossaryTerms(ROOT);
  for (const l of LESSONS) assert.ok(l.glossary.length >= 1, `${l.slug} names the glossary terms it uses`);
  if (exists(GLOSSARY_MODULE)) {
    // The glossary is live: every slug a lesson names must be a real term,
    // so a typo fails here instead of silently dropping the link.
    assert.ok(exists(GLOSSARY_PAGE), 'the glossary module ships with its page route');
    assert.ok(terms.size >= 40, `the glossary reader found only ${terms.size} terms, so its pattern is stale`);
    for (const l of LESSONS) {
      for (const g of l.glossary) assert.ok(terms.has(g), `${l.slug} names a glossary term with no page: ${g}`);
      assert.equal(glossaryLinksFor(l.glossary, terms).length, l.glossary.length);
    }
  } else {
    // No glossary module on this tree: no /glossary/<slug> page exists, so
    // no lesson may print a link to one.
    assert.equal(terms.size, 0, 'with no glossary module there are no terms to link');
    for (const l of LESSONS) assert.equal(glossaryLinksFor(l.glossary, terms).length, 0);
  }
  const page = read('pages/learn/[topic].js');
  assert.match(page, /glossaryLinksFor\(lesson\.glossary, readGlossaryTerms\(\)\)/, 'the page links only resolved terms');
});

/** The page file a route is served from, or null. */
function pageFileFor(route) {
  for (const candidate of [`pages${route}.js`, `pages${route}/index.js`, `pages${route}.tsx`, `pages${route}/index.tsx`]) {
    if (exists(candidate)) return candidate;
  }
  return null;
}

test('every call to action points at a real training page, after the answer', () => {
  const library = new Map(TRAINING_LIBRARY.map((g) => [g.id, g]));
  assert.ok(exists('pages/hub/training/play/[gameId].js'), 'the training game route exists');
  for (const tool of Object.keys(TRAINING_TOOLS)) {
    const file = pageFileFor(tool);
    assert.ok(file, `the ${tool} page exists`);
    const src = read(file);
    assert.doesNotMatch(src, /CanonicalTrainingRedirect|redirect:\s*\{/, `${tool} redirects instead of rendering`);
  }
  assert.ok(pageFileFor(JARVIS.href), 'the Jarvis page exists');
  for (const l of LESSONS) {
    const game = library.get(l.train?.game);
    assert.ok(game, `${l.slug} trains with a game in the library, not ${l.train?.game}`);
    assert.notEqual(game.vipOnly, true, `${l.slug} sends a reader to a VIP only game`);
    if (l.train.tool) assert.ok(TRAINING_TOOLS[l.train.tool], `${l.slug} names an unknown tool ${l.train.tool}`);
    const cta = trainingCta(l);
    assert.equal(cta.game.href, `/hub/training/play/${game.id}`);
    assert.equal(cta.game.name, game.name);
  }
  const page = read('pages/learn/[topic].js');
  const sections = page.indexOf('lesson.sections.map');
  const practise = page.indexOf('practise-heading');
  assert.ok(sections > 0 && practise > sections, 'the call to action is rendered after the lesson, never before it');
  assert.doesNotMatch(page, /getAuthUser|useVIPGate|useEffect|noindex/, 'nothing on a lesson page is gated or hidden');
});

// ─── The charts ─────────────────────────────────────────────────────────────

test('the grid is the chart layout every reader expects', () => {
  assert.equal(handAt(0, 0), 'AA');
  assert.equal(handAt(0, 1), 'AKs', 'suited above the diagonal');
  assert.equal(handAt(1, 0), 'AKo', 'offsuit below it');
  assert.equal(handAt(12, 12), '22');
  const all = new Set();
  for (let r = 0; r < 13; r += 1) for (let c = 0; c < 13; c += 1) all.add(handAt(r, c));
  assert.equal(all.size, 169, 'every starting hand class appears exactly once');
  assert.deepEqual(GRID_RANKS, ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']);
});

/** Every chart the corpus prints, with the frequency map it must match. */
function charts() {
  const out = [];
  for (const l of LESSONS) {
    for (const s of l.sections) if (s.chart) out.push({ lesson: l, section: s, chart: s.chart });
  }
  return out;
}

const SOURCES = {
  'RFI.UTG': RFI.UTG,
  'RFI.MP': RFI.MP,
  'RFI.HJ': RFI.HJ,
  'RFI.CO': RFI.CO,
  'RFI.BTN': RFI.BTN,
  'RFI.SB': RFI.SB,
  'BB_DEFENSE.vs_BTN': BB_DEFENSE.vs_BTN,
  'FOUR_BET.BTN_vs_3bet': FOUR_BET.BTN_vs_3bet,
  'RFI_20BB.BTN': RFI_20BB.BTN,
};

test('the preflop charts are generated from the bundled corpus, cell by cell', () => {
  const src = read('src/content/learn/parts/preflop.js');
  assert.match(src, /from '..\/..\/..\/config\/solverRanges\.js'/, 'the lessons read the corpus module');
  assert.match(src, /rangeGrid\(/, 'and build every chart with the grid builder');
  const found = charts();
  assert.equal(found.length, 9, 'six opening charts, big blind defence, facing a three bet and 20 big blinds');
  for (const { lesson: l, chart } of found) {
    const map = SOURCES[chart.source];
    assert.ok(map, `${l.slug} charts an unknown source ${chart.source}`);
    assert.equal(chart.grid.rows.length, 13);
    for (const row of chart.grid.rows) {
      assert.equal(row.cells.length, 13);
      for (const cell of row.cells) {
        for (const v of cell.values) {
          const expected = Math.round((Number(map[cell.hand]?.[v.key]) || 0) * 100);
          assert.equal(v.percent, expected, `${l.slug} ${cell.hand} ${v.key} is ${v.percent}%, the corpus says ${expected}%`);
        }
      }
    }
  }
  // One cell spelled out, so a reader of this file can see what is checked.
  const utg = lesson('utg-opening-range').sections[0].chart.grid;
  const ajo = utg.rows[GRID_RANKS.indexOf('J')].cells[GRID_RANKS.indexOf('A')];
  assert.equal(ajo.hand, 'AJo');
  assert.equal(ajo.values[0].percent, Math.round(RFI.UTG.AJo.raise * 100));
});

test('each opening chart states both honest sizes of its range', () => {
  for (const { lesson: l, chart } of charts()) {
    if (!chart.source.startsWith('RFI')) continue;
    const map = SOURCES[chart.source];
    assert.equal(chart.sizes.percent, actionShare(map, 'raise'), `${l.slug} frequency weighted size`);
    assert.equal(chart.sizes.reach, supportShare(map, 'raise'), `${l.slug} reach`);
    assert.ok(l.summary.includes(`${actionShare(map, 'raise')}%`), `${l.slug} states its size in the answer`);
  }
});

test('every chart carries the provenance the chart page states, word for word', () => {
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const chartPage = norm(read('src/components/seo/PreflopReference.js'));
  assert.ok(chartPage.includes(norm(PROVENANCE)), '/hub/preflop-charts and /learn state the same provenance');
  assert.match(PROVENANCE, /Not A Solver Export/);
  for (const { lesson: l, section } of charts()) {
    assert.ok(section.paragraphs.some((p) => p.includes(PROVENANCE)), `${l.slug} says what its chart is`);
  }
  for (const l of LESSONS) {
    for (const [, text] of copyOf(l)) {
      assert.doesNotMatch(text, /Solver Exact|Solver Output Of This|Solved By Smarter/i, `${l.slug} overclaims`);
    }
  }
});

// ─── The numbers ────────────────────────────────────────────────────────────

test('pot odds, defence and bluffing math match hand derived values', () => {
  close(M.requiredEquity(50, 100), 50 / 200, 1e-12, 'call 50 to win 200');
  close(M.requiredEquity(1, 1), 1 / 3, 1e-12, 'pot sized bet');
  close(M.requiredEquity(1 / 3, 1), 0.2, 1e-12, 'third pot bet');
  close(M.priceOfCall(1.5, 4), 1.5 / 5.5, 1e-12, 'big blind versus a 2.5 open');
  close(M.minimumDefenseFrequency(50, 100), 2 / 3, 1e-12, 'MDF half pot');
  close(M.minimumDefenseFrequency(1, 1), 0.5, 1e-12, 'MDF pot');
  close(M.bluffBreakEven(0.5, 1), 1 / 3, 1e-12, 'alpha half pot');
  close(M.bluffBreakEven(110, 133), 110 / 243, 1e-12, 'check-raise alpha');
  close(M.indifferentBluffShare(1, 1), 1 / 3, 1e-12, 'bluff share pot');
  close(M.minimumDefenseFrequency(0.75, 1) + M.bluffBreakEven(0.75, 1), 1, 1e-12, 'alpha and MDF add to one');
  assert.equal(M.pct(M.requiredEquity(50, 100)), '25%');
  assert.equal(M.pct(M.requiredEquity(1, 1)), '33.3%');
  assert.ok(lesson('pot-odds').summary.includes('25%'), 'the pot odds answer quotes the computed price');
  assert.ok(lesson('big-blind-defense').summary.includes('27.3%'), 'the big blind price is quoted');
  assert.ok(lesson('check-raising').summary.includes('45.3%'));
});

test('outs, combinations, EV and implied odds match hand derived values', () => {
  close(M.hitByRiver(9), 1 - (38 / 47) * (37 / 46), 1e-12, 'nine outs twice');
  close(M.hitOnRiver(9), 9 / 46, 1e-12, 'nine outs once');
  close(M.hitByRiver(15), 1 - (32 / 47) * (31 / 46), 1e-12, 'fifteen outs twice');
  assert.equal(M.pct(M.hitByRiver(9)), '35%');
  assert.equal(M.choose(52, 2), 1326);
  assert.equal(M.combosWithDead('AK'), 16);
  assert.equal(M.combosWithDead('AKs'), 4);
  assert.equal(M.combosWithDead('AKo'), 12);
  assert.equal(M.combosWithDead('QQ'), 6);
  assert.equal(M.combosWithDead('AK', ['Ah']), 12);
  assert.equal(M.combosWithDead('AK', ['Ah', 'Kd']), 9);
  assert.equal(M.combosWithDead('QQ', ['Qs']), 3);
  assert.equal(M.combosWithDead('QQ', ['Qs', 'Qh']), 1);
  assert.equal(M.combosWithDead('AKs', ['As']), 3);
  close(M.callEV(0.3, 150, 50), 10, 1e-9, 'EV of the worked call');
  close(M.impliedOddsNeeded(50, 150, 9 / 46), (50 * 37) / 9 - 150, 1e-9, 'implied odds for a turn flush draw');
  close(M.stackToPot(92.5, M.calledThreeBetPot(7.5, 1.5)), 92.5 / 16.5, 1e-12, 'three bet pot SPR');
  close(M.mRatio(12000, 400, 800, 800), 6, 1e-12, 'M');
  close(M.bountyRequiredEquity(20, 21.5, 10), 20 / 51.5, 1e-12, 'bounty call');
  close(M.rakeFor(10, 0.05, 3), 0.5, 1e-12, 'uncapped rake');
  close(M.rakeFor(100, 0.05, 3), 3, 1e-12, 'capped rake');
  assert.ok(lesson('counting-outs').summary.includes('35%'));
  assert.ok(lesson('expected-value').summary.includes('Worth 10 Chips'));
});

/** ICM by brute force: every finishing order, weighted by Malmuth-Harville. */
function bruteIcm(stacks, payouts) {
  const n = stacks.length;
  const eq = new Array(n).fill(0);
  const alive = stacks.map((_, i) => i).filter((i) => stacks[i] > 0);
  const permute = (rest, order) => {
    if (!rest.length) {
      let p = 1;
      let left = order.reduce((s, i) => s + stacks[i], 0);
      for (const i of order) {
        p *= stacks[i] / left;
        left -= stacks[i];
      }
      order.forEach((i, place) => { eq[i] += p * (payouts[place] || 0); });
      return;
    }
    rest.forEach((i, k) => permute([...rest.slice(0, k), ...rest.slice(k + 1)], [...order, i]));
  };
  permute(alive, []);
  return eq;
}

test('ICM matches brute force over every finishing order', () => {
  const cases = [
    [[5000, 3000, 2000], [50, 30, 20]],
    [[4000, 3000, 2000, 1000], [50, 30, 20]],
    [[40, 25, 15, 10, 6, 4], [35, 22, 15, 11, 9, 8]],
    [[40, 30, 20, 6, 4], [1, 1, 1, 1]],
  ];
  for (const [stacks, payouts] of cases) {
    const got = M.icmEquities(stacks, payouts);
    const want = bruteIcm(stacks, payouts);
    got.forEach((g, i) => close(g, want[i], 1e-9, `ICM ${stacks} player ${i + 1}`));
    close(got.reduce((a, b) => a + b, 0), payouts.slice(0, stacks.length).reduce((a, b) => a + b, 0), 1e-9, 'equity sums to the prize pool');
  }
  // The classic three handed example, derived by hand: first 0.5, second
  // 0.3 x 5/7 + 0.2 x 5/8, third the rest.
  const second = 0.3 * (5 / 7) + 0.2 * (5 / 8);
  close(M.icmEquities([5000, 3000, 2000], [50, 30, 20])[0], 25 + 30 * second + 20 * (1 - 0.5 - second), 1e-9, 'chip leader');
  assert.ok(lesson('icm-basics').summary.includes('38.39%'), 'the ICM answer quotes the computed equity');

  // The bubble call: busting pays nothing, so the price is now / win.
  const bubble = [4000, 3000, 2000, 1000];
  const now = bruteIcm(bubble, [50, 30, 20])[1];
  const win = bruteIcm([1000, 6000, 2000, 1000], [50, 30, 20])[1];
  const t = M.icmCallThreshold(bubble, [50, 30, 20], 1, 0);
  close(t.icm, now / win, 1e-9, 'bubble threshold');
  assert.equal(t.lose, 0, 'a player who busts on the bubble wins nothing');
  assert.ok(lesson('bubble-play').summary.includes(M.pct(now / win)), 'the bubble answer quotes the computed threshold');

  // The satellite call: after losing, the leader is the third stack.
  const sat = M.icmCallThreshold([40, 30, 20, 6, 4], [1, 1, 1, 1], 0, 2);
  close(sat.win, 1, 1e-12, 'four left for four seats is a seat for everyone');
  close(sat.lose, bruteIcm([20, 30, 40, 6, 4], [1, 1, 1, 1])[0], 1e-9, 'satellite loss');
});

test('bankroll and variance figures match their formulas', () => {
  close(M.riskOfRuin(5, 100, 2000), Math.exp(-2), 1e-12, '20 buy ins');
  close(M.riskOfRuin(5, 100, 5000), Math.exp(-5), 1e-12, '50 buy ins');
  assert.equal(M.riskOfRuin(0, 100, 5000), 1, 'no edge, certain ruin');
  close(M.normalCdf(0), 0.5, 1e-7, 'normal at 0');
  close(M.normalCdf(-0.5), 0.3085375, 1e-6, 'normal at -0.5');
  close(M.normalCdf(1.96), 0.9750021, 1e-6, 'normal at 1.96');
  const o = M.sampleOutcome(5, 100, 10000);
  close(o.mean, 500, 1e-9, 'expected result');
  close(o.sd, 1000, 1e-9, 'standard deviation');
  close(o.chanceBehind, 0.3085375, 1e-6, 'chance behind');
  assert.ok(lesson('risk-of-ruin').summary.includes('13.5%'));
  assert.ok(lesson('variance-and-downswings').summary.includes('31%'));
});

test('bankroll lessons state conventions as conventions and never imply real money here', () => {
  for (const l of LESSONS.filter((x) => x.category === 'Bankroll')) {
    const prose = [l.summary, ...l.sections.flatMap((s) => s.paragraphs)].join(' ');
    assert.match(prose, /Play Credit Only And No Real Money Gambling/, `${l.slug} says the platform is play credit only`);
    if (l.slug !== 'risk-of-ruin') assert.match(l.summary, /A Common Guideline/, `${l.slug} labels its buy in count`);
  }
  for (const l of LESSONS) {
    for (const [where, text] of copyOf(l)) {
      for (const m of text.matchAll(/Real Money/gi)) {
        const before = text.slice(Math.max(0, m.index - 4), m.index);
        assert.match(before, /(No|Not) $/, `${l.slug} ${where} mentions real money without negating it: ${text}`);
      }
      assert.doesNotMatch(text, /\bDeposit|\bWithdraw|Cash Out Your/i, `${l.slug} ${where} talks about moving money`);
    }
  }
});

// ─── The pages, schema, sitemap and llms.txt ────────────────────────────────

test('the routes are static, server rendered and never ship the corpus to the browser', () => {
  const topic = read('pages/learn/[topic].js');
  const index = read('pages/learn/index.js');
  assert.match(topic, /export async function getStaticPaths\(\)/);
  assert.match(topic, /fallback: false/, 'an unknown slug is a real 404');
  assert.match(topic, /export async function getStaticProps\(/);
  assert.match(index, /export async function getStaticProps\(/);
  for (const [name, src] of [['[topic]', topic], ['index', index]]) {
    const component = src.slice(src.indexOf('export default function'));
    assert.doesNotMatch(component, /\bLESSONS\b|getLesson\(|lessonsByCategory\(|trainingCta\(|readGlossaryTerms\(/, `${name} reads the corpus only at build time`);
    assert.match(src, /import SEOHead from '..\/..\/src\/components\/seo\/SEOHead'/, `${name} uses the shared SEO head`);
  }
  assert.match(topic, /<h1 style=\{styles\.h1\}>\{lesson\.title\}<\/h1>\s*<p style=\{styles\.lead\}>\{lesson\.summary\}<\/p>/, 'the answer is the first paragraph under the h1');
  assert.match(topic, /<h2 style=\{styles\.h2\}>\{section\.heading\}<\/h2>/, 'sections are h2s');
  assert.match(topic, /<table style=\{styles\.grid\}>/, 'charts are tables');
  assert.match(topic, /firstThatFits\(/, 'the title is fitted by the one place that decides');
});

test('the schema is an Article by the organization, part of the collection, with no author', () => {
  const topic = read('pages/learn/[topic].js');
  const index = read('pages/learn/index.js');
  const head = read('vendor/commander-shared/src/components/seo/SEOHead.js');
  assert.ok(head.includes(`'@id': '${ORGANIZATION_ID}'`), 'the publisher id is the organization node the site defines');
  assert.equal(LEARN_COLLECTION_ID, 'https://smarter.poker/learn#collection');
  assert.match(topic, /'@type': 'Article'/);
  assert.match(topic, /headline: lesson\.title/);
  assert.match(topic, /datePublished: LEARN_PUBLISHED/);
  assert.match(topic, /dateModified: LEARN_MODIFIED/);
  assert.match(topic, /publisher: \{ '@id': ORGANIZATION_ID \}/);
  assert.match(topic, /isPartOf: \{\s*'@type': 'CollectionPage',\s*'@id': LEARN_COLLECTION_ID/);
  assert.match(topic, /'@type': 'BreadcrumbList'/);
  assert.match(index, /'@type': 'CollectionPage',\s*'@id': LEARN_COLLECTION_ID/);
  assert.match(index, /'@type': 'BreadcrumbList'/);
  for (const [name, src] of [['[topic]', topic], ['index', index]]) {
    assert.doesNotMatch(src, /'@type': 'Person'|\bauthor\s*:/, `${name} invents no author`);
  }
  for (const d of [LEARN_PUBLISHED, LEARN_MODIFIED]) assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
});

test('the sitemap and llms.txt promote /learn and every lesson from the module', () => {
  const sitemap = read('pages/sitemap.xml.js');
  assert.match(sitemap, /import \{ LESSONS \} from '..\/src\/content\/learn\/lessons'/);
  assert.match(sitemap, /const learnPages = \[\s*\{ path: LEARN_PATH,/);
  assert.match(sitemap, /\.\.\.LESSONS\.map\(\(l\) => \(\{ path: lessonPath\(l\.slug\)/);
  assert.match(sitemap, /\.\.\.learnPages,/, 'the block is spread into the sitemap');
  assert.ok(read('public/llms.txt').includes('https://smarter.poker/learn'), 'llms.txt links /learn');
  assert.doesNotMatch(read('middleware.ts'), /['"`]\/learn/, 'the middleware does not special case /learn');
});
