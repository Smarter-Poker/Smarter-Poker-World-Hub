/**
 * Phase 11 Regression Guard: Conceptual/Psychology Daily Hand Contract & Turnkey Two-Account E2E Harness
 *
 * Permanently prevents the live production Daily Hand false outage caused when
 * /api/training/hand-of-the-day serves a cardless PSYCHOLOGY_BANK question, and
 * verifies the fail-closed contract of scripts/e2e/pa-two-account-e2e.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  normalizeDailyHandPayload,
  resolveDailyHeroHand,
} from '../src/lib/personal-assistant/dailyHandContract.mjs';
import {
  E2E_STEPS,
  REQUIRED_ENV_KEYS,
  parseArgs,
  validateE2EEnvironment,
} from '../scripts/e2e/pa-two-account-e2e.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('1. normalizeDailyHandPayload accepts real PSYCHOLOGY_BANK daily challenges without fabricating cards', () => {
  // Exact production payload observed on https://smarter.poker/api/training/hand-of-the-day (daily-2026-11-26)
  const livePsychologyPayload = {
    success: true,
    dailyId: 'daily-2026-11-26',
    question: {
      id: 'psych_cash-020_0',
      level: 1,
      gameId: 'cash-020',
      source: 'PSYCHOLOGY_BANK',
      options: [
        { id: 'a', text: 'The table with the best seat aesthetics and atmosphere' },
        { id: 'b', text: 'The presence of weaker players' },
        { id: 'c', text: 'The table where you have the best history of running hot' },
        { id: 'd', text: 'The table with the most professional players to learn from' },
      ],
      question: 'What is the single most important factor when choosing between available cash games?',
      scenario: {
        action: '',
        context: '',
        description: 'Three tables run at your stake: one full of regulars, one mixed, one with several loose recreational players.',
        isPsychology: true,
      },
    },
  };

  assert.equal(resolveDailyHeroHand(livePsychologyPayload.question, livePsychologyPayload.question.scenario), null);

  const normalized = normalizeDailyHandPayload(livePsychologyPayload);
  assert.ok(normalized, 'Valid PSYCHOLOGY_BANK daily challenge must NOT normalize to null');
  assert.equal(normalized.id, 'psych_cash-020_0');
  assert.equal(normalized.isConceptual, true);
  assert.equal(normalized.heroHand, null);
  assert.equal(normalized.categoryLabel, 'Mental Game');
  assert.equal(normalized.position, null);
  assert.equal(normalized.board, null);
  assert.equal(normalized.pot, null);
  assert.match(normalized.title, /choosing between available cash games/i);
  assert.match(normalized.description, /Three tables run at your stake/i);
});

test('2. normalizeDailyHandPayload keeps card-based hands intact and fails closed on malformed payloads', () => {
  const cardPayload = {
    success: true,
    dailyId: 'daily-2026-11-25',
    question: {
      id: 'gto-001',
      hero_hand: '22',
      position: 'CO',
      pot_size: 1.5,
      question: 'Action folds to you in CO at 6 BB effective. Push or fold?',
      scenario: { heroPosition: 'CO', potSize: 1.5, heroHand: '22' },
    },
  };

  const normalizedCard = normalizeDailyHandPayload(cardPayload);
  assert.ok(normalizedCard);
  assert.equal(normalizedCard.isConceptual, false);
  assert.equal(normalizedCard.heroHand, '2s2h');
  assert.equal(normalizedCard.position, 'CO');
  assert.equal(normalizedCard.pot, 1.5);

  // Malformed or empty payloads still fail closed
  assert.equal(normalizeDailyHandPayload(null), null);
  assert.equal(normalizeDailyHandPayload({ success: true }), null);
  assert.equal(
    normalizeDailyHandPayload({ question: { id: 'broken-card-hand', source: 'PIO_SOLVER', question: 'Missing cards' } }),
    null,
  );
  assert.equal(
    normalizeDailyHandPayload({ question: { id: 'broken-psych', source: 'PSYCHOLOGY_BANK', question: '', options: [] } }),
    null,
  );
});

test('3. PA Home preserves approved landing artwork and live saved-hand and coaching states', () => {
  const home = read('pages/hub/personal-assistant/index.js');

  assert.match(home, /<ApprovedIllustration\s+kind="review"/);
  assert.match(home, /<ApprovedIllustration\s+kind="sandbox"/);
  assert.match(home, /<ApprovedIllustration\s+kind="leaks"/);
  assert.match(home, /savedHandsLoading/);
  assert.match(home, /readyToReviewText/);
  assert.match(home, /coachingSnapshot/);
});

test('4. scripts/e2e/pa-two-account-e2e.mjs fails closed without credentials, never reads .env, and passes --check-only', () => {
  const scriptSrc = read('scripts/e2e/pa-two-account-e2e.mjs');

  assert.deepEqual(REQUIRED_ENV_KEYS, [
    'PA_E2E_EMAIL_A',
    'PA_E2E_PASSWORD_A',
    'PA_E2E_EMAIL_B',
    'PA_E2E_PASSWORD_B',
  ]);
  assert.equal(E2E_STEPS.length, 5);
  assert.doesNotMatch(scriptSrc, /dotenv|\.env\.local|readFileSync\([^)]*\.env/i, 'E2E harness must never read .env files');

  const emptyEnv = validateE2EEnvironment({});
  assert.equal(emptyEnv.ready, false);
  assert.equal(emptyEnv.missing.length, 4);

  const partialEnv = validateE2EEnvironment({ PA_E2E_EMAIL_A: 'a@example.com' });
  assert.equal(partialEnv.ready, false);
  assert.equal(partialEnv.missing.length, 3);

  const fullEnv = validateE2EEnvironment({
    PA_E2E_EMAIL_A: 'a@example.com',
    PA_E2E_PASSWORD_A: 'pw-a',
    PA_E2E_EMAIL_B: 'b@example.com',
    PA_E2E_PASSWORD_B: 'pw-b',
  });
  assert.equal(fullEnv.ready, true);
  assert.deepEqual(fullEnv.missing, []);

  assert.deepEqual(parseArgs(['--check-only', '--base-url', 'https://smarter.poker/', '--desktop']), {
    baseUrl: 'https://smarter.poker',
    checkOnly: true,
    viewport: 'desktop',
  });

  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts/e2e/pa-two-account-e2e.mjs'), '--check-only'], {
    encoding: 'utf8',
  });
  assert.match(out, /pa-two-account-e2e contract ok/);
});
