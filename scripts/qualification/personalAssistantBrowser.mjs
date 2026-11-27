/** Finite local production-build qualification. Never accepts a live origin. */
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, rm, writeFile, stat, readFile, statfs } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const require = createRequire(import.meta.url);
const workRoot = process.env.PERSONAL_ASSISTANT_BROWSER_WORK_ROOT || (process.env.CI ? process.env.RUNNER_TEMP : null);
if (!workRoot) throw new Error('Set PERSONAL_ASSISTANT_BROWSER_WORK_ROOT to an owned scratch directory.');
if (process.platform === 'darwin') {
  const selected = resolve(workRoot);
  if (!selected.startsWith('/Volumes/')) throw new Error('Mac browser work must use the verified task-owned external SSD.');
  const [volume, device, internal] = await Promise.all([statfs(selected), stat(selected), stat('/')]);
  if (device.dev === internal.dev || volume.bavail <= 0) throw new Error('Selected external SSD is not mounted with available space.');
}
const buildId = (await readFile(join(root, '.next/BUILD_ID'), 'utf8')).trim();
const pages = JSON.parse(await readFile(join(root, '.next/server/pages-manifest.json'), 'utf8'));
for (const route of ['/hub/personal-assistant', '/hub/personal-assistant/review', '/hub/personal-assistant/sandbox', '/hub/personal-assistant/leaks']) {
  if (!pages[route]) throw new Error(`Production Build Is Missing ${route}`);
}
await mkdir(workRoot, { recursive: true });
const scratch = await mkdtemp(join(resolve(workRoot), 'pa-browser-runtime-'));
const evidence = process.env.PERSONAL_ASSISTANT_BROWSER_EVIDENCE
  ? resolve(process.env.PERSONAL_ASSISTANT_BROWSER_EVIDENCE)
  : await mkdtemp(join(resolve(workRoot), 'pa-browser-evidence-'));
await mkdir(evidence, { recursive: true });
let next;
let browser;
let serverLog = '';
let aborted = false;
const stop = () => {
  aborted = true;
  for (const child of [next, browser]) if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
async function releaseChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  let deadline;
  await Promise.race([
    once(child, 'exit'),
    new Promise(done => { deadline = setTimeout(() => { child.kill('SIGKILL'); done(); }, 5000); }),
  ]);
  clearTimeout(deadline);
}
try {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((done, fail) => reservation.close(error => error ? fail(error) : done()));
  // Runtime server clients cannot contact a production backend. Browser Auth,
  // REST and page APIs are independently isolated in the fixture before navigation.
  const environment = {
    ...process.env, TMPDIR: scratch,
    SUPABASE_URL: 'http://127.0.0.1:9', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9',
    SUPABASE_SERVICE_ROLE_KEY: 'local-fixture-only', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-fixture-only',
  };
  next = spawn(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const stream of [next.stdout, next.stderr]) stream.on('data', value => { serverLog = (serverLog + value).slice(-100000); });
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 45000;
  let ready = false;
  while (Date.now() < deadline && !aborted && next.exitCode === null) {
    try {
      const response = await fetch(`${url}/hub/personal-assistant`, { signal: AbortSignal.timeout(2000) });
      if (response.ok && (await response.text()).includes('Personal Assistant')) { ready = true; break; }
    } catch { /* finite readiness check while this owned child starts */ }
    await new Promise(done => setTimeout(done, 200));
  }
  if (!ready) throw new Error(`Local Production Server Did Not Become Ready.\n${serverLog}`);
  const chromiumArgs = process.env.PERSONAL_ASSISTANT_CHROMIUM_ARGS ? JSON.parse(process.env.PERSONAL_ASSISTANT_CHROMIUM_ARGS) : undefined;
  if (chromiumArgs && (!Array.isArray(chromiumArgs) || chromiumArgs.some(value => typeof value !== 'string'))) throw new Error('PERSONAL_ASSISTANT_CHROMIUM_ARGS must be a JSON array of launch arguments.');
  const launch = (executablePath, args) => ({ ...(executablePath ? { executablePath } : {}), ...(args ? { args } : {}) });
  const chromium = launch(process.env.PERSONAL_ASSISTANT_CHROMIUM_EXECUTABLE, chromiumArgs);
  const settings = {
    testDir: join(root, 'e2e'), testMatch: ['personal-assistant-completion.spec.ts'],
    fullyParallel: false, workers: 1, retries: 0, forbidOnly: true, timeout: 60000, globalTimeout: 600000,
    reporter: [['list'], ['json', { outputFile: join(evidence, 'browser-results.json') }]],
    outputDir: join(evidence, 'browser-artifacts'),
    use: { baseURL: url, serviceWorkers: 'block', reducedMotion: 'reduce', storageState: { cookies: [], origins: [] }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
    projects: [
      { name: 'pa-chromium1440', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 }, launchOptions: chromium } },
      { name: 'pa-mobile-chromium390', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, launchOptions: chromium } },
      { name: 'pa-mobile-webkit390', use: { browserName: 'webkit', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, launchOptions: launch(process.env.PERSONAL_ASSISTANT_WEBKIT_EXECUTABLE) } },
    ],
  };
  const config = join(scratch, 'personal-assistant.config.cjs');
  await writeFile(config, `module.exports = ${JSON.stringify(settings, null, 2)};\n`);
  browser = spawn(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--config', config], {
    cwd: root, stdio: 'inherit', env: { ...environment, PLAYWRIGHT_HTML_OPEN: 'never' },
  });
  const [code, signal] = await once(browser, 'exit');
  if (code !== 0) throw new Error(`Personal Assistant Browser Qualification Failed (${code ?? signal}).`);
  const results = JSON.parse(await readFile(join(evidence, 'browser-results.json'), 'utf8'));
  if (results.stats.expected !== 18 || results.stats.unexpected !== 0 || results.stats.skipped !== 0 || results.stats.flaky !== 0) {
    throw new Error('All Eighteen Personal Assistant Browser Cases Must Pass Without Retries Or Skips.');
  }
  await writeFile(join(evidence, 'qualification.json'), JSON.stringify({
    status: 'passed', cases: 18, buildId, source: 'existing local .next production build',
    sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    projects: settings.projects.map(project => project.name), observedAt: new Date().toISOString(),
    scope: 'Approved Landing, Six Internal Destinations, Summary Recovery, Actual Multiway Equity Worker, Complete Replay Restoration, Log A Hand To Reloaded Review And Unconfirmed Save Failure',
    fixture: 'Loopback-only synthetic account and API responses. No production authentication, persistence or authorization claim.',
  }, null, 2));
  process.stdout.write(`Personal Assistant Browser Evidence: ${evidence}\n`);
} finally {
  await releaseChild(browser);
  await releaseChild(next);
  await writeFile(join(evidence, 'server.log'), serverLog);
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
  await rm(scratch, { recursive: true, force: true });
}
