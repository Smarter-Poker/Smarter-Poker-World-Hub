import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const liveness = readFileSync(path.join(root, 'scripts/ci/check-cron-liveness.mjs'), 'utf8');
const workflow = readFileSync(path.join(root, '.github/workflows/supabase-invariants.yml'), 'utf8');

test('U4.3 counts only explicit completed successes', () => {
  assert.match(liveness, /status=eq\.success/);
  assert.doesNotMatch(liveness, /successes:\s*runs\s*-\s*errors/);
  assert.match(liveness, /killed, null, and unknown statuses are not completed work/);
});

test('script execution telemetry regression runs as a blocking U4.3 precheck', () => {
  const unitStep = workflow.indexOf('Test Open Claw script execution telemetry');
  const livenessStep = workflow.indexOf('Check every scheduled cron has succeeded at least once');
  assert.ok(unitStep >= 0 && livenessStep > unitStep);
  assert.match(workflow.slice(unitStep, livenessStep), /python3 scripts\/ci\/test-openclaw-script-logging\.py/);
  assert.match(workflow.slice(unitStep, livenessStep), /node --test __tests__\/openclaw-script-execution-log\.test\.mjs/);
  assert.doesNotMatch(workflow.slice(unitStep, livenessStep), /continue-on-error:\s*true/);
});

test('dispatcher outcome tests exercise success, failure, timeout, retry and telemetry outage', () => {
  const result = spawnSync(
    process.env.PYTHON_BIN || 'python3',
    ['scripts/ci/test-openclaw-script-logging.py'],
    { cwd: root, encoding: 'utf8', env: process.env }
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /Ran 6 tests/);
});

test('U4.3 does not treat running rows as successful work', async (t) => {
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const job = (url.searchParams.get('job_name') || '').replace(/^eq\./, '');
    const isSuccessQuery = url.searchParams.get('status') === 'eq.success';
    let count = 0;
    if (job === '/cron/video-library-scraper') count = isSuccessQuery ? 1 : 4;
    if (job === '/cron/video-library-reels') count = isSuccessQuery ? 0 : 3;
    response.writeHead(206, { 'content-range': `0-0/${count}` });
    response.end();
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const base = `http://127.0.0.1:${server.address().port}`;
  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['scripts/ci/check-cron-liveness.mjs', '--warn-only', '--json', '--days=7'],
      {
        cwd: root,
        env: {
          ...process.env,
          NEXT_PUBLIC_SUPABASE_URL: base,
          SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-role-key',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
  });

  assert.equal(result.code, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.ok(report.healthy.some((job) => job.job === '/cron/video-library-scraper' && job.successes === 1 && job.runs === 4));
  assert.ok(report.dead.some((job) => job.job === '/cron/video-library-reels' && job.successes === 0 && job.runs === 3));
});
