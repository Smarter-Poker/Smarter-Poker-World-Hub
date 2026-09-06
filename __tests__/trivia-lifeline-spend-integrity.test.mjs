/**
 * As a Trivia player, I can safely retry the same skip purchase without being
 * charged twice, but I cannot reuse a cheaper or differently typed debit to
 * unlock the five-diamond benefit.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
    fixedSpendAmount,
    validateDiamondSpendReceipt,
} from '../src/lib/diamonds/spendReceiptPolicy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const splitMigration = source => {
    const marker = '-- ROLLBACK (Tier 3:';
    const markerIndex = source.indexOf(marker);
    assert.notEqual(markerIndex, -1, 'Tier 3 rollback marker must exist');
    return {
        active: source.slice(0, markerIndex),
        rollback: source.slice(markerIndex),
    };
};

const EXPECTED_REFERENCE = 'spend:player-1:trivia_lifeline:session-1:question-1:skip';

test('Trivia lifelines have one server-owned price', () => {
    assert.equal(fixedSpendAmount('trivia_lifeline'), 5);
    assert.equal(fixedSpendAmount('game_cost'), null);
});

test('a spend receipt must bind the charged amount, type and reference', () => {
    const expected = {
        amount: 5,
        transactionType: 'trivia_lifeline',
        referenceId: EXPECTED_REFERENCE,
    };
    const exact = {
        success: true,
        charged: 5,
        balance: 95,
        transaction_type: 'trivia_lifeline',
        reference_id: EXPECTED_REFERENCE,
        counterparty: 'revenue:trivia_lifeline',
        issuance_class: 'spend',
        idempotent: true,
    };

    assert.deepEqual(validateDiamondSpendReceipt(exact, expected), {
        ok: true,
        charged: 5,
        balance: 95,
        idempotent: true,
    });
    assert.equal(validateDiamondSpendReceipt({ ...exact, charged: 1 }, expected).ok, false);
    assert.equal(validateDiamondSpendReceipt({ ...exact, transaction_type: 'game_cost' }, expected).ok, false);
    assert.equal(validateDiamondSpendReceipt({ ...exact, reference_id: 'spend:player-1:other' }, expected).ok, false);
    assert.equal(validateDiamondSpendReceipt({ ...exact, counterparty: 'player:other' }, expected).ok, false);
    assert.equal(validateDiamondSpendReceipt({ ...exact, idempotent: 'true' }, expected).ok, false);
    assert.equal(validateDiamondSpendReceipt({ ...exact, success: undefined }, expected).ok, false);
});

test('the spend API rejects a caller-priced lifeline and validates the database receipt', () => {
    const source = read('pages/api/diamonds/spend.js');

    assert.match(source, /fixedSpendAmount\(source\)/);
    assert.match(source, /amount !== serverAmount/);
    assert.match(source, /validateDiamondSpendReceipt\(result,\s*\{/);
    assert.match(source, /transactionType:\s*source/);
    assert.match(source, /referenceId/);
    assert.match(source, /invalid_charge_receipt/);
    assert.doesNotMatch(source, /charged:\s*amount,\s*\n\s*balance:/);
    assert.doesNotMatch(
        source,
        /if\s*\(\s*\(profile\.diamonds\s*\?\?\s*0\)\s*<\s*amount\s*\)/,
        'the database must decide insufficient balance after checking for an exact replay',
    );
});

test('deduct_diamonds rejects a replay whose amount or transaction type changed', () => {
    const { active: migration } = splitMigration(
        read('supabase/migrations/20260906210000_deduct_diamonds_idempotency_binding.sql'),
    );

    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.deduct_diamonds/i);
    assert.match(migration, /v_existing_amount\s+numeric/i);
    assert.match(migration, /v_existing_type\s+text/i);
    assert.match(migration, /v_existing_amount\s+IS DISTINCT FROM\s+-p_amount/i);
    assert.match(migration, /v_existing_type\s+IS DISTINCT FROM\s+v_effective_type/i);
    assert.match(migration, /v_existing_counterparty\s+IS DISTINCT FROM\s+v_counterparty/i);
    assert.match(migration, /v_existing_issuance_class\s+IS DISTINCT FROM\s+v_issuance_class/i);
    assert.match(migration, /'idempotency_conflict'/i);
    assert.match(migration, /'transaction_type',\s+v_existing_type/i);
    assert.match(migration, /'reference_id',\s+p_reference_id/i);
    assert.doesNotMatch(migration, /v_existing_balance/i);

    const replayIndex = migration.indexOf('IF p_reference_id IS NOT NULL THEN');
    const insufficientIndex = migration.indexOf('IF v_current < p_amount THEN');
    assert.ok(replayIndex >= 0 && replayIndex < insufficientIndex,
        'an exact replay must be recovered before a later low balance is rejected');
});

test('the replacement preserves debit security, paired balances and least privilege', () => {
    const { active: migration } = splitMigration(
        read('supabase/migrations/20260906210000_deduct_diamonds_idempotency_binding.sql'),
    );

    assert.match(migration, /^-- TIER:\s+3\b/m);
    assert.match(migration, /p_amount\s+IS NULL\s+OR\s+p_amount\s*<=\s*0/i);
    assert.match(migration, /auth\.role\(\).*service_role/is);
    assert.match(migration, /auth\.uid\(\).*p_user_id/is);
    assert.match(migration, /SET search_path\s*=\s*public,\s*extensions/i);
    assert.match(migration, /SET\s+diamonds\s*=\s*diamonds\s*-\s*p_amount/is);
    assert.match(migration, /diamond_balance\s*=\s*diamonds\s*-\s*p_amount/is);
    assert.match(migration, /counterparty,\s*issuance_class/i);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.deduct_diamonds[\s\S]*FROM PUBLIC, anon, authenticated/i);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.deduct_diamonds[\s\S]*TO service_role/i);
});

test('the Tier 3 migration includes an executable exact-function rollback', () => {
    const { rollback } = splitMigration(
        read('supabase/migrations/20260906210000_deduct_diamonds_idempotency_binding.sql'),
    );

    assert.match(rollback, /Exact pre-migration production function captured on 2026-09-06/);
    assert.match(rollback, /\/\*\s*BEGIN;/s);
    assert.match(rollback, /CREATE OR REPLACE FUNCTION public\.deduct_diamonds/i);
    assert.match(rollback, /SET search_path TO 'public'/i);
    assert.match(rollback, /SELECT balance_after INTO v_new_balance[\s\S]*WHERE reference_id = p_reference_id AND user_id = p_user_id/i);
    assert.match(rollback, /'charged', p_amount, 'idempotent', true/i);
    assert.match(rollback, /REVOKE ALL ON FUNCTION public\.deduct_diamonds[\s\S]*FROM PUBLIC, anon, authenticated/i);
    assert.match(rollback, /GRANT EXECUTE ON FUNCTION public\.deduct_diamonds[\s\S]*TO service_role/i);
    assert.match(rollback, /COMMIT;\s*\*\//s);

    const functionSource = rollback.match(/AS \$function\$(\n[\s\S]*?\n)\$function\$;/)?.[1];
    assert.ok(functionSource, 'rollback must contain a complete function body');
    assert.equal(
        crypto.createHash('md5').update(functionSource).digest('hex'),
        'b7238d237b723d59443b96711a8a887a',
        'rollback must restore the byte-exact production prosrc captured before this migration',
    );
});

test('the durable database rehearsal cannot commit its migration or fixtures', () => {
    const rehearsal = read('scripts/trivia/lifeline-spend-migration-rehearsal.cjs');

    assert.match(rehearsal, /activeBegins\.length === 1 && activeCommits\.length === 1/);
    assert.match(rehearsal, /Migration escaped the rollback-only outer transaction/);
    assert.match(rehearsal, /Documented rollback escaped the rollback-only outer transaction/);
    assert.match(rehearsal, /await client\.query\('ROLLBACK'\)/);
    assert.match(rehearsal, /persistentWalletChanges:\s*0/);
    assert.match(rehearsal, /persistentLedgerRows:\s*0/);
    assert.match(rehearsal, /TRIVIA_LIFELINE_ALLOW_PRODUCTION_REHEARSAL/);
    assert.match(rehearsal, /--verify-live/);
    assert.match(rehearsal, /post_deploy_verification/);
});

test('the adversarial lifeline suite is reachable from the blocking meta-guard', () => {
    const guard = read('__tests__/_test-guards-exist.test.mjs');
    assert.match(guard, /import '\.\/trivia-lifeline-spend-integrity\.test\.mjs';/);
});
