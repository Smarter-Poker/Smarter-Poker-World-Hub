import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { vipCheckoutAnalytics } from '../src/lib/store/vipCheckoutAnalytics.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

/* Dan, 2026-11-27, follow-up to the $1 first month. Nothing here renders:
   the help assistants are told the real prices, retired prices leave the
   comments and setup notes, and checkout_started reports what is due today. */

test('checkout_started reports the amount due today and marks the one dollar offer', async () => {
  const monthly = { id: 'vip-monthly', price: 20, interval: 'month' };
  assert.deepEqual(vipCheckoutAnalytics(monthly, true), { value_usd: 1, recurring_value_usd: 20, intro_offer: true });
  assert.deepEqual(vipCheckoutAnalytics(monthly, false), { value_usd: 20, recurring_value_usd: 20, intro_offer: false });
  // Only "true" from the reviewed terms counts; unknown is never the offer.
  assert.deepEqual(vipCheckoutAnalytics(monthly, null), { value_usd: 20, recurring_value_usd: 20, intro_offer: false });
  // Only the monthly subscription can carry the offer.
  assert.deepEqual(
    vipCheckoutAnalytics({ id: 'vip-yearly', price: 200, interval: 'year' }, true),
    { value_usd: 200, recurring_value_usd: 200, intro_offer: false }
  );
  assert.deepEqual(
    vipCheckoutAnalytics({ id: 'vip-lifetime', price: 500, interval: 'lifetime', oneTime: true }, true),
    { value_usd: 500, recurring_value_usd: 0, intro_offer: false }
  );
  const store = await read('pages/hub/diamond-store.js');
  assert.match(store, /\.\.\.vipCheckoutAnalytics\(plan, introReviewed\),/);
  // introReviewed is the same flag that puts introCents in the reviewed terms.
  assert.match(store, /const introReviewed = !plan\.oneTime && plan\.interval === 'month' && vipIntro\.eligible === true;/);
  const start = store.indexOf('const introReviewed =');
  const capture = store.indexOf('...vipCheckoutAnalytics(plan, introReviewed)');
  assert.ok(start > 0 && capture > start);
});

test('the help assistants know the real VIP prices and terms', async () => {
  const [training, world, prompts, injection, jarvis] = await Promise.all([
    read('src/lib/geevesKB/trainingAndDiamonds.js'),
    read('src/lib/geevesKB/worldHub.js'),
    read('src/lib/liveHelp/agentPrompts.ts'),
    read('src/lib/liveHelp/knowledgeInjection.ts'),
    read('src/lib/liveHelp/jarvisKnowledgeBase.md'),
  ]);
  for (const [name, source] of Object.entries({ training, world, prompts, injection, jarvis })) {
    assert.match(source, /\$20\/month/i, `${name}: monthly price`);
    assert.match(
      source,
      /first month (is )?\$1 for a first-time card subscriber with a verified email or phone \(one time per account, card only\)/i,
      `${name}: first month`
    );
    assert.match(source, /\$200/, `${name}: yearly price`);
    assert.match(source, /\$500/, `${name}: lifetime price`);
    assert.match(source, /2,000 Diamonds/, `${name}: diamond month`);
    assert.match(source, /no first-month discount/i, `${name}: no diamond discount`);
    assert.match(source, /cancel anytime/i, `${name}: cancel`);
    assert.match(source, /starts with the first full-price renewal/i, `${name}: stipend`);
    assert.doesNotMatch(source, /Bronze, Silver, Gold|Bronze VIP|\$19\.99|\$199\.99/, `${name}: stale tiers or prices`);
  }
  assert.doesNotMatch(world, /\*\*Elite\*\* \| All Pro/);
});

test('the in-app assistant answers a price question with the VIP entry', async () => {
  const { TRAINING_KB = null, default: fallback = null, ...rest } = await import('../src/lib/geevesKB/trainingAndDiamonds.js');
  const lists = [TRAINING_KB, fallback, ...Object.values(rest)].filter(Array.isArray);
  const entry = lists.flat().find((item) => item?.id === 'ds-5');
  assert.ok(entry, 'ds-5 is exported');
  assert.ok(entry.patterns.includes('how much is vip'));
  assert.ok(entry.patterns.includes('how much does vip cost'));
  assert.match(entry.answer, /\*\*Monthly:\*\* \$20\/month by card/);
  assert.match(entry.answer, /\*\*Yearly:\*\* \$200\/year by card/);
  assert.match(entry.answer, /\*\*Lifetime:\*\* \$500, one payment, never renews/);
});

test('code comments and setup notes no longer state a retired VIP price', async () => {
  const [stripe, runbook, rewards, diamonds, catalog] = await Promise.all([
    read('STRIPE_SETUP.md'),
    read('DEPLOY-RUNBOOK-rewards-v2.md'),
    read('src/config/diamondRewards.js'),
    read('pages/api/store/purchase-vip-with-diamonds.js'),
    read('src/data/diamondStoreData.js'),
  ]);
  assert.match(stripe, /\*\*VIP Monthly\*\*: \$20\/month recurring/);
  assert.match(stripe, /\*\*VIP Annual\*\*: \$200\/year recurring/);
  assert.match(stripe, /sp-vip-first-month-1usd/);
  assert.doesNotMatch(stripe, /\$9\.99\/month|\$99\.99\/year/);
  assert.doesNotMatch(runbook, /\$19\.99 \/ month|\$199\.99 \/ year/);
  assert.match(rewards, /VIP = \$20\/mo \(\$200\/yr, \$500 lifetime\)/);
  assert.doesNotMatch(rewards, /\$19\.99|\$199\.99|1,999/);
  assert.match(diamonds, /\/\/ \$20 -> 2000, \$200 -> 20000, \$500 -> 50000/);
  assert.match(catalog, /CURRENT PRICES \(whole dollars/);
});
