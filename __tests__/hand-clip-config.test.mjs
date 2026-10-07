// The Phase 9 wiring (design section 7.2, the Config paragraph, and contract
// C7's dispatcher entry): the Vercel cron fires every two minutes, the route
// traces the packed Chromium, puppeteer-core and the linux-x64 binaries in
// while every other route keeps its excludes, the dependency is pinned exact,
// and the dispatcher carries the hourly workers route beside Phase 7.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const vercel = JSON.parse(read('vercel.json'));
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const nextConfig = read('next.config.js');
const dispatcher = read('scripts/openclaw-cron-dispatcher.py');
const requireFromRepo = createRequire(path.join(REPO, 'package.json'));

const assignmentBlock = (name, open = '{', close = '}') => {
  const escapedOpen = open.replace(/[[{]/g, '\\$&');
  const escapedClose = close.replace(/[\]}]/g, '\\$&');
  const match = dispatcher.match(new RegExp(`\\n${name} = ${escapedOpen}([\\s\\S]*?)\\n${escapedClose}`));
  assert.ok(match, `${name} must remain a literal registry`);
  return match[1];
};

test('vercel.json fires /api/cron/render-hand-clips every two minutes and the handler exists with maxDuration 300', () => {
  const entries = vercel.crons.filter((c) => c.path === '/api/cron/render-hand-clips');
  assert.deepEqual(entries, [{ path: '/api/cron/render-hand-clips', schedule: '*/2 * * * *' }]);
  assert.ok(existsSync(path.join(REPO, 'pages/api/cron/render-hand-clips.js')));
  assert.match(read('pages/api/cron/render-hand-clips.js'), /export const config = \{\s*maxDuration: 300,?\s*\};/);
  // Every other cron entry is untouched (the renderer is appended, nothing replaced).
  assert.ok(vercel.crons.some((c) => c.path === '/api/cron/vip-lapse' && c.schedule === '0 * * * *'));
});

test('next.config.js marks the browser packages external and traces them into the render route only', () => {
  const externals = nextConfig.slice(nextConfig.indexOf('serverExternalPackages: ['), nextConfig.indexOf('outputFileTracingExcludes:'));
  for (const name of ["'@sparticuz/chromium'", "'puppeteer-core'", "'@ffmpeg-installer/linux-x64'", "'@ffprobe-installer/linux-x64'"]) {
    assert.ok(externals.includes(name), `serverExternalPackages carries ${name}`);
  }
  const includes = nextConfig.slice(nextConfig.indexOf('outputFileTracingIncludes: {'), nextConfig.indexOf('experimental: {'));
  assert.match(includes, /'pages\/api\/cron\/render-hand-clips': \[\s*'node_modules\/@sparticuz\/chromium\/\*\*\/\*',\s*'node_modules\/puppeteer-core\/\*\*\/\*',\s*'node_modules\/@ffmpeg-installer\/linux-x64\/\*\*\/\*',\s*'node_modules\/@ffprobe-installer\/linux-x64\/\*\*\/\*',\s*\/\/[^\n]*\n\s*'fonts\/hand-clip\/\*\*\/\*',\s*\]/);
  // The transport glyph font rides with the route: the subset, its licence and its provenance note.
  assert.ok(existsSync(path.join(REPO, 'fonts/hand-clip/NotoSansSymbols2-HandClip.ttf')), 'the glyph font is in the repo');
  assert.ok(existsSync(path.join(REPO, 'fonts/hand-clip/OFL.txt')), 'its licence travels with it');
  assert.match(read('fonts/hand-clip/README.md'), /Noto Sans Symbols 2[\s\S]*pyftsubset[\s\S]*U\+2300-23FF/);
  assert.match(includes, /'pages\/api\/cron\/transcode-videos': \[\s*'node_modules\/@ffmpeg-installer\/linux-x64\/\*\*\/\*',\s*'node_modules\/@ffprobe-installer\/linux-x64\/\*\*\/\*',\s*\]/, 'the transcode include is unchanged');
  const excludes = nextConfig.slice(nextConfig.indexOf('outputFileTracingExcludes: {'), nextConfig.indexOf('outputFileTracingIncludes: {'));
  // Next applies outputFileTracingExcludes AFTER outputFileTracingIncludes, so a
  // '*' exclude of puppeteer-core or @puppeteer/* would strip the driver from the
  // render route (the first live render failed with Cannot find module puppeteer-core).
  assert.ok(!excludes.includes("'node_modules/puppeteer-core/**'"), "puppeteer-core must not be excluded for every route");
  assert.ok(!excludes.includes("'node_modules/@puppeteer/**'"), "@puppeteer/browsers must not be excluded for every route");
  assert.ok(excludes.includes("'node_modules/puppeteer/**'"));
  assert.ok(!excludes.includes('sparticuz'), 'no exclude strips the packed Chromium');
  const starExcludes = [...excludes.matchAll(/'node_modules\/[^']+'/g)].map((m) => m[0]);
  assert.ok(starExcludes.every((e) => !/@sparticuz|chromium/.test(e)), 'no exclude glob reaches @sparticuz/chromium');
});

test('@sparticuz/chromium is pinned at exactly 153.0.0 in package.json and the lockfile, and both packages resolve', () => {
  assert.equal(pkg.dependencies['@sparticuz/chromium'], '153.0.0');
  assert.equal(lock.packages['node_modules/@sparticuz/chromium'].version, '153.0.0');
  assert.equal(lock.packages[''].dependencies['@sparticuz/chromium'], '153.0.0');
  assert.ok(pkg.dependencies.puppeteer || pkg.devDependencies?.puppeteer, 'puppeteer (and with it puppeteer-core) is already a dependency');
  // Resolve only: executablePath() inflates 200 MB of Chromium into /tmp
  // wherever it runs (it does not refuse on macOS), so no test calls it.
  assert.ok(requireFromRepo.resolve('@sparticuz/chromium').includes('node_modules/@sparticuz/chromium/'));
  assert.ok(requireFromRepo.resolve('puppeteer-core').includes('node_modules/puppeteer-core/'));
  const chromiumPkg = JSON.parse(read('node_modules/@sparticuz/chromium/package.json'));
  assert.equal(chromiumPkg.version, '153.0.0');
  assert.match(chromiumPkg.engines.node, /24/);
});

test('the build scripts never delete or refuse the packed Chromium', () => {
  const prune = read('scripts/prune-platform-bins.sh');
  const rmTargets = [...prune.matchAll(/rm -rf? "?([^"\s]+)/g)].map((m) => m[1]);
  assert.ok(rmTargets.length > 0);
  for (const target of rmTargets) {
    assert.match(target, /@ffmpeg-installer|@ffprobe-installer|\$f/, `prune only touches ffmpeg and ffprobe trees: ${target}`);
  }
  assert.match(prune, /find node_modules\/@ffmpeg-installer/);
  assert.doesNotMatch(prune, /sparticuz|puppeteer/);
  const check = read('scripts/check-node-modules.sh');
  assert.doesNotMatch(check, /sparticuz|puppeteer-core/);
  assert.match(check, /PUPPETEER_SKIP_DOWNLOAD=1/, 'the repair install still skips the puppeteer browser download');
});

