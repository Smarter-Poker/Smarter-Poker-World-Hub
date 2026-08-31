#!/usr/bin/env node

/**
 * Read-only, keyset-paginated audit of the solved_spots_gold warehouse.
 *
 * The table is roughly 80 GB, so the audit has two explicit layers:
 *   1. every-row inventory, grouped by family/stack/street; and
 *   2. exhaustive matrix validation for the 25 family/stack contracts used by
 *      the 107-game Training runtime (optionally restricted to one street).
 *
 * No RPCs or writes are used. Every database transaction is READ ONLY.
 *
 * Usage:
 *   node scripts/audit-solved-spots-warehouse.js --street=river
 *   node scripts/audit-solved-spots-warehouse.js --all-streets
 *   node scripts/audit-solved-spots-warehouse.js --street=river --validation=deep-local
 *   node scripts/audit-solved-spots-warehouse.js --street=river --page-size=250
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { Client } = require('pg');

const ROOT = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env.local'), quiet: true });
const RUNTIME_PATH = path.join(ROOT, 'src/services/PIOQueryService.js');
const VALID_CARD = /^[2-9TJQKA][cdhs]$/;
const STREET_BOARD_LENGTH = { flop: 3, turn: 4, river: 5 };

function arg(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function parseTrainingContracts() {
  const source = fs.readFileSync(RUNTIME_PATH, 'utf8');
  const start = source.indexOf('const configs = {');
  const end = source.indexOf('return configs[gameId]', start);
  if (start < 0 || end < 0) throw new Error('Unable to locate Training PioSOLVER configs.');
  const body = source.slice(start, end);
  const contracts = new Map();
  for (const match of body.matchAll(/'([^']+)':\s*\{([^{}]*)\}/g)) {
    const gameId = match[1];
    const config = match[2];
    if (!/sourceOfTruth:\s*'PioSOLVER'/.test(config)) continue;
    const family = config.match(/pioGameType:\s*'([^']+)'/)?.[1];
    const stack = Number(config.match(/pioStackDepth:\s*(\d+)/)?.[1]);
    const forcedStreet = config.match(/pioStreet:\s*'([^']+)'/)?.[1] || null;
    if (!family || !Number.isFinite(stack)) throw new Error(`Invalid PioSOLVER config for ${gameId}.`);
    const key = `${family}|${stack}`;
    if (!contracts.has(key)) contracts.set(key, {
      family,
      stack,
      games: [],
      preflopGames: [],
      forcedStreets: new Set(),
    });
    const contract = contracts.get(key);
    contract.games.push(gameId);
    if (forcedStreet === 'preflop') contract.preflopGames.push(gameId);
    if (forcedStreet) contract.forcedStreets.add(forcedStreet);
  }
  return [...contracts.values()].map((contract) => ({
    ...contract,
    forcedStreets: [...contract.forcedStreets].sort(),
    games: contract.games.sort(),
    preflopGames: contract.preflopGames.sort(),
  })).sort((a, b) => `${a.family}|${a.stack}`.localeCompare(`${b.family}|${b.stack}`));
}

function boardFromMatrix(matrix) {
  const board = matrix?.board;
  if (Array.isArray(board)) return board;
  if (typeof board === 'string') return board.match(/[2-9TJQKA][cdhs]/g) || [];
  return [];
}

function boardFromScenarioHash(scenarioHash) {
  const suffix = String(scenarioHash || '').match(/((?:[2-9TJQKA][cdhs])+)$/)?.[1] || '';
  return suffix.match(/[2-9TJQKA][cdhs]/g) || [];
}

function validateBoard(matrix, street, scenarioHash = '') {
  // The canonical legacy payload often omits `matrix.board`; Training derives
  // those cards from the hash. Audit the same source rather than falsely
  // rejecting otherwise well-labelled legacy rows for a non-runtime field.
  const matrixBoard = boardFromMatrix(matrix);
  const board = matrixBoard.length ? matrixBoard : boardFromScenarioHash(scenarioHash);
  const expected = STREET_BOARD_LENGTH[street];
  const normalized = board.map((card) => String(card));
  return {
    board,
    valid: Number.isInteger(expected)
      && normalized.length === expected
      && normalized.every((card) => VALID_CARD.test(card))
      && new Set(normalized).size === normalized.length,
  };
}

function validateScenarioHash(scenarioHash, street) {
  const hash = String(scenarioHash || '');
  const expectedCards = STREET_BOARD_LENGTH[street];
  const suffix = hash.match(/((?:[2-9TJQKA][cdhs])+)$/)?.[1] || '';
  const suffixCards = suffix.match(/[2-9TJQKA][cdhs]/g) || [];
  if (suffixCards.length !== expectedCards || new Set(suffixCards).size !== expectedCards) return false;
  if (street === 'flop') return !/(^|_)(turn|river)(_|$)/i.test(hash);
  return new RegExp(`(^|_)${street}(_|$)`, 'i').test(hash);
}

function validateLegacyMatrix(matrix) {
  const actions = Array.isArray(matrix?.actions) ? matrix.actions.map(String) : [];
  const frequencies = matrix?.frequencies;
  const handEvs = matrix?.hand_evs;
  if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)
    || actions.length < 2 || !frequencies || typeof frequencies !== 'object' || Array.isArray(frequencies)
    || !handEvs || typeof handEvs !== 'object' || Array.isArray(handEvs)) {
    return { structurallyValid: false, hands: 0, credibleHands: 0, corruptHands: 0, outOfRangeValues: 0 };
  }

  const hands = new Set();
  for (const action of actions) {
    const values = frequencies[action];
    if (!values || typeof values !== 'object' || Array.isArray(values)) continue;
    Object.keys(values).forEach((hand) => hands.add(hand));
  }

  let credibleHands = 0;
  let corruptHands = 0;
  let outOfRangeValues = 0;
  for (const hand of hands) {
    const values = [];
    let corrupt = false;
    for (const action of actions) {
      const value = frequencies[action]?.[hand];
      if (value === undefined) continue;
      if (!Number.isFinite(value) || value < 0 || value > 1.02) {
        corrupt = true;
        outOfRangeValues += 1;
      } else {
        values.push(Math.min(1, value));
      }
    }
    const sum = values.reduce((total, value) => total + value, 0);
    const max = values.length ? Math.max(...values) : 0;
    if (!Number.isFinite(handEvs[hand])) corrupt = true;
    const normalized = !corrupt && values.length > 0 && Math.abs(sum - 1) <= 0.05;
    const pure = !corrupt && max >= 0.98 && (sum - max) <= 0.02;
    if ((normalized || pure) && sum > 0) credibleHands += 1;
    else corruptHands += 1;
  }

  return {
    structurallyValid: true,
    hands: hands.size,
    credibleHands,
    corruptHands,
    outOfRangeValues,
  };
}

function validateV2Matrix(matrix) {
  const actions = Array.isArray(matrix?.actions)
    ? matrix.actions.map((action) => (typeof action === 'string' ? action : action?.code)).filter(Boolean)
    : [];
  const frequencies = matrix?.frequencies;
  const handEvs = matrix?.hand_evs_bb;
  if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)
    || actions.length < 2 || !frequencies || typeof frequencies !== 'object' || Array.isArray(frequencies)) {
    return { structurallyValid: false, combos: 0, credibleCombos: 0, corruptCombos: 0, outOfRangeValues: 0 };
  }
  if (actions.some((action) => !Array.isArray(frequencies[action]) || frequencies[action].length !== 1326)
    || !Array.isArray(handEvs) || handEvs.length !== 1326) {
    return { structurallyValid: false, combos: 1326, credibleCombos: 0, corruptCombos: 1326, outOfRangeValues: 0 };
  }

  let credibleCombos = 0;
  let corruptCombos = 0;
  let outOfRangeValues = 0;
  for (let index = 0; index < 1326; index += 1) {
    let sum = 0;
    let hasMass = false;
    let corrupt = false;
    for (const action of actions) {
      const value = frequencies[action][index];
      if (!Number.isFinite(value) || value < 0 || value > 1.02) {
        corrupt = true;
        outOfRangeValues += 1;
      } else {
        sum += Math.min(1, value);
        if (value > 0) hasMass = true;
      }
    }
    if (!hasMass) continue; // dead-card and out-of-range combos are expected
    if (!Number.isFinite(handEvs[index])) corrupt = true;
    if (!corrupt && Math.abs(sum - 1) <= 0.05) credibleCombos += 1;
    else corruptCombos += 1;
  }
  return { structurallyValid: true, combos: 1326, credibleCombos, corruptCombos, outOfRangeValues };
}

function emptyCell(contract, street) {
  return {
    family: contract.family,
    stack: contract.stack,
    street,
    games: contract.games,
    rows: 0,
    legacyRows: 0,
    v2Rows: 0,
    noMatrixRows: 0,
    invalidBoards: 0,
    invalidScenarioHashes: 0,
    structurallyInvalidMatrices: 0,
    rowsWithNoCredibleStrategy: 0,
    credibleUnits: 0,
    corruptUnits: 0,
    outOfRangeValues: 0,
    rowsWithOutOfRangeValues: 0,
    strictUsableRows: 0,
    salvageableRows: 0,
    trainingUsableRows: 0,
    replacementRequiredRows: 0,
    unusableReasonCounts: {
      invalidScenarioHash: 0,
      invalidBoard: 0,
      invalidMatrixShape: 0,
      noCredibleStrategy: 0,
      partialV2Row: 0,
    },
    unusableScenarioHashes: process.argv.includes('--include-unusable-hashes') ? [] : undefined,
    earliestCreatedAt: null,
    latestCreatedAt: null,
    earliestSolvedV2At: null,
    latestSolvedV2At: null,
  };
}

function minIso(current, value) {
  if (!value) return current;
  const iso = new Date(value).toISOString();
  return !current || iso < current ? iso : current;
}

function maxIso(current, value) {
  if (!value) return current;
  const iso = new Date(value).toISOString();
  return !current || iso > current ? iso : current;
}

function inspectRow(cell, row) {
  cell.rows += 1;
  cell.earliestCreatedAt = minIso(cell.earliestCreatedAt, row.created_at);
  cell.latestCreatedAt = maxIso(cell.latestCreatedAt, row.created_at);
  cell.earliestSolvedV2At = minIso(cell.earliestSolvedV2At, row.solved_v2_at);
  cell.latestSolvedV2At = maxIso(cell.latestSolvedV2At, row.solved_v2_at);
  const validScenarioHash = validateScenarioHash(row.scenario_hash, cell.street);
  if (!validScenarioHash) cell.invalidScenarioHashes += 1;

  const rawMatrix = row.strategy_matrix_v2 || row.strategy_matrix;
  const validBoard = validateBoard(rawMatrix, cell.street, row.scenario_hash).valid;
  if (!validBoard) cell.invalidBoards += 1;

  const result = row.strategy_matrix_v2 ? validateV2Matrix(row.strategy_matrix_v2) : validateLegacyMatrix(row.strategy_matrix);
  if (row.strategy_matrix_v2) cell.v2Rows += 1;
  else if (row.strategy_matrix) cell.legacyRows += 1;
  else cell.noMatrixRows += 1;
  if (!result.structurallyValid) cell.structurallyInvalidMatrices += 1;
  const credible = result.credibleCombos ?? result.credibleHands ?? 0;
  const corrupt = result.corruptCombos ?? result.corruptHands ?? 0;
  if (credible === 0) cell.rowsWithNoCredibleStrategy += 1;
  if (result.outOfRangeValues > 0) cell.rowsWithOutOfRangeValues += 1;
  const usable = validScenarioHash && validBoard && result.structurallyValid && credible > 0;
  const strict = usable && corrupt === 0 && result.outOfRangeValues === 0;
  const trainingUsable = usable && (!row.strategy_matrix_v2 || strict);
  if (usable) {
    cell.salvageableRows += 1;
    if (strict) cell.strictUsableRows += 1;
  }
  if (trainingUsable) {
    cell.trainingUsableRows += 1;
  } else {
    cell.replacementRequiredRows += 1;
    if (!validScenarioHash) cell.unusableReasonCounts.invalidScenarioHash += 1;
    if (!validBoard) cell.unusableReasonCounts.invalidBoard += 1;
    if (!result.structurallyValid) cell.unusableReasonCounts.invalidMatrixShape += 1;
    if (credible === 0) cell.unusableReasonCounts.noCredibleStrategy += 1;
    if (row.strategy_matrix_v2 && usable && !strict) cell.unusableReasonCounts.partialV2Row += 1;
    if (cell.unusableScenarioHashes) cell.unusableScenarioHashes.push(String(row.scenario_hash));
  }
  cell.credibleUnits += credible;
  cell.corruptUnits += corrupt;
  cell.outOfRangeValues += result.outOfRangeValues || 0;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function atomicJsonWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

function cellKey(contract, street) {
  return `${contract.family}|${contract.stack}|${street}`;
}

async function auditCellDeepStream(client, contract, street, cutoff, checkpoint, checkpointFile) {
  const key = cellKey(contract, street);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const projectRef = new URL(url).hostname.split('.')[0];
  const connection = `host=db.${projectRef}.supabase.co port=5432 dbname=postgres user=postgres sslmode=require connect_timeout=10`;
  const chunkSize = Number(arg('stream-chunk-size', '5000'));
  if (!Number.isInteger(chunkSize) || chunkSize < 100 || chunkSize > 10000) {
    throw new Error('stream-chunk-size must be 100..10000.');
  }
  const hashes = (await client.query({
    text: `
      SELECT scenario_hash
      FROM public.solved_spots_gold
      WHERE game_type = $1 AND stack_depth = $2 AND street = $3
        AND created_at <= $4
      ORDER BY scenario_hash
    `,
    values: [contract.family, contract.stack, street, cutoff],
  })).rows.map((row) => row.scenario_hash);
  const hashDigest = crypto.createHash('sha256').update(hashes.join('\n')).digest('hex');
  const resumable = checkpoint.currentCell?.key === key ? checkpoint.currentCell : null;
  if (resumable && (resumable.hashCount !== hashes.length || resumable.hashDigest !== hashDigest)) {
    throw new Error(`${key} fixed-cutoff hash set changed; refusing an unsafe resume.`);
  }
  const cell = resumable?.cell || emptyCell(contract, street);
  const resumeStart = resumable?.nextStart || 0;

  for (let start = resumeStart; start < hashes.length; start += chunkSize) {
    const lower = hashes[start];
    const upper = hashes[start + chunkSize] || null;
    const upperClause = upper ? `AND scenario_hash < ${sqlLiteral(upper)}` : '';
    const sql = `
      BEGIN TRANSACTION READ ONLY;
      COPY (
        SELECT json_build_object(
          'scenario_hash', scenario_hash,
          'street', street,
          'created_at', created_at,
          'solved_v2_at', solved_v2_at,
          'strategy_matrix', strategy_matrix,
          'strategy_matrix_v2', strategy_matrix_v2
        )::text
        FROM public.solved_spots_gold
        WHERE game_type = ${sqlLiteral(contract.family)}
          AND stack_depth = ${Number(contract.stack)}
          AND street = ${sqlLiteral(street)}
          AND created_at <= ${sqlLiteral(cutoff)}
          AND scenario_hash >= ${sqlLiteral(lower)}
          ${upperClause}
        ORDER BY scenario_hash
      ) TO STDOUT;
      COMMIT;
    `;
    const child = spawn('psql', [connection, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
      env: {
        ...process.env,
        PGPASSWORD: process.env.SUPABASE_DB_PASSWORD,
        PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=900000',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    let streamTimedOut = false;
    // PostgreSQL's statement_timeout does not always terminate a COPY that
    // has finished planning but is blocked while streaming a large JSON row.
    // Bound the child process too; the atomic checkpoint is advanced only
    // after a complete chunk, so killing this read-only child is resumable.
    const streamWatchdog = setTimeout(() => {
      streamTimedOut = true;
      child.kill('SIGTERM');
    }, 16 * 60 * 1000);
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-12000); });
    const closed = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code) => {
        clearTimeout(streamWatchdog);
        if (streamTimedOut) reject(new Error('psql stream timeout after 16 minutes'));
        else if (code === 0) resolve();
        else reject(new Error(`psql stream exited ${code}: ${stderr}`));
      });
    });
    const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    let streamed = 0;
    for await (const line of lines) {
      if (!line.trim()) continue;
      inspectRow(cell, JSON.parse(line));
      streamed += 1;
    }
    await closed;
    checkpoint.currentCell = {
      key,
      hashCount: hashes.length,
      hashDigest,
      nextStart: Math.min(start + chunkSize, hashes.length),
      cell,
    };
    atomicJsonWrite(checkpointFile, checkpoint);
    process.stderr.write(`${key}: ${cell.rows}/${hashes.length}\n`);
  }
  if (cell.rows !== hashes.length) {
    throw new Error(`${contract.family}|${contract.stack}|${street} streamed ${cell.rows}/${hashes.length} rows across all ranges.`);
  }
  return cell;
}

function databaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!url || !password) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_DB_PASSWORD are required.');
  const projectRef = new URL(url).hostname.split('.')[0];
  return {
    host: `db.${projectRef}.supabase.co`,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password,
    ssl: { rejectUnauthorized: false },
    application_name: 'training_solved_spots_read_only_audit',
  };
}

async function auditCell(client, contract, street, pageSize) {
  const cell = emptyCell(contract, street);
  let cursor = '';
  while (true) {
    const result = await client.query({
      text: `
        SELECT scenario_hash, street, created_at, solved_v2_at, strategy_matrix, strategy_matrix_v2
        FROM public.solved_spots_gold
        WHERE game_type = $1 AND stack_depth = $2 AND street = $3 AND scenario_hash > $4
        ORDER BY scenario_hash
        LIMIT $5
      `,
      values: [contract.family, contract.stack, street, cursor, pageSize],
    });
    for (const row of result.rows) inspectRow(cell, row);
    if (result.rows.length < pageSize) break;
    cursor = result.rows[result.rows.length - 1].scenario_hash;
  }
  return cell;
}

async function auditCellStrictSql(client, contract, street) {
  const cell = emptyCell(contract, street);
  const expectedBoardLength = STREET_BOARD_LENGTH[street];
  const result = await client.query({
    text: `
      WITH classified AS (
        SELECT scenario_hash, created_at, solved_v2_at, strategy_matrix, strategy_matrix_v2,
          CASE
            WHEN strategy_matrix_v2 IS NOT NULL THEN
              jsonb_path_exists(strategy_matrix_v2, '$.frequencies.*[*] ? (@ < 0 || @ > 1.02)')
            ELSE
              jsonb_path_exists(strategy_matrix, '$.frequencies.*.* ? (@ < 0 || @ > 1.02)')
          END AS has_out_of_range,
          CASE
            WHEN strategy_matrix_v2 IS NOT NULL THEN
              jsonb_typeof(strategy_matrix_v2) = 'object'
              AND jsonb_typeof(strategy_matrix_v2->'actions') = 'array'
              AND jsonb_array_length(strategy_matrix_v2->'actions') >= 2
              AND jsonb_typeof(strategy_matrix_v2->'frequencies') = 'object'
            ELSE
              jsonb_typeof(strategy_matrix) = 'object'
              AND jsonb_typeof(strategy_matrix->'actions') = 'array'
              AND jsonb_array_length(strategy_matrix->'actions') >= 2
              AND jsonb_typeof(strategy_matrix->'frequencies') = 'object'
              AND jsonb_typeof(strategy_matrix->'hand_evs') = 'object'
          END AS valid_matrix_shape,
          CASE
            WHEN jsonb_typeof(COALESCE(strategy_matrix_v2, strategy_matrix)->'board') = 'array' THEN
              jsonb_array_length(COALESCE(strategy_matrix_v2, strategy_matrix)->'board') = $4
              AND NOT EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(COALESCE(strategy_matrix_v2, strategy_matrix)->'board') card
                WHERE card !~ '^[2-9TJQKA][cdhs]$'
              )
              AND (
                SELECT count(DISTINCT card)
                FROM jsonb_array_elements_text(COALESCE(strategy_matrix_v2, strategy_matrix)->'board') card
              ) = $4
            WHEN jsonb_typeof(COALESCE(strategy_matrix_v2, strategy_matrix)->'board') = 'string' THEN
              (COALESCE(strategy_matrix_v2, strategy_matrix)->>'board') ~ ('^([2-9TJQKA][cdhs]){' || $4::text || '}$')
              AND (
                SELECT count(DISTINCT match[1])
                FROM regexp_matches(COALESCE(strategy_matrix_v2, strategy_matrix)->>'board', '([2-9TJQKA][cdhs])', 'g') match
              ) = $4
            ELSE false
          END AS valid_board
        FROM public.solved_spots_gold
        WHERE game_type = $1 AND stack_depth = $2 AND street = $3
      )
      SELECT
        count(*)::bigint AS rows,
        count(*) FILTER (WHERE strategy_matrix IS NOT NULL)::bigint AS legacy_rows,
        count(*) FILTER (WHERE strategy_matrix_v2 IS NOT NULL)::bigint AS v2_rows,
        count(*) FILTER (WHERE strategy_matrix IS NULL AND strategy_matrix_v2 IS NULL)::bigint AS no_matrix_rows,
        count(*) FILTER (WHERE NOT valid_board)::bigint AS invalid_boards,
        count(*) FILTER (WHERE position($3 in lower(scenario_hash)) = 0)::bigint AS invalid_scenario_hashes,
        count(*) FILTER (WHERE NOT valid_matrix_shape)::bigint AS structurally_invalid_matrices,
        count(*) FILTER (WHERE has_out_of_range)::bigint AS rows_with_out_of_range_values,
        count(*) FILTER (WHERE valid_board AND valid_matrix_shape AND NOT has_out_of_range)::bigint AS strict_usable_rows,
        min(created_at) AS earliest_created_at,
        max(created_at) AS latest_created_at,
        min(solved_v2_at) AS earliest_solved_v2_at,
        max(solved_v2_at) AS latest_solved_v2_at
      FROM classified
    `,
    values: [contract.family, contract.stack, street, expectedBoardLength],
  });
  const row = result.rows[0];
  cell.rows = Number(row.rows);
  cell.legacyRows = Number(row.legacy_rows);
  cell.v2Rows = Number(row.v2_rows);
  cell.noMatrixRows = Number(row.no_matrix_rows);
  cell.invalidBoards = Number(row.invalid_boards);
  cell.invalidScenarioHashes = Number(row.invalid_scenario_hashes);
  cell.structurallyInvalidMatrices = Number(row.structurally_invalid_matrices);
  cell.rowsWithOutOfRangeValues = Number(row.rows_with_out_of_range_values);
  cell.strictUsableRows = Number(row.strict_usable_rows);
  cell.earliestCreatedAt = minIso(null, row.earliest_created_at);
  cell.latestCreatedAt = maxIso(null, row.latest_created_at);
  cell.earliestSolvedV2At = minIso(null, row.earliest_solved_v2_at);
  cell.latestSolvedV2At = maxIso(null, row.latest_solved_v2_at);
  return cell;
}

async function main() {
  const requestedStreet = arg('street');
  const allStreets = process.argv.includes('--all-streets');
  if (!allStreets && !STREET_BOARD_LENGTH[requestedStreet]) {
    throw new Error('Supply --street=flop|turn|river or --all-streets.');
  }
  const pageSize = Number(arg('page-size', '250'));
  if (!Number.isInteger(pageSize) || pageSize < 25 || pageSize > 1000) throw new Error('page-size must be 25..1000.');
  const output = path.resolve(arg('output', path.join(ROOT, '.agent/audits/2026-08-31-training-solved-spots-warehouse-evidence.json')));
  const checkpointFile = `${output}.partial`;
  const contractFilter = arg('contract');
  const contracts = parseTrainingContracts().filter((contract) => (
    !contractFilter || `${contract.family}|${contract.stack}` === contractFilter
  ));
  if (contracts.length === 0) throw new Error(`No Training contract matched ${contractFilter}.`);
  const streets = allStreets ? ['flop', 'turn', 'river'] : [requestedStreet];
  const validation = arg('validation', 'deep-stream');
  if (!['strict-sql', 'deep-local', 'deep-stream'].includes(validation)) {
    throw new Error('validation must be strict-sql, deep-local, or deep-stream.');
  }
  const client = new Client(databaseConfig());
  // A long audit can be between parent-client queries while a bounded psql
  // child streams a chunk. Capture a transport loss so it becomes a normal
  // resumable failure instead of an uncaught EventEmitter crash.
  client.on('error', () => {});
  const startedAt = new Date().toISOString();
  const requestedCutoff = arg('cutoff');
  const resume = process.argv.includes('--resume');
  const existingCheckpoint = resume && fs.existsSync(checkpointFile)
    ? JSON.parse(fs.readFileSync(checkpointFile, 'utf8'))
    : null;
  const cutoff = existingCheckpoint?.cutoff || requestedCutoff || startedAt;
  if (existingCheckpoint && existingCheckpoint.validation !== validation) {
    throw new Error(`Checkpoint validation ${existingCheckpoint.validation} does not match ${validation}.`);
  }
  const checkpoint = existingCheckpoint || {
    schemaVersion: 1,
    readOnly: true,
    validation,
    cutoff,
    startedAt,
    completedCells: [],
    currentCell: null,
  };
  const cells = [...checkpoint.completedCells];

  await client.connect();
  try {
    await client.query('SET default_transaction_read_only = on');
    // The largest indexed Training cell contains ~61k TOASTed legacy river
    // matrices. Give that one bounded query enough time to inspect every JSON
    // value without turning this into an unbounded warehouse scan.
    await client.query("SET statement_timeout = '600s'");
    const inventoryResult = await client.query({ text: `
      SELECT street, game_type, stack_depth, count(*)::bigint AS rows,
             count(*) FILTER (WHERE strategy_matrix IS NOT NULL)::bigint AS legacy_rows,
             count(*) FILTER (WHERE strategy_matrix_v2 IS NOT NULL)::bigint AS v2_rows,
             count(*) FILTER (WHERE strategy_matrix IS NULL AND strategy_matrix_v2 IS NULL)::bigint AS no_matrix_rows
      FROM public.solved_spots_gold
      WHERE created_at <= $1
      GROUP BY street, game_type, stack_depth
      ORDER BY street, game_type, stack_depth
    `, values: [cutoff] });

    for (const contract of contracts) {
      for (const street of streets) {
        if (contract.preflopGames.length === contract.games.length) continue;
        const key = cellKey(contract, street);
        if (cells.some((cell) => cellKey(cell, cell.street) === key)) continue;
        const cell = validation === 'deep-local'
          ? await auditCell(client, contract, street, pageSize)
          : validation === 'deep-stream'
            ? await auditCellDeepStream(client, contract, street, cutoff, checkpoint, checkpointFile)
            : await auditCellStrictSql(client, contract, street);
        cells.push(cell);
        checkpoint.completedCells = cells;
        checkpoint.currentCell = null;
        atomicJsonWrite(checkpointFile, checkpoint);
        process.stderr.write(`${contract.family}|${contract.stack}|${street}: ${cell.rows} rows\n`);
      }
    }

    const numericInventory = inventoryResult.rows.map((row) => ({
      ...row,
      stack_depth: Number(row.stack_depth),
      rows: Number(row.rows),
      legacy_rows: Number(row.legacy_rows),
      v2_rows: Number(row.v2_rows),
      no_matrix_rows: Number(row.no_matrix_rows),
    }));
    const result = {
      schemaVersion: 1,
      readOnly: true,
      startedAt,
      completedAt: new Date().toISOString(),
      cutoff,
      consistencyModel: 'fixed created_at high-water mark with atomic per-chunk checkpoints',
      scope: allStreets ? 'all Training contract streets' : `Training ${requestedStreet} contracts`,
      validation,
      validationContract: {
        trainingUsableRowsMeaning: 'matrix and board validated only; exact runtime node state and export provenance are audited separately',
        doesNotCertifyRuntimeDecisionState: true,
        doesNotCertifySolverProvenance: true,
      },
      canonicalGames: 107,
      pioContracts: contracts.length,
      warehouseInventory: numericInventory,
      auditedCells: cells,
      totals: {
        warehouseRows: numericInventory.reduce((sum, row) => sum + row.rows, 0),
        warehouseRiverRows: numericInventory.filter((row) => row.street === 'river').reduce((sum, row) => sum + row.rows, 0),
        auditedRows: cells.reduce((sum, cell) => sum + cell.rows, 0),
        invalidBoards: cells.reduce((sum, cell) => sum + cell.invalidBoards, 0),
        structurallyInvalidMatrices: cells.reduce((sum, cell) => sum + cell.structurallyInvalidMatrices, 0),
        rowsWithNoCredibleStrategy: cells.reduce((sum, cell) => sum + cell.rowsWithNoCredibleStrategy, 0),
        credibleUnits: cells.reduce((sum, cell) => sum + cell.credibleUnits, 0),
        corruptUnits: cells.reduce((sum, cell) => sum + cell.corruptUnits, 0),
        outOfRangeValues: cells.reduce((sum, cell) => sum + cell.outOfRangeValues, 0),
        rowsWithOutOfRangeValues: cells.reduce((sum, cell) => sum + cell.rowsWithOutOfRangeValues, 0),
        strictUsableRows: cells.reduce((sum, cell) => sum + cell.strictUsableRows, 0),
        salvageableRows: cells.reduce((sum, cell) => sum + cell.salvageableRows, 0),
        trainingUsableRows: cells.reduce((sum, cell) => sum + (cell.trainingUsableRows ?? (
          cell.v2Rows > 0 ? cell.strictUsableRows : cell.salvageableRows
        )), 0),
        replacementRequiredRows: cells.reduce((sum, cell) => sum + (cell.replacementRequiredRows ?? (
          cell.rows - (cell.v2Rows > 0 ? cell.strictUsableRows : cell.salvageableRows)
        )), 0),
      },
    };
    atomicJsonWrite(output, result);
    fs.rmSync(checkpointFile, { force: true });
    console.log(JSON.stringify({ success: true, output, ...result.totals }, null, 2));
  } catch (error) {
    throw error;
  } finally {
    await client.end();
  }
}

async function runWithResumeRetries() {
  const transient = (error) => (
    ['57P01', '57P02', '57P03', 'ECONNRESET', 'ETIMEDOUT'].includes(error?.code)
    || /connection terminated|server closed the connection|timeout/i.test(error?.message || '')
  );
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      await main();
      return;
    } catch (error) {
      if (!transient(error) || attempt === 8) throw error;
      if (!process.argv.includes('--resume')) process.argv.push('--resume');
      process.stderr.write(`Transient database interruption; resuming checkpoint (attempt ${attempt + 1}/8).\n`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

if (require.main === module) {
  runWithResumeRetries().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  atomicJsonWrite,
  auditCellDeepStream,
  boardFromMatrix,
  boardFromScenarioHash,
  databaseConfig,
  emptyCell,
  inspectRow,
  parseTrainingContracts,
  validateBoard,
  validateScenarioHash,
  validateLegacyMatrix,
  validateV2Matrix,
};
