/** Reuse the production build, with an isolated SSR provider and finite browser matrix. */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, rm, writeFile, access, stat, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createServer } from 'node:net';
import { statfs } from 'node:fs/promises';
const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const require = createRequire(import.meta.url);
const { createChannelCatalogFixture } = require('../../e2e/fixtures/videoLibraryChannelCatalog.cjs');
const workRoot = process.env.VIDEO_LIBRARY_BROWSER_WORK_ROOT || (process.env.CI ? process.env.RUNNER_TEMP : null);
if (!workRoot) throw new Error('Set VIDEO_LIBRARY_BROWSER_WORK_ROOT to your task-owned SSD scratch directory.');
if (process.platform === 'darwin') {
    const allowed = resolve('/Volumes/SmarterWork/agent-work');
    const selected = resolve(workRoot);
    if (!selected.startsWith(`${allowed}/`)) throw new Error('Mac browser work must use the task-owned external SSD.');
    const [external, externalDevice, internalDevice] = await Promise.all([statfs('/Volumes/SmarterWork'), stat('/Volumes/SmarterWork'), stat('/')]);
    if (externalDevice.dev === internalDevice.dev) throw new Error('External SSD is not independently mounted.');
    if (external.bavail <= 0) throw new Error('External SSD is full.');
}
await access(join(root, '.next/BUILD_ID'));
await mkdir(workRoot, { recursive: true });
const scratch = await mkdtemp(join(resolve(workRoot), 'personal-browser-'));
const evidence = resolve(process.env.VIDEO_LIBRARY_BROWSER_EVIDENCE || join(scratch, 'evidence'));
await mkdir(evidence, { recursive: true });
const fixture = createChannelCatalogFixture();
let next, browserProcess;
let aborted = false;
const stop = () => { aborted = true; if (next && next.exitCode === null) next.kill('SIGTERM'); if (browserProcess && browserProcess.exitCode === null) browserProcess.kill('SIGTERM'); };
process.once('SIGINT', stop); process.once('SIGTERM', stop);
async function releaseChild(child) {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    let deadline;
    await Promise.race([once(child, 'exit'), new Promise(resolveTimer => { deadline = setTimeout(() => { child.kill('SIGKILL'); resolveTimer(); }, 5000); })]);
    clearTimeout(deadline);
}
async function run(command, args, options = {}) {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', ...options });
    browserProcess = child;
    const [code, signal] = await once(child, 'exit');
    if (code !== 0) throw new Error(`Browser contract failed (${code ?? signal}).`);
}
try {
    fixture.listen(0, '127.0.0.1'); await once(fixture, 'listening');
    const fixtureUrl = `http://127.0.0.1:${fixture.address().port}`;
    const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
    const port = reservation.address().port;
    await new Promise((done, fail) => reservation.close(error => error ? fail(error) : done()));
    const environment = { ...process.env, SUPABASE_URL: fixtureUrl, NEXT_PUBLIC_SUPABASE_URL: fixtureUrl, SUPABASE_SERVICE_ROLE_KEY: 'local-fixture-only', TMPDIR: scratch };
    next = spawn(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(port)], { cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
    let serverLog = '';
    for (const stream of [next.stdout, next.stderr]) stream.on('data', value => { serverLog = (serverLog + value).slice(-100000); });
    const url = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 60000;
    let ready = false;
    while (Date.now() < deadline && !aborted && next.exitCode === null) {
        try { const response = await fetch(`${url}/api/video-library/channels`, { signal: AbortSignal.timeout(2000) }); const payload = await response.json(); if (response.ok && payload.channels?.[0]?.id === '11111111-1111-4111-8111-111111111111') { ready = true; break; } } catch { /* startup not ready */ }
        await new Promise(done => setTimeout(done, 200));
    }
    if (!ready) throw new Error(`Isolated channel server did not become ready.\n${serverLog}`);
    const launch = executablePath => executablePath ? { executablePath } : {};
    const config = join(scratch, 'channels.config.cjs');
    const settings = { testDir: join(root, 'e2e'), testMatch: ['023-video-library-personal.spec.ts','024-video-library-social-share.spec.ts','025-video-library-playlists.spec.ts'], fullyParallel: false, workers: 1, retries: 0, timeout: 30000, reporter: [['list'], ['json', { outputFile: join(evidence, 'browser-results.json') }]], outputDir: join(evidence, 'browser-artifacts'), use: { baseURL: url, serviceWorkers: 'block', storageState: { cookies: [], origins: [] } }, projects: [
        { name: 'chromium', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 }, launchOptions: launch(process.env.VIDEO_LIBRARY_CHROMIUM_EXECUTABLE) } },
        { name: 'mobile-chrome', use: { browserName: 'chromium', viewport: { width: 375, height: 844 }, isMobile: true, hasTouch: true, launchOptions: launch(process.env.VIDEO_LIBRARY_CHROMIUM_EXECUTABLE) } },
        { name: 'mobile-webkit', use: { browserName: 'webkit', viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, launchOptions: launch(process.env.VIDEO_LIBRARY_WEBKIT_EXECUTABLE) } },
    ] };
    await writeFile(config, `module.exports = ${JSON.stringify(settings, null, 2)};\n`);
    await run(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--config', config], { env: { ...environment, PLAYWRIGHT_HTML_OPEN: 'never' } });
    const results = JSON.parse(await readFile(join(evidence, 'browser-results.json'), 'utf8'));
    if (results.stats.expected !== 18 || results.stats.unexpected !== 0 || results.stats.skipped !== 0 || results.stats.flaky !== 0) throw new Error('The required eighteen personal-library browser cases did not all pass without skips.');
    await writeFile(join(evidence, 'qualification.json'), JSON.stringify({ status: 'passed', cases: 18, source: 'existing .next production build', fixture: 'isolated account, catalog and personal library contracts', projects: ['chromium1440', 'chromium375', 'webkit393'], observedAt: new Date().toISOString() }, null, 2));
} finally {
    await releaseChild(browserProcess);
    await releaseChild(next);
    if (fixture.listening) await new Promise(done => fixture.close(done));
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    await rm(scratch, { recursive: true, force: true });
}
