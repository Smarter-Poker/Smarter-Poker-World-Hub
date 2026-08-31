#!/usr/bin/env node

/**
 * Fail-closed audit for the Training runtime, deterministic cache reseeder,
 * and (when --live is supplied) the two-machine PioSOLVER farm.
 *
 * Static mode never needs credentials and is safe in CI:
 *   node scripts/training-solver-contract-audit.js
 *
 * Live mode reads the normal Supabase environment and never writes:
 *   node scripts/training-solver-contract-audit.js --live
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const RUNTIME_PATH = path.join(ROOT, 'src/services/PIOQueryService.js');
const RESEED_PATH = path.join(ROOT, 'scripts/reseed-deterministic-cache.js');

function objectBody(source, openingMarker, closingMarker) {
  const start = source.indexOf(openingMarker);
  if (start < 0) throw new Error(`Missing opening marker: ${openingMarker}`);
  const end = source.indexOf(closingMarker, start);
  if (end < 0) throw new Error(`Missing closing marker: ${closingMarker}`);
  return source.slice(start, end);
}

function value(body, key) {
  const quoted = body.match(new RegExp(`${key}:\\s*'([^']+)'`));
  if (quoted) return quoted[1];
  const numeric = body.match(new RegExp(`${key}:\\s*(\\d+)`));
  if (numeric) return Number(numeric[1]);
  const list = body.match(new RegExp(`${key}:\\s*\\[([^\\]]*)\\]`));
  if (list) return [...list[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  return null;
}

function parseConfigs(source, openingMarker, closingMarker) {
  const body = objectBody(source, openingMarker, closingMarker);
  const configs = new Map();
  for (const match of body.matchAll(/'([^']+)':\s*\{([^{}]*)\}/g)) {
    const configBody = match[2];
    configs.set(match[1], {
      sourceOfTruth: value(configBody, 'sourceOfTruth'),
      pioGameType: value(configBody, 'pioGameType'),
      pioStackDepth: value(configBody, 'pioStackDepth'),
      pioStreet: value(configBody, 'pioStreet'),
      pioSpotTypes: value(configBody, 'pioSpotTypes'),
    });
  }
  return configs;
}

function comparable(config) {
  return JSON.stringify(config);
}

function contractKey(config) {
  return `${config.pioGameType}|${config.pioStackDepth}`;
}

function staticAudit() {
  const runtimeSource = fs.readFileSync(RUNTIME_PATH, 'utf8');
  const reseedSource = fs.readFileSync(RESEED_PATH, 'utf8');
  const runtime = parseConfigs(runtimeSource, 'const configs = {', 'return configs[gameId]');
  const reseed = parseConfigs(reseedSource, 'const GAME_CONFIGS = {', '// ─── QUESTION GENERATORS');
  const failures = [];

  if (runtime.size !== 107) failures.push(`Runtime config covers ${runtime.size}/107 games.`);
  if (reseed.size !== 107) failures.push(`Reseeder config covers ${reseed.size}/107 games.`);

  for (const [gameId, config] of runtime) {
    const reseedConfig = reseed.get(gameId);
    if (!reseedConfig) {
      failures.push(`${gameId} is absent from the reseeder.`);
    } else if (comparable(config) !== comparable(reseedConfig)) {
      failures.push(`${gameId} runtime/reseeder contract differs.`);
    }
  }

  const counts = { PioSOLVER: 0, ICMIZER: 0, SCENARIO: 0 };
  for (const config of runtime.values()) counts[config.sourceOfTruth] = (counts[config.sourceOfTruth] || 0) + 1;
  if (counts.PioSOLVER !== 84 || counts.ICMIZER !== 2 || counts.SCENARIO !== 21) {
    failures.push(`Unexpected engine split: ${JSON.stringify(counts)}.`);
  }

  const pioConfigs = [...runtime.entries()].filter(([, config]) => config.sourceOfTruth === 'PioSOLVER');
  const familyContracts = new Map();
  for (const [gameId, config] of pioConfigs) {
    const key = contractKey(config);
    if (!familyContracts.has(key)) familyContracts.set(key, []);
    familyContracts.get(key).push(gameId);
  }

  const requiredSourceMarkers = [
    "const street = config.pioStreet || getStreetForLevel(level);",
    'const sm = toTrainingMatrix(scenario) || {};',
    'return sanitizeLegacyMatrix(structuredClone(scenario.strategy_matrix));',
    'enforceTrainingQuestionContract(rawQuestion)',
    'const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];',
  ];
  for (const marker of requiredSourceMarkers) {
    if (!reseedSource.includes(marker)) failures.push(`Reseeder is missing safety marker: ${marker}`);
  }
  const forbiddenFallbacks = [
    'try without stack depth constraint',
    'use turn data',
    'Final fallback: try postflop_complete',
  ];
  for (const marker of forbiddenFallbacks) {
    if (reseedSource.includes(marker)) failures.push(`Reseeder still contains semantic fallback: ${marker}`);
  }

  return {
    success: failures.length === 0,
    failures,
    totals: {
      games: runtime.size,
      pioGames: counts.PioSOLVER,
      chartGames: counts.ICMIZER,
      scenarioGames: counts.SCENARIO,
      pioFamilyStackContracts: familyContracts.size,
      preflopGames: pioConfigs.filter(([, config]) => config.pioStreet === 'preflop').length,
      forcedRiverGames: pioConfigs.filter(([, config]) => config.pioStreet === 'river').length,
    },
    familyContracts: Object.fromEntries([...familyContracts].sort()),
  };
}

async function liveAudit(staticResult) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !serviceKey) throw new Error('Live audit requires a Supabase URL and SUPABASE_SERVICE_ROLE_KEY.');
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const get = async (route) => {
    const response = await fetch(`${baseUrl}/rest/v1/${route}`, { headers });
    if (!response.ok) throw new Error(`${route}: HTTP ${response.status} ${await response.text()}`);
    return response.json();
  };

  const [statuses, manifestRows] = await Promise.all([
    get('solver_status?select=machine_id,phase,board,spots_done,rows_written,bad,note,updated_at&order=machine_id.asc'),
    get('solver_manifest?id=eq.phases&select=json,updated_at'),
  ]);
  const manifest = typeof manifestRows[0].json === 'string'
    ? JSON.parse(manifestRows[0].json)
    : manifestRows[0].json;
  const manifestContracts = new Set(manifest.phases.map((phase) => `${phase.game_type}|${phase.stack}`));
  const missingContracts = Object.entries(staticResult.familyContracts)
    .filter(([key]) => !manifestContracts.has(key))
    .map(([key, games]) => ({ key, games }));
  const streets = {};
  for (const phase of manifest.phases) {
    for (const street of phase.streets || ['flop']) streets[street] = (streets[street] || 0) + 1;
  }

  return {
    checkedAt: new Date().toISOString(),
    readOnly: true,
    statuses,
    manifest: {
      updatedAt: manifestRows[0].updated_at,
      phases: manifest.phases.length,
      familyStackContracts: manifestContracts.size,
      streets,
      trainingContractsCovered: Object.keys(staticResult.familyContracts).filter((key) => manifestContracts.has(key)).length,
      trainingContractsMissing: missingContracts.length,
      trainingGamesOutsideManifest: missingContracts.reduce((sum, item) => sum + item.games.length, 0),
      missingContracts,
    },
  };
}

async function main() {
  const result = staticAudit();
  if (process.argv.includes('--live')) result.live = await liveAudit(result);
  console.log(JSON.stringify(result, null, 2));
  if (!result.success) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
