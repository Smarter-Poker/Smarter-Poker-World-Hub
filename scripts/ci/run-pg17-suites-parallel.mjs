#!/usr/bin/env node
/**
 * scripts/ci/run-pg17-suites-parallel.mjs
 *
 * Bounded parallel runner for the disposable PostgreSQL 17 qualification suites
 * inside `Pre-Deploy Safety Checks` (.github/workflows/build-safety-gate.yml).
 *
 * Guarantees:
 *   1. Deterministic bounded concurrency (default 4, configurable via
 *      `--concurrency <N>` or `PG17_PARALLEL_CONCURRENCY`, bounded to 1..16).
 *   2. Per-suite isolated scratch directories (`TMPDIR`, `TEMP`, `TMP`, and
 *      `RUNNER_TEMP`) under a short batch root so PostgreSQL Unix socket paths
 *      stay well below the 107-byte platform limit while preventing temp-dir
 *      collisions across concurrent suites.
 *   3. Full stdout/stderr capture per suite (never interleaved mid-line) plus
 *      exact exit-code/signal reporting and non-zero exit if ANY suite fails.
 *   4. Zero dropped suites, zero skipped assertions, and full preservation of
 *      workspace artifacts (e.g., `artifacts/owner-operational-notification/`).
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');

export const DEFAULT_CONCURRENCY = 4;
export const MIN_CONCURRENCY = 1;
export const MAX_CONCURRENCY = 16;

export function parseConcurrency(rawValue, fallback = DEFAULT_CONCURRENCY) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return fallback;
  }
  const str = String(rawValue).trim();
  if (!/^\d+$/.test(str)) {
    throw new Error(`Invalid concurrency "${rawValue}": expected an integer between ${MIN_CONCURRENCY} and ${MAX_CONCURRENCY}`);
  }
  const parsed = Number.parseInt(str, 10);
  if (!Number.isInteger(parsed) || parsed < MIN_CONCURRENCY || parsed > MAX_CONCURRENCY) {
    throw new Error(`Concurrency ${parsed} out of bounds (${MIN_CONCURRENCY}..${MAX_CONCURRENCY})`);
  }
  return parsed;
}

export function parseSuiteManifest(rawYaml) {
  const parsed = yaml.load(rawYaml);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('PG17 suite manifest must be a non-empty YAML list of suites');
  }
  const seenNames = new Set();
  return parsed.map((entry, idx) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Suite entry #${idx + 1} must be an object with "name" and "run"`);
    }
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    const run = typeof entry.run === 'string' ? entry.run.trim() : '';
    if (!name) throw new Error(`Suite entry #${idx + 1} is missing a non-empty "name"`);
    if (!run) throw new Error(`Suite "${name}" is missing a non-empty "run" command`);
    if (seenNames.has(name)) {
      throw new Error(`Duplicate suite name in PG17 manifest: "${name}"`);
    }
    seenNames.add(name);

    const env = {};
    if (entry.env !== undefined) {
      if (!entry.env || typeof entry.env !== 'object' || Array.isArray(entry.env)) {
        throw new Error(`Suite "${name}" has invalid "env" (expected key/value mapping)`);
      }
      for (const [k, v] of Object.entries(entry.env)) {
        if (v !== undefined && v !== null) {
          env[k] = String(v);
        }
      }
    }
    return { name, run, env };
  });
}

export function extractSuitesFromWorkflow(workflowText) {
  const startMarker = "<<'PG17_SUITES'";
  const startIdx = workflowText.indexOf(startMarker);
  if (startIdx === -1) {
    throw new Error('Could not locate PG17_SUITES heredoc in workflow');
  }
  const afterStart = workflowText.indexOf('\n', startIdx);
  if (afterStart === -1) {
    throw new Error('Malformed PG17_SUITES heredoc start in workflow');
  }
  const tail = workflowText.slice(afterStart + 1);
  const endMatch = tail.match(/\n([ \t]*)PG17_SUITES\r?(?:\n|$)/);
  if (!endMatch || endMatch.index === undefined) {
    throw new Error('Could not locate closing PG17_SUITES delimiter in workflow');
  }
  const indent = endMatch[1];
  const rawBlock = tail.slice(0, endMatch.index);
  const dedented = rawBlock
    .split('\n')
    .map((line) => (indent && line.startsWith(indent) ? line.slice(indent.length) : line))
    .join('\n');
  return parseSuiteManifest(dedented);
}

export function buildSuiteEnv(baseEnv, suiteEnvOverrides, suiteTmpDir) {
  const merged = {
    ...baseEnv,
    TMPDIR: suiteTmpDir,
    TEMP: suiteTmpDir,
    TMP: suiteTmpDir,
    RUNNER_TEMP: suiteTmpDir,
  };
  const sharedTempRoots = new Set(
    [baseEnv.RUNNER_TEMP, baseEnv.TMPDIR, baseEnv.TEMP, baseEnv.TMP]
      .filter((v) => typeof v === 'string' && v.length > 0)
      .map((v) => path.resolve(v)),
  );
  for (const [key, value] of Object.entries(suiteEnvOverrides || {})) {
    // If a suite explicitly passed TMPDIR/RUNNER_TEMP pointing at the shared
    // runner temp root, keep it isolated to this suite's private subdirectory.
    if (
      (key === 'TMPDIR' || key === 'TEMP' || key === 'TMP' || key === 'RUNNER_TEMP') &&
      sharedTempRoots.has(path.resolve(value))
    ) {
      merged[key] = suiteTmpDir;
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function runSingleSuite(suite, { cwd, env, shell = 'bash' }) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const stdoutChunks = [];
    const stderrChunks = [];

    const child = spawn(shell, ['--noprofile', '--norc', '-eo', 'pipefail', '-c', suite.run], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));

    let settled = false;
    const finish = ({ exitCode, signal, spawnError }) => {
      if (settled) return;
      settled = true;
      resolve({
        name: suite.name,
        ok: exitCode === 0 && !signal && !spawnError,
        exitCode,
        signal: signal || null,
        spawnError: spawnError ? String(spawnError.message || spawnError) : null,
        durationMs: Date.now() - startedAt,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
      });
    };

    child.on('error', (err) => finish({ exitCode: 1, signal: null, spawnError: err }));
    child.on('close', (code, signal) => finish({ exitCode: code ?? 1, signal, spawnError: null }));
  });
}

export async function runSuitesParallel(
  suites,
  {
    concurrency = DEFAULT_CONCURRENCY,
    cwd = process.cwd(),
    baseEnv = process.env,
    tempParent = baseEnv.RUNNER_TEMP || baseEnv.TMPDIR || os.tmpdir(),
    onSuiteComplete = null,
    runner = runSingleSuite,
  } = {},
) {
  const limit = parseConcurrency(concurrency);
  if (!Array.isArray(suites) || suites.length === 0) {
    throw new Error('runSuitesParallel requires a non-empty list of suites');
  }

  fs.mkdirSync(tempParent, { recursive: true });
  const batchRoot = fs.mkdtempSync(path.join(tempParent, 'pg17-'));
  const results = new Array(suites.length);
  const startedAt = Date.now();
  let nextIndex = 0;
  let active = 0;
  let maxObservedConcurrency = 0;

  try {
    const worker = async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= suites.length) return;
        const suite = suites[index];
        // Short numeric subdir keeps PostgreSQL Unix socket paths well under 107 bytes.
        const suiteTmpDir = path.join(batchRoot, String(index + 1).padStart(2, '0'));
        fs.mkdirSync(suiteTmpDir, { recursive: true });
        const env = buildSuiteEnv(baseEnv, suite.env, suiteTmpDir);

        active += 1;
        if (active > maxObservedConcurrency) maxObservedConcurrency = active;
        let result;
        try {
          result = await runner(suite, { cwd, env, index, suiteTmpDir });
        } finally {
          active -= 1;
        }
        results[index] = result;
        if (typeof onSuiteComplete === 'function') {
          onSuiteComplete(result, index, suites.length);
        }
      }
    };

    const workerCount = Math.min(limit, suites.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  } finally {
    fs.rmSync(batchRoot, { recursive: true, force: true });
  }

  const wallMs = Date.now() - startedAt;
  const passed = results.filter((r) => r && r.ok);
  const failed = results.filter((r) => !r || !r.ok);
  const sumDurationMs = results.reduce((sum, r) => sum + (r?.durationMs || 0), 0);

  return {
    ok: failed.length === 0,
    concurrency: limit,
    maxObservedConcurrency,
    totalCount: suites.length,
    passedCount: passed.length,
    failedCount: failed.length,
    wallMs,
    sumDurationMs,
    results,
  };
}

function parseCliArgs(argv) {
  const opts = {
    concurrency: process.env.PG17_PARALLEL_CONCURRENCY,
    manifestPath: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--concurrency' && argv[i + 1]) {
      opts.concurrency = argv[++i];
    } else if (arg === '--manifest' && argv[i + 1]) {
      opts.manifestPath = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/ci/run-pg17-suites-parallel.mjs [--concurrency N] [--manifest path] < suites.yml');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

function writeGithubStepSummary(summary) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  const wallSec = (summary.wallMs / 1000).toFixed(1);
  const sumSec = (summary.sumDurationMs / 1000).toFixed(1);
  const speedup = summary.wallMs > 0 ? (summary.sumDurationMs / summary.wallMs).toFixed(2) : '1.00';
  const lines = [
    '## PostgreSQL 17 Parallel Qualification Summary',
    '',
    `- Suites: **${summary.passedCount}/${summary.totalCount} passed** (${summary.failedCount} failed)`,
    `- Concurrency: **${summary.concurrency}** (peak active: ${summary.maxObservedConcurrency})`,
    `- Wall time: **${wallSec}s** (cumulative suite time: ${sumSec}s, **${speedup}x** speedup)`,
    '',
  ];
  if (summary.failedCount > 0) {
    lines.push('### Failed Suites', '');
    for (const r of summary.results.filter((item) => !item.ok)) {
      lines.push(`- \`${r.name}\` (exit=${r.exitCode}${r.signal ? `, signal=${r.signal}` : ''}, ${(r.durationMs / 1000).toFixed(1)}s)`);
    }
    lines.push('');
  }
  fs.appendFileSync(summaryPath, lines.join('\n') + '\n', 'utf8');
}

async function main() {
  let opts;
  try {
    opts = parseCliArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[pg17-parallel] ${err.message}`);
    process.exit(2);
  }

  let concurrency;
  try {
    concurrency = parseConcurrency(opts.concurrency);
  } catch (err) {
    console.error(`[pg17-parallel] ${err.message}`);
    process.exit(2);
  }

  const rawManifest = opts.manifestPath
    ? fs.readFileSync(path.resolve(opts.manifestPath), 'utf8')
    : fs.readFileSync(0, 'utf8');

  let suites;
  try {
    suites = parseSuiteManifest(rawManifest);
  } catch (err) {
    console.error(`[pg17-parallel] Manifest error: ${err.message}`);
    process.exit(2);
  }

  const isGhActions = process.env.GITHUB_ACTIONS === 'true';
  console.log(`[pg17-parallel] Starting ${suites.length} PostgreSQL 17 suite(s) with concurrency=${concurrency}...`);

  const summary = await runSuitesParallel(suites, {
    concurrency,
    onSuiteComplete: (result, _idx, total) => {
      const secs = (result.durationMs / 1000).toFixed(1);
      const status = result.ok ? 'PASS' : `FAIL (exit=${result.exitCode}${result.signal ? `, signal=${result.signal}` : ''})`;
      if (isGhActions && result.ok) {
        console.log(`::group::[pg17-parallel] ${status} (${secs}s) ${result.name}`);
        if (result.stdout.trim()) process.stdout.write(result.stdout.endsWith('\n') ? result.stdout : `${result.stdout}\n`);
        if (result.stderr.trim()) process.stderr.write(result.stderr.endsWith('\n') ? result.stderr : `${result.stderr}\n`);
        console.log('::endgroup::');
      } else if (result.ok) {
        console.log(`[pg17-parallel] ${status} (${secs}s) [${total}] ${result.name}`);
      } else {
        console.error(`[pg17-parallel] ${status} (${secs}s) ${result.name}`);
        if (result.spawnError) console.error(`  spawn error: ${result.spawnError}`);
        if (result.stdout.trim()) {
          console.error(`--- stdout (${result.name}) ---`);
          process.stderr.write(result.stdout.endsWith('\n') ? result.stdout : `${result.stdout}\n`);
        }
        if (result.stderr.trim()) {
          console.error(`--- stderr (${result.name}) ---`);
          process.stderr.write(result.stderr.endsWith('\n') ? result.stderr : `${result.stderr}\n`);
        }
      }
    },
  });

  writeGithubStepSummary(summary);

  const wallSec = (summary.wallMs / 1000).toFixed(1);
  const sumSec = (summary.sumDurationMs / 1000).toFixed(1);
  const speedup = summary.wallMs > 0 ? (summary.sumDurationMs / summary.wallMs).toFixed(2) : '1.00';

  if (!summary.ok) {
    console.error(
      `[pg17-parallel] FAILED: ${summary.failedCount}/${summary.totalCount} PostgreSQL 17 suite(s) failed ` +
        `(wall=${wallSec}s, cumulative=${sumSec}s, speedup=${speedup}x):`,
    );
    for (const r of summary.results.filter((item) => !item.ok)) {
      console.error(`  - ${r.name} (exit=${r.exitCode}${r.signal ? `, signal=${r.signal}` : ''}, ${(r.durationMs / 1000).toFixed(1)}s)`);
    }
    process.exit(1);
  }

  console.log(
    `[pg17-parallel] OK: ${summary.passedCount}/${summary.totalCount} PostgreSQL 17 suite(s) passed ` +
      `(concurrency=${summary.concurrency}, wall=${wallSec}s, cumulative=${sumSec}s, speedup=${speedup}x).`,
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error('[pg17-parallel] Unexpected error:', err);
    process.exit(1);
  });
}
