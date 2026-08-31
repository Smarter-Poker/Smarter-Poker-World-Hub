#!/usr/bin/env node

/**
 * Build the exact, read-only replacement ledger for Training solver data.
 *
 * This consumes the exhaustive per-street warehouse evidence, revalidates only
 * defective cells at each evidence file's immutable cutoff, and records every
 * existing scenario hash that Training must replace. Empty family/street cells
 * are represented explicitly; the script never invents poker inputs or writes
 * placeholder rows to solved_spots_gold.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');
const {
  atomicJsonWrite,
  auditCellDeepStream,
  databaseConfig,
  parseTrainingContracts,
} = require('./audit-solved-spots-warehouse.js');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_EVIDENCE = ['flop', 'turn', 'river'].map((street) => path.join(
  ROOT,
  `.agent/audits/2026-08-31-training-solved-spots-${street}-evidence.json`,
));

function arg(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function trainingUsableRows(cell) {
  if (Number.isInteger(cell.trainingUsableRows)) return cell.trainingUsableRows;
  if (cell.v2Rows > 0 && cell.legacyRows > 0) return Math.min(cell.strictUsableRows, cell.rows);
  return cell.v2Rows > 0 ? cell.strictUsableRows : cell.salvageableRows;
}

function digest(values) {
  return crypto.createHash('sha256').update(values.join('\n')).digest('hex');
}

async function main() {
  if (!process.argv.includes('--include-unusable-hashes')) {
    process.argv.push('--include-unusable-hashes');
  }
  const evidencePaths = (arg('evidence')?.split(',').filter(Boolean) || DEFAULT_EVIDENCE)
    .map((file) => path.resolve(file));
  const output = path.resolve(arg(
    'output',
    path.join(ROOT, '.agent/audits/2026-08-31-training-solver-replacement-manifest.json'),
  ));
  const checkpointFile = `${output}.partial`;
  const sources = evidencePaths.map((file) => {
    if (!fs.existsSync(file)) throw new Error(`Missing warehouse evidence: ${file}`);
    return { file, evidence: JSON.parse(fs.readFileSync(file, 'utf8')) };
  });
  const contracts = new Map(parseTrainingContracts().map((contract) => (
    [`${contract.family}|${contract.stack}`, contract]
  )));
  const targets = [];
  for (const source of sources) {
    for (const cell of source.evidence.auditedCells) {
      const usable = trainingUsableRows(cell);
      if (cell.rows === 0 || usable < cell.rows) {
        targets.push({
          sourceFile: path.relative(ROOT, source.file),
          sourceCutoff: source.evidence.cutoff,
          sourceTotals: {
            rows: cell.rows,
            trainingUsableRows: usable,
            replacementRequiredRows: Math.max(0, cell.rows - usable),
          },
          family: cell.family,
          stack: cell.stack,
          street: cell.street,
          games: cell.games,
        });
      }
    }
  }

  const resume = process.argv.includes('--resume') && fs.existsSync(checkpointFile)
    ? JSON.parse(fs.readFileSync(checkpointFile, 'utf8'))
    : { schemaVersion: 1, readOnly: true, completedCells: [], currentCell: null };
  const completed = [...resume.completedCells];
  const client = new Client(databaseConfig());
  client.on('error', () => {});
  await client.connect();
  try {
    await client.query('SET default_transaction_read_only = on');
    await client.query("SET statement_timeout = '600s'");
    for (const target of targets) {
      const key = `${target.family}|${target.stack}|${target.street}`;
      if (completed.some((cell) => cell.key === key)) continue;
      if (target.sourceTotals.rows === 0) {
        completed.push({
          ...target,
          key,
          disposition: 'missing_cell_requires_canonical_seed_inputs',
          replacementScenarioHashes: [],
          replacementScenarioHashCount: 0,
          replacementScenarioHashDigest: digest([]),
        });
      } else {
        const contract = contracts.get(`${target.family}|${target.stack}`);
        if (!contract) throw new Error(`Unknown Training contract ${target.family}|${target.stack}`);
        const cell = await auditCellDeepStream(
          client,
          contract,
          target.street,
          target.sourceCutoff,
          resume,
          checkpointFile,
        );
        const unusableRowHashes = cell.unusableScenarioHashes || [];
        if (unusableRowHashes.length !== cell.replacementRequiredRows) {
          throw new Error(`${key} defective row hash count ${unusableRowHashes.length} != ${cell.replacementRequiredRows}`);
        }
        // Historical reimports can create several defective rows for the same
        // scenario hash. A solver target is the unique decision, not each
        // duplicate database row. Preserve both counts so cleanup and solving
        // scopes remain explicit without assigning redundant work to M1/M2.
        const hashes = [...new Set(unusableRowHashes)].sort();
        completed.push({
          ...target,
          key,
          disposition: hashes.length ? 'replace_exact_existing_hashes' : 'reuse_validated_warehouse_rows',
          auditedTotals: {
            rows: cell.rows,
            legacyRows: cell.legacyRows,
            v2Rows: cell.v2Rows,
            strictUsableRows: cell.strictUsableRows,
            salvageableRows: cell.salvageableRows,
            trainingUsableRows: cell.trainingUsableRows,
            replacementRequiredRows: cell.replacementRequiredRows,
            duplicateDefectiveRows: cell.replacementRequiredRows - hashes.length,
            unusableReasonCounts: cell.unusableReasonCounts,
          },
          replacementScenarioHashes: hashes,
          replacementScenarioHashCount: hashes.length,
          replacementScenarioHashDigest: digest(hashes),
        });
      }
      resume.completedCells = completed;
      resume.currentCell = null;
      atomicJsonWrite(checkpointFile, resume);
    }
  } finally {
    await client.end();
  }

  const missingCells = completed.filter((cell) => cell.disposition === 'missing_cell_requires_canonical_seed_inputs');
  const exactReplacementCells = completed.filter((cell) => cell.disposition === 'replace_exact_existing_hashes');
  const result = {
    schemaVersion: 1,
    readOnly: true,
    generatedAt: new Date().toISOString(),
    sourceEvidence: sources.map(({ file, evidence }) => ({
      file: path.relative(ROOT, file),
      cutoff: evidence.cutoff,
      validation: evidence.validation,
      auditedRows: evidence.totals.auditedRows,
    })),
    contract: {
      canonicalGames: 107,
      pioFamilyStackContracts: contracts.size,
      noDatabaseWrites: true,
      noInventedSolverInputs: true,
      v2RowsRequireStrictWholeRowValidation: true,
      legacyRowsRequirePerHandFiniteEvAndSanitization: true,
      thisLedgerClassifiesMatrixDefectsOnly: true,
      runtimeStateAndProvenanceAreAuditedSeparately: true,
    },
    cells: completed.sort((a, b) => a.key.localeCompare(b.key)),
    totals: {
      targetCells: completed.length,
      missingCells: missingCells.length,
      exactReplacementCells: exactReplacementCells.length,
      exactReplacementScenarioHashes: exactReplacementCells.reduce(
        (sum, cell) => sum + cell.replacementScenarioHashCount,
        0,
      ),
      defectiveRows: exactReplacementCells.reduce(
        (sum, cell) => sum + cell.auditedTotals.replacementRequiredRows,
        0,
      ),
      duplicateDefectiveRows: exactReplacementCells.reduce(
        (sum, cell) => sum + cell.auditedTotals.duplicateDefectiveRows,
        0,
      ),
    },
    releaseGate: {
      solverReady: false,
      reason: 'Exact matrix-defect hashes are known, but existing rows are not provenance-sealed and canonical range, pot, effective-stack, rake, position, and ICM payout inputs must be approved before either solver host is retargeted.',
    },
  };
  atomicJsonWrite(output, result);
  fs.rmSync(checkpointFile, { force: true });
  console.log(JSON.stringify({ success: true, output, totals: result.totals }, null, 2));
}

async function runWithRetries() {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      await main();
      return;
    } catch (error) {
      const transient = ['57P01', '57P02', '57P03', 'ECONNRESET', 'ETIMEDOUT'].includes(error?.code)
        || /connection terminated|server closed the connection|timeout/i.test(error?.message || '');
      if (!transient || attempt === 8) throw error;
      if (!process.argv.includes('--resume')) process.argv.push('--resume');
      process.stderr.write(`Transient database interruption; resuming replacement ledger (attempt ${attempt + 1}/8).\n`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

runWithRetries().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
