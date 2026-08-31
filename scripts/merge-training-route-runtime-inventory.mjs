import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const DEFAULT_OUTPUT = resolve(ROOT, '.agent/audits/2026-08-31-training-phase-2-runtime.json');

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const outputArgument = option('--output', DEFAULT_OUTPUT);
const inputArguments = [];
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === '--output') {
    index += 1;
    continue;
  }
  if (argument.startsWith('--')) throw new Error(`Unknown option: ${argument}`);
  inputArguments.push(argument);
}

if (!inputArguments.length) {
  throw new Error('Provide one or more runtime inventory part files.');
}

const reports = inputArguments.map((input) => JSON.parse(readFileSync(resolve(ROOT, input), 'utf8')));
const baseline = reports[0];
const resultMap = new Map();

for (const report of reports) {
  if (report.schemaVersion !== baseline.schemaVersion) throw new Error('Runtime report schema versions differ.');
  if (report.baseUrl !== baseline.baseUrl) throw new Error('Runtime report base URLs differ.');
  for (const result of report.results) {
    const key = `${result.viewport}:${result.path}`;
    if (resultMap.has(key)) throw new Error(`Duplicate runtime result: ${key}`);
    resultMap.set(key, {
      ...result,
      screenshot: result.screenshot ? relative(ROOT, result.screenshot) : null,
    });
  }
}

const results = [...resultMap.values()].sort((a, b) => (
  `${a.viewport}:${a.path}`.localeCompare(`${b.viewport}:${b.path}`)
));
const expectedPaths = baseline.scope.allUniquePaths;
const expectedViewports = baseline.scope.viewports;
const expectedJobs = expectedPaths * expectedViewports.length;

if (results.length !== expectedJobs) {
  throw new Error(`Incomplete runtime matrix: expected ${expectedJobs} jobs, received ${results.length}.`);
}

const pathCounts = new Map();
for (const result of results) {
  pathCounts.set(result.path, (pathCounts.get(result.path) || 0) + 1);
}
if (pathCounts.size !== expectedPaths) {
  throw new Error(`Incomplete runtime route set: expected ${expectedPaths} paths, received ${pathCounts.size}.`);
}
for (const [path, count] of pathCounts) {
  if (count !== expectedViewports.length) throw new Error(`Incomplete viewport coverage for ${path}: ${count}.`);
}

const failed = results.filter((result) => !result.passed);
const report = {
  schemaVersion: baseline.schemaVersion,
  generatedBy: 'scripts/merge-training-route-runtime-inventory.mjs',
  baseUrl: baseline.baseUrl,
  generatedAt: new Date().toISOString(),
  frozenInvariants: baseline.frozenInvariants,
  batches: reports.map((sourceReport) => ({
    offset: sourceReport.scope.offset,
    uniquePaths: sourceReport.scope.uniquePaths,
    jobs: sourceReport.scope.jobs,
    passed: sourceReport.summary.passed,
    failed: sourceReport.summary.failed,
  })),
  scope: {
    routeTemplates: baseline.scope.routeTemplates,
    canonicalGames: baseline.scope.canonicalGames,
    uniquePaths: expectedPaths,
    viewports: expectedViewports,
    jobs: results.length,
  },
  summary: {
    passed: results.length - failed.length,
    failed: failed.length,
    scanlineElements: results.reduce((sum, result) => sum + (result.metrics?.scanlines || 0), 0),
    overflowFailures: results.filter((result) => (result.metrics?.horizontalOverflowPx || 0) > 2).length,
    brokenImages: results.reduce((sum, result) => sum + (result.metrics?.brokenImages.length || 0), 0),
    pageErrors: results.reduce((sum, result) => sum + result.pageErrors.length, 0),
    consoleErrors: results.reduce((sum, result) => sum + result.consoleErrors.length, 0),
  },
  failures: failed.map(({ path, viewport, failureReasons }) => ({ path, viewport, failureReasons })),
  results,
};

const output = resolve(ROOT, outputArgument);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ output, scope: report.scope, summary: report.summary }, null, 2)}\n`);
if (failed.length) process.exitCode = 1;
