import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  APP_ORIGIN,
  AUTH_ORIGIN,
  classifyHistorySurface,
  exactSemanticLabel,
  isForbiddenPostMutation,
  validateConfiguration,
  validateReceipt,
} from '../scripts/ci/social-card-live-check.mjs';
import { fetchRecentClubArenaHands } from '../src/lib/clubArenaHandImport.mjs';

const workflow = readFileSync(new URL('../.github/workflows/e2e-tests.yml', import.meta.url), 'utf8');
const script = readFileSync(new URL('../scripts/ci/social-card-live-check.mjs', import.meta.url), 'utf8');
const sha = 'a'.repeat(40);
const sourceSha = 'b'.repeat(40);
const environment = {
  TEST_USER_EMAIL: 'fixture@example.invalid',
  TEST_USER_PASSWORD: 'fixture-password',
  NEXT_PUBLIC_SUPABASE_URL: AUTH_ORIGIN,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-anon-key',
  SOCIAL_CARD_EXPECTED_SHA: sha,
  SOCIAL_CARD_SOURCE_SHA: sourceSha,
};

test('social card certificate is manual, exact-source, and uses only hosted test credentials', () => {
  assert.match(workflow, /social-card-live/);
  assert.match(workflow, /run: node scripts\/ci\/social-card-live-check\.mjs/);
  assert.match(workflow, /TEST_USER_EMAIL: \$\{\{ vars\.TEST_USER_EMAIL \|\| secrets\.TEST_USER_EMAIL \}\}/);
  assert.match(workflow, /TEST_USER_PASSWORD: \$\{\{ secrets\.TEST_USER_PASSWORD \}\}/);
  assert.match(workflow, /SOCIAL_CARD_SOURCE_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /git merge-base --is-ancestor "\$DEPLOYED_SHA" "\$SOURCE_SHA"/);
  assert.match(workflow, /git diff --quiet "\$DEPLOYED_SHA" "\$SOURCE_SHA" --/);
  for (const path of [
    'pages/hub/home-games/[slug].js', 'pages/hub/reels.js',
    'src/components/social/PokerCardPicker.jsx', 'src/components/social/SharedPostCreator.jsx',
    'src/lib/clubArenaHandImport.mjs', 'src/lib/pokerCardMarkup.js',
  ]) assert.ok(workflow.includes(path), `Runtime inclusion scope is missing ${path}`);
  assert.doesNotMatch(workflow, /social-card-live[\s\S]{0,1800}(?:schedule:|workflow_run:)/);
  assert.doesNotMatch(script, /SUPABASE_SERVICE_ROLE_KEY|auth\.admin|createUser|deleteUser/);
});

