#!/usr/bin/env node

/**
 * Convert the exhaustive per-street matrix audits into the stricter runtime
 * readiness contract used by Training.
 *
 * A row can contain a salvageable strategy matrix and still be unsafe for a
 * specific question when its exact node pot, actor, positions, subject, or
 * export provenance is missing. This audit deliberately keeps those two
 * meanings separate. It is read-only and does not contact or mutate Supabase.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { atomicJsonWrite } = require('./audit-solved-spots-warehouse.js');

const ROOT = path.resolve(__dirname, '..');
const STREETS = ['flop', 'turn', 'river'];

function arg(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
}

function digest(relative) {
  return crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(ROOT, relative)))
    .digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  const evidenceFiles = Object.fromEntries(STREETS.map((street) => [
    street,
    `.agent/audits/2026-08-31-training-solved-spots-${street}-evidence.json`,
  ]));
  const cacheFile = '.agent/audits/2026-08-31-training-cache-provenance.json';
  const writerFile = '.agent/audits/2026-08-31-training-solver-writer-provenance.json';
  const replacementFile = '.agent/audits/2026-08-31-training-solver-replacement-manifest.json';
  const migrationFile = 'supabase/migrations/20260831141500_training_solver_provenance.sql';
  const engineFile = 'src/engines/DeterministicGTOEngine.js';
  const bridgeFile = 'src/utils/v2Matrix.js';

  const streetEvidence = Object.fromEntries(STREETS.map((street) => [street, readJson(evidenceFiles[street])]));
  const cache = readJson(cacheFile);
  const writer = readJson(writerFile);
  const replacement = readJson(replacementFile);
  const migration = fs.readFileSync(path.join(ROOT, migrationFile), 'utf8');
  const engine = fs.readFileSync(path.join(ROOT, engineFile), 'utf8');
  const bridge = fs.readFileSync(path.join(ROOT, bridgeFile), 'utf8');

  for (const street of STREETS) {
    const evidence = streetEvidence[street];
    assert(evidence.readOnly === true, `${street} audit is not read-only evidence`);
    assert(evidence.validation === 'deep-stream', `${street} audit did not exhaustively deep-stream matrices`);
    assert(evidence.canonicalGames === 107, `${street} audit does not cover the 107-game catalog`);
    assert(evidence.pioContracts === 25, `${street} audit does not cover all 25 solver contracts`);
    assert(
      evidence.totals.auditedRows === evidence.totals.trainingUsableRows + evidence.totals.replacementRequiredRows,
      `${street} matrix classifications do not reconcile`,
    );
  }

  assert(cache.warehouseProvenanceColumnsPresent === false, 'Snapshot unexpectedly claims warehouse provenance columns already existed');
  assert(cache.totals.provenanceCompleteV2Rows === 0, 'Snapshot unexpectedly contains provenance-complete cached v2 rows');
  assert(replacement.releaseGate?.solverReady === false, 'Replacement manifest must remain fail-closed');
  assert(/create trigger solved_spots_gold_require_provenance/i.test(migration), 'Migration does not install the provenance write gate');
  assert(/quality_status is distinct from 'validated'/i.test(migration), 'Migration does not require validated exports');
  assert(/strategyMatrix\.node_state_exact !== true/.test(engine), 'Runtime does not require exact node state');
  assert(/strategyMatrix\.node_actor !== expectedActor/.test(engine), 'Runtime does not require the correct node actor');
  assert(/deriveNodePotState\(v2\.node/.test(bridge), 'v2 bridge does not replay the exact node pot');

  const byStreet = Object.fromEntries(STREETS.map((street) => {
    const totals = streetEvidence[street].totals;
    return [street, {
      auditedRows: totals.auditedRows,
      matrixValidatedRows: totals.trainingUsableRows,
      matrixReplacementRequiredRows: totals.replacementRequiredRows,
      runtimeServeableAtSnapshot: 0,
      runtimeBlocker: 'No warehouse row could carry the complete provenance seal because the required columns did not exist at this snapshot.',
    }];
  }));
  const auditedRows = STREETS.reduce((sum, street) => sum + byStreet[street].auditedRows, 0);
  const matrixValidatedRows = STREETS.reduce((sum, street) => sum + byStreet[street].matrixValidatedRows, 0);
  const matrixReplacementRequiredRows = STREETS.reduce(
    (sum, street) => sum + byStreet[street].matrixReplacementRequiredRows,
    0,
  );
  assert(matrixReplacementRequiredRows === replacement.totals.defectiveRows, 'Matrix defects do not match replacement ledger');

  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    readOnly: true,
    scope: 'Every solved_spots_gold row matching the 25 family/stack contracts used by the 107-game Training catalog on flop, turn, and river.',
    definitions: {
      matrixValidatedRows: 'Rows whose board and strategy payload passed the exhaustive matrix/EV audit. This does not prove the row describes the exact runtime decision.',
      runtimeServeableRows: 'Rows that also have exact subject, stack, street, node path, current pot, facing amount, actor, positions, and a validated machine/artifact provenance seal.',
    },
    sourceEvidence: [
      ...STREETS.map((street) => ({ file: evidenceFiles[street], sha256: digest(evidenceFiles[street]) })),
      { file: cacheFile, sha256: digest(cacheFile) },
      { file: writerFile, sha256: digest(writerFile) },
      { file: replacementFile, sha256: digest(replacementFile) },
    ],
    totals: {
      auditedRows,
      matrixValidatedRows,
      matrixReplacementRequiredRows,
      exactReplacementScenarioHashes: replacement.totals.exactReplacementScenarioHashes,
      duplicateDefectiveRows: replacement.totals.duplicateDefectiveRows,
      runtimeServeableAtSnapshot: 0,
      provenanceCompleteV2CacheRowsAtSnapshot: cache.totals.provenanceCompleteV2Rows,
      unknownLegacyWriterInsertsSinceStatsReset: Number(writer.tableStats?.n_tup_ins || 0),
    },
    byStreet,
    riverReuseVerdict: {
      existingTrainingContractRows: byStreet.river.auditedRows,
      matrixValidatedRows: byStreet.river.matrixValidatedRows,
      matrixReplacementRequiredRows: byStreet.river.matrixReplacementRequiredRows,
      runtimeServeableAtSnapshot: 0,
      conclusion: 'The existing river corpus is real and mostly matrix-salvageable, but none of it may be advertised as an exact Training decision until exact state and provenance are sealed. New river solves must target only the missing/defective canonical decisions after reusable rows are reconstructed and certified.',
    },
    runtimeGate: {
      exactStateFields: ['family', 'stack', 'street', 'subject', 'node', 'node_current_pot', 'facing_amount', 'actor', 'hero_position', 'oop_player', 'ip_player'],
      provenanceFields: ['solver_version', 'solver_binary_checksum', 'machine_id', 'pipeline_commit', 'manifest_version', 'manifest_checksum', 'source_artifact_checksum', 'quality_status', 'audited_at'],
      legacyFrequencyOnlyFallbackAllowed: false,
      crossFamilyStackStreetFallbackAllowed: false,
      migrationAddsFailClosedWriterGate: true,
      historicalRowsRemainUnverified: true,
    },
    releaseGate: {
      solverHostsReady: false,
      trainingRuntimeFailClosed: true,
      reasons: [
        'M1 is scanning an exhausted manifest and M2 is in a revoked-credential retry loop.',
        'The exact replacement ledger still contains missing cells and defective scenario hashes.',
        'Existing rows lack the provenance seal required to attribute and certify their solver artifacts.',
        'Canonical ranges, pot/stack/rake/position inputs, and ICM payout state remain required before controlled retargeting.',
      ],
    },
  };

  const output = path.resolve(arg(
    'output',
    path.join(ROOT, '.agent/audits/2026-08-31-training-solver-runtime-readiness.json'),
  ));
  atomicJsonWrite(output, result);
  console.log(JSON.stringify({ success: true, output, totals: result.totals, riverReuseVerdict: result.riverReuseVerdict }, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

module.exports = { main };