test('the dispatcher carries the Phase 9 workers route hourly at :25 with a 300 s timeout (contract C7)', () => {
  assert.match(assignmentBlock('ALL_CRONS', '[', ']'), /\('\/api\/cron\/phase9-content',\s*dict\(minute=25\)\)/);
  assert.match(assignmentBlock('WORKERS_PREFERRED'), /'\/api\/cron\/phase9-content':\s+'\/cron\/phase9-content'/);
  assert.match(assignmentBlock('JOB_TIMEOUTS'), /'\/api\/cron\/phase9-content':\s+300/);
  assert.doesNotMatch(assignmentBlock('CRITICAL_JOBS'), /phase9-content/);
  assert.doesNotMatch(assignmentBlock('SCRIPT_JOBS'), /phase9-content/);
  // Beside the Phase 7 lines, which stay as they were.
  assert.match(assignmentBlock('ALL_CRONS', '[', ']'), /\('\/api\/cron\/phase7-content',\s*dict\(minute=40\)\)/);
  assert.match(assignmentBlock('WORKERS_PREFERRED'), /'\/api\/cron\/phase7-content':\s+'\/cron\/phase7-content'/);
  // The render cron is Vercel's, never the dispatcher's.
  for (const [name, open, close] of [['ALL_CRONS', '[', ']'], ['WORKERS_PREFERRED', '{', '}'], ['JOB_TIMEOUTS', '{', '}']]) {
    assert.doesNotMatch(assignmentBlock(name, open, close).replace(/#.*$/gm, ''), /render-hand-clips/, `${name} never schedules the Vercel cron`);
  }
});

test('nothing in the new source carries an em dash, an en dash or an emoji', () => {
  for (const rel of ['pages/api/cron/render-hand-clips.js', 'src/lib/server/handClipRender.js']) {
    const text = read(rel);
    for (const codePoint of [String.fromCharCode(0x2013), String.fromCharCode(0x2014)]) {
      assert.ok(!text.includes(codePoint), `${rel} must not contain U+${codePoint.codePointAt(0).toString(16)}`);
    }
    assert.doesNotMatch(text, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, `${rel}: no emoji`);
  }
});
