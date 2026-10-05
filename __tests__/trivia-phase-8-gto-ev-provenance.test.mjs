import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
    createAuthoritativeTriviaSolverEv,
    sanitizeAuthoritativeTriviaSolverEv,
    TRIVIA_SOLVER_EV_SOURCE,
} from '../src/lib/trivia/solverEvPolicy.mjs';

const ROOT = process.cwd();
const read = relativePath => readFileSync(join(ROOT, relativePath), 'utf8');

function authoritativeRow(overrides = {}) {
    return {
        id: '11111111-1111-4111-8111-111111111111',
        scenario_hash: 'cash_flop_btn_bb_AsKs',
        strategy_matrix_v2: {
            solver: 'PioSOLVER',
            source_combo_order_sha256: 'e'.repeat(64),
            training_game_contracts_sha256: 'f'.repeat(64),
        },
        solver_version: 'PioSOLVER-pro 3.8.0',
        solver_binary_checksum: 'a'.repeat(64),
        pipeline_commit: 'b'.repeat(40),
        manifest_version: 'solver-manifest-v1',
        manifest_checksum: 'c'.repeat(64),
        source_artifact_checksum: 'd'.repeat(64),
        quality_status: 'validated',
        audited_at: '2026-10-05T17:00:00.000Z',
        solver_provenance_active: true,
        ...overrides,
    };
}

const V2_BRIDGE = {
    source: 'pio_v2',
    hand_evs: { AKs: 1.375 },
};

test('authoritative V2 EV records exact BB source, aggregation and sealed provenance', () => {
    const ev = createAuthoritativeTriviaSolverEv({
        row: authoritativeRow(),
        matrix: V2_BRIDGE,
        heroHand: 'AKs',
    });
    assert.ok(ev);
    assert.equal(ev.contract, 'trivia-solver-ev/1');
    assert.equal(ev.value, 1.375);
    assert.equal(ev.unit, 'bb');
    assert.equal(ev.source, TRIVIA_SOLVER_EV_SOURCE);
    assert.equal(ev.aggregation, 'live_combo_class_mean');
    assert.equal(ev.provenance.authority, 'training_solver_provenance_authority');
    assert.equal(ev.provenance.catalog, 'training_solver_artifact_catalog');
    assert.equal(ev.provenance.source_artifact_checksum, 'd'.repeat(64));
    assert.deepEqual(sanitizeAuthoritativeTriviaSolverEv(ev), ev);
});

test('EV fails closed for retired authority, V1, non-BB or incomplete provenance', () => {
    assert.equal(createAuthoritativeTriviaSolverEv({
        row: authoritativeRow({ solver_provenance_active: false }),
        matrix: V2_BRIDGE,
        heroHand: 'AKs',
    }), null);
    assert.equal(createAuthoritativeTriviaSolverEv({
        row: authoritativeRow(),
        matrix: { source: 'legacy_v1', hand_evs: { AKs: 1.375 } },
        heroHand: 'AKs',
    }), null);
    assert.equal(createAuthoritativeTriviaSolverEv({
        row: authoritativeRow({ source_artifact_checksum: null }),
        matrix: V2_BRIDGE,
        heroHand: 'AKs',
    }), null);

    const valid = createAuthoritativeTriviaSolverEv({
        row: authoritativeRow(), matrix: V2_BRIDGE, heroHand: 'AKs',
    });
    assert.equal(sanitizeAuthoritativeTriviaSolverEv({ value: 1.375, unit: 'bb' }), null);
    assert.equal(sanitizeAuthoritativeTriviaSolverEv({ ...valid, unit: 'chips' }), null);
    assert.equal(sanitizeAuthoritativeTriviaSolverEv({
        ...valid,
        provenance: { ...valid.provenance, authority: 'client_claim' },
    }), null);
});

test('deterministic seeding and repair read the active catalog tuple and compare-and-swap metadata', () => {
    const source = read('scripts/trivia-deterministic-seed.js');
    const operator = read('scripts/lib/solver-operator-db.js');
    assert.match(source, /training_solver_artifact_catalog AS catalog/);
    assert.match(source, /training_solver_provenance_authority AS authority/);
    assert.match(source, /authority\.retired_at IS NULL/);
    assert.match(source, /quality_status = 'validated'/);
    assert.match(source, /createAuthoritativeTriviaSolverEv\(/);
    assert.match(source, /question\.solverEvData \? \{ ev_data: question\.solverEvData \} : \{\}/);
    assert.match(source, /--repair-ev/);
    assert.match(source, /invalid_readback/);
    assert.match(source, /serviceKey\.startsWith\('sb_secret_'\)/);
    assert.match(source, /headers\.Authorization = `Bearer \$\{serviceKey\}`/);
    assert.doesNotMatch(source, /'Authorization': `Bearer \$\{SERVICE_KEY\}`/);
    assert.match(source, /UPDATE public\.trivia_questions/);
    assert.match(source, /AND engine_metadata = \$2::jsonb/);
    assert.doesNotMatch(source, /EV metadata patch outcome unknown:[\s\S]{0,500}method: 'PATCH'/);
    assert.doesNotMatch(source, /heroHandEV:\s*pushFreq/);
    assert.match(operator, /SUPABASE_DB_CA_CERT/);
    assert.match(operator, /80:70:25:AD:50:D4:ED:21/);
    assert.match(operator, /X509Certificate/);
    assert.match(operator, /rejectUnauthorized:\s*true/);
    assert.doesNotMatch(operator, /rejectUnauthorized:\s*false/);
});

test('server and GTO booth retain the verified source instead of inferring EV units', () => {
    const policy = read('src/lib/trivia/strategyContextPolicy.mjs');
    const model = read('src/components/trivia/strategyExperienceModel.mjs');
    const booth = read('src/components/trivia/GTOScenarioDisplay.jsx');
    assert.match(policy, /sanitizeAuthoritativeTriviaSolverEv/);
    assert.doesNotMatch(policy, /evValue == null \? null : 'bb'/);
    assert.match(model, /Verified PioSOLVER V2/);
    assert.match(model, /Active Solver Catalog/);
    assert.match(booth, /EV Evidence/);
    assert.match(booth, /evAnalysis\?\.provenanceLabel/);
});
