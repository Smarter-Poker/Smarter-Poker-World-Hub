import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Phase 24 is the compact Marketplace suite anchor. Import the Phase 8
// Lifetime contract so both local and Vercel builds execute the new checks.
import './marketplace-phase-8-lifetime-entitlements.test.mjs';

const ROOT = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, ROOT), 'utf8');

test('Settings routes VIP lifecycle work to the canonical same-surface command center', async () => {
  const settings = await read('pages/hub/settings.js');

  assert.match(settings, /router\.push\('\/hub\/vip-membership\/manage'\)/);
  assert.match(settings, />\s*Manage Membership\s*</);
  assert.match(settings, /router\.push\(`\/hub\/diamond-store\/orders\/\$\{encodeURIComponent\(order\.id\)\}\?source=merchandise`\)/);
  assert.doesNotMatch(settings, /target=["']_blank["']/);
  assert.doesNotMatch(settings, /CancelVipModal|showCancelModal|cancelStep/);
  assert.equal(
    existsSync(new URL('src/components/settings/modals/CancelVipModal.js', ROOT)),
    false,
    'the deceptive legacy cancellation modal must not ship'
  );
});

test('no Marketplace surface claims an unwired VIP retention discount', async () => {
  const sources = (await Promise.all([
    'pages/hub/settings.js',
    'pages/hub/vip-membership.js',
    'pages/hub/vip-membership/manage.js',
    'pages/api/store/cancel-vip.js',
    'pages/api/store/switch-vip-plan.js',
  ].map(read))).join('\n');

  assert.doesNotMatch(sources, /50% Off|Discount Applied|actual Stripe coupon|Claim 50% Off/i);
});

test('VIP lifecycle requests terminate and safely replay the same intent', async () => {
  const manage = await read('pages/hub/vip-membership/manage.js');

  assert.match(manage, /MEMBERSHIP_ACTION_TIMEOUT_MS = 20_000/);
  assert.match(manage, /const controller = new AbortController\(\)/);
  assert.match(manage, /signal: controller\.signal/);
  assert.match(manage, /actionIntentRef\.current\.intent !== intent/);
  assert.match(manage, /'X-Idempotency-Key': actionIntentRef\.current\.key/);
  assert.match(manage, /Membership Change Timed Out/);
  assert.match(manage, /actionControllerRef\.current\?\.abort\(\)/);
});

test('the global drawer restores focus only after a real open and close cycle', async () => {
  const drawer = await read('src/components/ui/HamburgerMenu.jsx');

  assert.match(drawer, /const wasOpenRef = useRef\(false\)/);
  assert.match(drawer, /if \(!wasOpenRef\.current\) return undefined/);
  assert.match(drawer, /wasOpenRef\.current = true/);
  assert.match(drawer, /wasOpenRef\.current = false/);
});

test('card membership mutations are private, bounded, and Stripe-idempotent', async () => {
  const [cancel, plan] = await Promise.all([
    read('pages/api/store/cancel-vip.js'),
    read('pages/api/store/switch-vip-plan.js'),
  ]);

  for (const source of [cancel, plan]) {
    assert.match(source, /Cache-Control', 'private, no-store, max-age=0'/);
    assert.match(source, /Vary', 'Authorization'/);
    assert.match(source, /IDEMPOTENCY_KEY_PATTERN/);
    assert.match(source, /req\.headers\['x-idempotency-key'\]/);
    assert.match(source, /A valid X-Idempotency-Key header is required/);
    assert.match(source, /const normalizedClientKey = clientKey\.trim\(\)/);
    assert.match(source, /\{ idempotencyKey: `vip-(?:cancel|switch):\$\{userId\}:\$\{normalizedClientKey\}` \}/);
  }

  assert.match(cancel, /CANCELLATION_REASONS/);
  assert.match(cancel, /reasonText\.length > 500/);
  assert.match(cancel, /Unknown fields/);
  assert.match(cancel, /reconciliationPending = true/);
  assert.match(cancel, /Billing Cancellation Is Scheduled\. Membership Telemetry Is Refreshing\./);

  assert.match(plan, /currentInterval === target\.interval/);
  assert.match(plan, /JSON\.stringify\(body\)\.length > 512/);
  assert.match(plan, /Unknown fields/);
  assert.match(plan, /idempotent: true/);
});

test('Phase 24 is included in the compact Marketplace deployment contract', async () => {
  const [pkg, ignore] = await Promise.all([read('package.json'), read('.vercelignore')]);
  assert.match(pkg, /__tests__\/diamond-store-phase-24\.test\.mjs/);
  assert.match(ignore, /!\/__tests__\/diamond-store-phase-24\.test\.mjs/);
});