test('social card certificate accepts a separately proven source descendant and refuses malformed authority', () => {
  assert.doesNotThrow(() => validateConfiguration(environment));
  assert.throws(() => validateConfiguration({ ...environment, SOCIAL_CARD_SOURCE_SHA: 'main' }), /source SHA/);
  assert.throws(() => validateConfiguration({ ...environment, NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' }), /authentication origin/);
  assert.throws(() => validateConfiguration({ ...environment, SOCIAL_CARD_EXPECTED_SHA: 'main', SOCIAL_CARD_SOURCE_SHA: 'main' }), /full commit/);
});

test('social card certificate distinguishes successful import from both empty states', () => {
  assert.equal(classifyHistorySurface({ importButtons: 1 }), 'imported-own-hand');
  assert.equal(classifyHistorySurface({ importButtons: 0, emptyText: true }), 'empty-history');
  assert.equal(classifyHistorySurface({ importButtons: 0, rejectedText: true }), 'empty-no-complete-card-data');
  assert.throws(() => classifyHistorySurface({ importButtons: 0 }), /terminal state/);
});

test('social card certificate holds the ten pointer inside the browser event loop', () => {
  assert.match(script, /button\[aria-controls="quick-rank-suits"\]/);
  assert.match(script, /hasText: \/\^1\$\//);
  assert.match(script, /The 1 quick-rank key did not expose the ten long-press label/);
  assert.match(script, /quickRankButtonCount/);
  assert.match(script, /visibleOneCount/);
  assert.match(script, /tenAriaLabel/);
  assert.match(script, /new PointerEvent\('pointerdown'/);
  assert.match(script, /pointerType: 'touch'/);
  assert.match(script, /setTimeout\(resolve, 500\)/);
  assert.match(script, /new PointerEvent\('pointerup'/);
  assert.match(script, /receipt\.stage = 'dispatch-ten-hold'/);
  assert.match(script, /receipt\.stage = 'await-ten-suits'/);
  assert.match(script, /tenAriaExpanded/);
});

test('semantic labels allow title casing but preserve the exact card and action', () => {
  const addTenSpades = exactSemanticLabel('Add 10 of spades to your hand');
  assert.equal(addTenSpades.test('Add 10 Of Spades To Your Hand'), true);
  assert.equal(addTenSpades.test('Add 9 Of Spades To Your Hand'), false);
  assert.equal(addTenSpades.test('Add 10 Of Hearts To Your Hand'), false);
  assert.equal(addTenSpades.test('Remove 10 Of Spades From Your Hand'), false);
});

test('duplicate proof selects from the quick suit tray before checking the unique disabled grid card', () => {
  assert.match(script, /const tenSuits = dialog\.getByRole\('group', \{ name: exactSemanticLabel\('10 suit choices'\) \}\)/);
  assert.match(script, /tenSuits\.getByRole\('button', \{ name: exactSemanticLabel\('Add 10 of spades to your hand'\) \}\)\.click\(\)/);
  assert.match(script, /tenSuits\.waitFor\(\{ state: 'hidden' \}\)/);
  assert.match(script, /exactSemanticLabel\('Remove 10 of spades from your hand'\) \}\)\.waitFor\(\{ state: 'visible' \}\)/);
  assert.match(script, /assert\.equal\(await duplicate\.count\(\), 1/);
  assert.match(script, /assert\.equal\(await duplicate\.isDisabled\(\), true/);
});

test('recent hand import starts from the indexed own-facts window and bounds the public hand lookup', async () => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const newest = '22222222-2222-4222-8222-222222222222';
  const rejected = '33333333-3333-4333-8333-333333333333';
  const oldest = '44444444-4444-4444-8444-444444444444';
  const calls = [];
  const db = {
    from(table) {
      calls.push([table, 'from']);
      return {
        select(columns) { calls.push([table, 'select', columns]); return this; },
        order(column, options) { calls.push([table, 'order', column, options]); return this; },
        in(column, values) { calls.push([table, 'in', column, values]); return this; },
        async limit(value) {
          calls.push([table, 'limit', value]);
          if (table === 'ca_hand_facts') return {
            error: null,
            data: [
              { hand_id: '55555555-5555-4555-8555-555555555555', user_id: 'attacker', played_at: '2026-10-09T01:00:00Z', hole_cards: ['Qs', 'Qh'] },
              { hand_id: newest, user_id: owner, played_at: '2026-10-09T00:00:00Z', hole_cards: ['As', 'Kh'] },
              { hand_id: rejected, user_id: owner, played_at: '2026-10-08T23:00:00Z', hole_cards: ['As', 'As'] },
              { hand_id: oldest, user_id: owner, played_at: '2026-10-08T22:00:00Z', hole_cards: ['9c', '9d'] },
            ],
          };
          return {
            error: null,
            // Deliberately not in recent-facts order: the importer must restore it.
            data: [
              { id: oldest, hand_number: 6, created_at: '2026-10-08T22:00:00Z', community_cards: [] },
              { id: rejected, hand_number: 7, created_at: '2026-10-08T23:00:00Z', community_cards: [] },
              { id: newest, hand_number: 8, created_at: '2026-10-09T00:00:00Z', community_cards: ['2c', '7d', 'Th'] },
            ],
          };
        },
      };
    },
  };
  const result = await fetchRecentClubArenaHands(db, owner, 500);
  assert.deepEqual(result.hands.map((hand) => hand.id), [newest, oldest]);
  assert.equal(result.rejected, 1, 'duplicate private cards must be rejected');
  assert.deepEqual(calls.find((call) => call[0] === 'ca_hand_facts' && call[1] === 'order').slice(2), [
    'played_at', { ascending: false },
  ]);
  assert.equal(calls.find((call) => call[0] === 'ca_hand_facts' && call[1] === 'limit')[2], 8);
  assert.deepEqual(calls.find((call) => call[0] === 'hand_history' && call[1] === 'in').slice(2), [
    'id', [newest, rejected, oldest],
  ]);
  assert.doesNotMatch(JSON.stringify(result), /attacker|55555555/);
  assert.equal(calls.some((call) => call[1] === 'filter'), false);
});

test('social card certificate blocks publication but permits its bounded preference restore', () => {
  assert.equal(isForbiddenPostMutation('POST', `${APP_ORIGIN}/api/social/pages/posts`), true);
  assert.equal(isForbiddenPostMutation('POST', `${AUTH_ORIGIN}/rest/v1/posts`), true);
  assert.equal(isForbiddenPostMutation('PATCH', `${AUTH_ORIGIN}/rest/v1/profiles?id=eq.fixture`), false);
  assert.equal(isForbiddenPostMutation('GET', `${APP_ORIGIN}/api/social/feed`), false);
  assert.match(script, /originalSettings = clone/);
  assert.match(script, /update\(\{ app_settings: originalSettings \}\)/);
  assert.match(script, /preferencesRestored/);
});

test('sanitized receipt requires every card, RLS, cleanup, and no-publication proof', () => {
  const receipt = {
    status: 'passed', expectedSha: sha, sourceSha, observedSha: sha, deploymentId: 'dpl_fixture',
    history: { outcome: 'empty-history' },
    checks: Object.fromEntries([
      'authenticatedServiceIdentity', 'canonicalArtwork', 'longPressTen',
      'duplicateRefusal', 'draftReload', 'presetRoundTrip', 'preferencesRestored',
      'anonymousFactsDenied', 'otherUsersFactsDenied', 'noPostMutation',
    ].map((key) => [key, true])),
  };
  assert.doesNotThrow(() => validateReceipt(receipt, sha));
  assert.throws(() => validateReceipt({ ...receipt, history: { outcome: 'unknown' } }, sha), /distinguish/);
  assert.throws(() => validateReceipt({ ...receipt, checks: { ...receipt.checks, noPostMutation: false } }, sha), /noPostMutation/);
});
