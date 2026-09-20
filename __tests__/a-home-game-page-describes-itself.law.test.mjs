/**
 * A HOME GAME PAGE DESCRIBES ITSELF (2026-09-18).
 *
 * /hub/home-games/[slug] used the operator's own description verbatim
 * whenever they wrote one, falling back to a generated sentence only when
 * they wrote nothing. Measured live on 2026-09-18,
 * /hub/home-games/saturday-night-poker-club was published to Google with a
 * sixteen-character description: "Weekly home game".
 *
 * A short operator note is an incomplete description, not a bad one. The
 * page now keeps their words and completes them from the record, and the
 * live SEO contract checks the sampled sitemap URLs for a usable
 * description and a heading, which is the gate that missed this.
 *
 * Reads source files and pure modules; runs in the Build Safety Gate with
 * no install.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  homeGameDescription,
} from '../src/lib/home-games/homeGameSeo.mjs';
import {
  headingCount,
  markupOnly,
  pageEssentials,
  SAMPLE_DESCRIPTION_MIN,
} from '../scripts/ci/check-live-seo-contract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const LIVE_BUG = {
  name: 'Saturday Night Poker Club',
  city: 'Las Vegas',
  state: 'NV',
  description: 'Weekly home game',
  stakesLine: 'NLH 1/2',
  schedule: 'Weekly · Saturday',
};

test('the sixteen-character description measured live is completed, not published as is', () => {
  const d = homeGameDescription(LIVE_BUG);
  assert.ok(d.length >= DESCRIPTION_MIN, `got ${d.length} characters, need ${DESCRIPTION_MIN}`);
  assert.ok(d.length <= DESCRIPTION_MAX, `got ${d.length} characters, over ${DESCRIPTION_MAX}`);
  // The operator's own words still lead it.
  assert.match(d, /^Weekly home game\./);
  // And the record completes it.
  assert.match(d, /Saturday Night Poker Club/);
  assert.match(d, /Las Vegas, NV/);
});

test('a description is generated when the operator wrote none, and a long one is left alone', () => {
  const generated = homeGameDescription({ name: 'Riverside Poker', city: 'Austin', state: 'TX', stakesLine: 'PLO 2/5' });
  assert.ok(generated.length >= DESCRIPTION_MIN && generated.length <= DESCRIPTION_MAX);
  assert.match(generated, /Riverside Poker is a poker home game in Austin, TX\./);

  const long =
    'A long-running dealer-choice game that has met every Friday since 2019, welcoming new players who know basic etiquette and want a friendly, well-run table.';
  const kept = homeGameDescription({ name: 'X Club', city: 'Reno', state: 'NV', description: long });
  assert.equal(kept, long, 'an operator description that already fills the snippet is untouched');
});

test('a game with no city and no stakes still reaches a usable length', () => {
  const d = homeGameDescription({ name: 'Anon Game', description: 'Cash only' });
  assert.ok(d.length >= DESCRIPTION_MIN, `got ${d.length}`);
  assert.ok(d.length <= DESCRIPTION_MAX);
  const bare = homeGameDescription({ name: 'Bare Game' });
  assert.ok(bare.length >= DESCRIPTION_MIN, `got ${bare.length}`);
});

test('the page composes its description instead of passing the operator field through', () => {
  const src = read('pages/hub/home-games/[slug].js');
  assert.match(src, /import \{ homeGameDescription \} from '[./]+\/src\/lib\/home-games\/homeGameSeo\.mjs'/);
  assert.match(src, /const metaDesc = homeGameDescription\(\{/);
  assert.ok(
    !/\(group\.description \|\| page\.description \|\|[\s\S]{0,200}\)\.slice\(0, 160\)/.test(src),
    'the verbatim operator description must not come back'
  );
});

test('the live contract checks the sampled URLs for a usable description and a heading', () => {
  assert.equal(SAMPLE_DESCRIPTION_MIN, 60);
  assert.deepEqual(pageEssentials(`<meta name="description" content="${'x'.repeat(80)}"/><h1>Heading</h1>`), {
    ok: true,
    reasons: [],
  });
  assert.deepEqual(pageEssentials('<meta name="description" content="Weekly home game"/><h1>Heading</h1>'), {
    ok: false,
    reasons: ['description is 16 characters, under 60'],
  });
  assert.deepEqual(pageEssentials('<h1>Heading</h1>'), { ok: false, reasons: ['no meta description'] });
  assert.deepEqual(pageEssentials(`<meta name="description" content="${'x'.repeat(80)}"/>`), {
    ok: false,
    reasons: ['no <h1>'],
  });
  const src = read('scripts/ci/check-live-seo-contract.mjs');
  assert.match(src, /const essentials = pageEssentials\(r\.text\)/, 'the sample loop must run it');
  assert.match(src, /missing a description or heading/, 'the summary must report how many failed');
});

test('a heading quoted inside a script is not a heading', () => {
  // The arena shell assigns a last-resort boot error UI as a string:
  //   root.innerHTML = '<h1 ...>Loading Failed</h1>...'
  // A raw regex over the response counts three <h1> on every arena page
  // when there is one, so the live gate would accept a page whose only
  // heading is quoted JavaScript. Same defect #4790 fixed for the arena
  // prerender verifier.
  const scriptOnly = `<script>root.innerHTML = '<h1 style="x">Loading Failed</h1>';</script>`;
  assert.equal(headingCount(scriptOnly), 0);
  assert.equal(headingCount('<h1>Real</h1>'), 1);
  assert.equal(headingCount(`<h1>Real</h1>${scriptOnly}`), 1, 'script headings must not inflate the count');
  assert.equal(headingCount('<style>h1{}</style><h1>Real</h1>'), 1);
  assert.equal(headingCount('<!-- <h1>commented</h1> -->'), 0);
  assert.equal(headingCount(''), 0);
  assert.ok(!markupOnly(scriptOnly).includes('Loading Failed'));
  assert.deepEqual(
    pageEssentials(`<meta name="description" content="${'x'.repeat(80)}"/>${scriptOnly}`),
    { ok: false, reasons: ['no <h1>'] }
  );
});
