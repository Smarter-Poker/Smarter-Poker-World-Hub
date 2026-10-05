import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const readCodeTree = relative => fs.readdirSync(path.join(ROOT, relative), { recursive: true })
  .filter(file => /\.(?:js|jsx)$/.test(file))
  .map(file => read(path.join(relative, file)))
  .join('\n');
const operatorRoutes = [
  'pages/horses/index.js',
  'pages/horses/hand-reviews.js',
  'pages/horses/hg-moderation.js',
  'pages/horses/sql-console.js',
  'pages/admin/index.js',
  'pages/admin/auth-health.js',
  'pages/admin/newsletter.js',
  'pages/admin/push-health.js',
  'pages/admin/signup-health.js',
  'pages/admin/trivia-pool.js',
  'pages/admin/venue-integrity.js',
  'pages/admin/wallet-align.js',
  'pages/hub/admin/index.js',
  'pages/hub/admin/autofix.js',
  'pages/hub/admin/diamond-liability.js',
  'pages/hub/admin/video-editorial.js',
  'pages/hub/admin/video-native-studio.js',
  'pages/hub/admin/video-operations.js',
  'pages/hub/admin/video-rights-moderation.js',
  'pages/hub/admin/video-sources.js',
];

test('every operator route family is wrapped by the Club Arena console shell', () => {
  const app = read('pages/_app.js');
  const routes = read('src/components/admin/operatorConsoleRoutes.js');

  assert.match(app, /isOperatorConsoleRoute\(resolvedPath\)/);
  assert.match(app, /<OperatorConsoleShell>/);
  assert.match(routes, /pathname === '\/horses'/);
  assert.match(routes, /pathname\.startsWith\('\/horses\/'\)/);
  assert.match(routes, /pathname\.startsWith\('\/admin\/'\)/);
  assert.match(routes, /pathname\.startsWith\('\/hub\/admin\/'\)/);
  for (const route of operatorRoutes) assert.equal(fs.existsSync(path.join(ROOT, route)), true, `${route} must exist`);
});

test('operator route roots resolve to maintained command surfaces', () => {
  assert.match(read('pages/admin/index.js'), /destination:\s*'\/admin\/auth-health'/);
  assert.match(read('pages/hub/admin/index.js'), /destination:\s*'\/hub\/admin\/video-operations'/);
});

test('the operator frame is dimensional, responsive, and reduced-motion safe', () => {
  const shell = read('src/components/admin/OperatorConsoleShell.jsx');
  const css = read('src/components/admin/OperatorConsoleShell.module.css');

  assert.match(shell, /data-admin-console="club-arena"/);
  assert.match(shell, /name="robots" content="noindex,nofollow"/);
  assert.match(shell, /Operator Workspace/);
  assert.doesNotMatch(shell, /Secure Operator Channel/);
  assert.match(shell, /className=\{styles\.frameRail\}/);
  assert.match(shell, /kind="shield"/);
  assert.match(css, /repeating-linear-gradient/);
  assert.match(css, /box-shadow:\s*inset/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.identityRail \{[\s\S]*?font-size:\s*12px/);
  assert.doesNotMatch(css, /font-size:\s*(?:9|10|11)px/);
});

test('video operation filters expose state and the run ledger has a mobile composition', () => {
  const sources = read('pages/hub/admin/video-sources.js');
  const editorial = read('pages/hub/admin/video-editorial.js');

  assert.match(sources, /aria-pressed=\{topic === value\}/);
  assert.match(editorial, /aria-pressed=\{state===s\}/);
  assert.match(sources, /@media\(max-width:600px\)\{\.run\{/);
  assert.match(sources, /grid-template-areas:"dot source time" "\. status status" "\. counts counts"/);
});

test('shared operator chrome and newly governed route surfaces avoid retired symbol icons', () => {
  const governedSources = [
    read('src/components/admin/OperatorConsoleShell.jsx'),
    read('pages/admin/index.js'),
    read('pages/hub/admin/index.js'),
    read('pages/hub/admin/video-sources.js'),
    read('pages/hub/admin/video-editorial.js'),
    read('pages/admin/auth-health.js'),
    read('pages/admin/signup-health.js'),
    read('pages/admin/push-health.js'),
    read('pages/admin/trivia-pool.js'),
    read('pages/hub/admin/diamond-liability.js'),
  ].join('\n');

  assert.doesNotMatch(governedSources, /[↻✓✗◆]/u);
});

test('health, trivia, and diamond admin surfaces share the machined mobile system', () => {
  const css = read('src/components/admin/OperatorAdminSurface.module.css');
  const governedRoutes = [
    'pages/admin/auth-health.js',
    'pages/admin/signup-health.js',
    'pages/admin/push-health.js',
    'pages/admin/trivia-pool.js',
    'pages/hub/admin/diamond-liability.js',
  ].map(read);

  for (const source of governedRoutes) {
    assert.match(source, /OperatorAdminSurface\.module\.css/);
    assert.match(source, /consoleStyles\.surface/);
    assert.match(source, /role="(?:status|alert)"/);
  }

  assert.match(css, /\.panel \{[\s\S]*?repeating-linear-gradient/);
  assert.match(css, /\.metric \{[\s\S]*?linear-gradient/);
  assert.match(css, /\.tableWell \{[\s\S]*?overflow-x:\s*auto/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) !important/);
  assert.match(read('pages/admin/trivia-pool.js'), /aria-label="Trivia Questions By Category"/);
  assert.match(read('pages/hub/admin/diamond-liability.js'), /aria-label="Top Diamond Earners"/);
});

test('governed admin status text is readable and route metadata cannot weaken nofollow', () => {
  const governedSources = [
    read('pages/admin/auth-health.js'),
    read('pages/admin/signup-health.js'),
    read('pages/admin/push-health.js'),
    read('pages/admin/trivia-pool.js'),
    read('pages/hub/admin/diamond-liability.js'),
  ].join('\n');
  const auth = read('pages/admin/auth-health.js');
  const signup = read('pages/admin/signup-health.js');
  const push = read('pages/admin/push-health.js');

  assert.doesNotMatch(governedSources, /fontSize:\s*(?:9|10|11)(?:\D|$)/);
  assert.match(auth, /color = '#166534'/);
  assert.match(auth, /color = '#713f12'/);
  assert.match(auth, /color = '#991b1b'/);
  assert.match(signup, /ok: '#166534'/);
  assert.match(signup, /failed: '#991b1b'/);
  assert.doesNotMatch(push, /name="robots"/);
});

test('admin surfaces use the custom operator glyph system instead of stock icon kits or emoji', () => {
  const sources = [
    readCodeTree('pages/admin'),
    readCodeTree('pages/hub/admin'),
    readCodeTree('pages/horses'),
    readCodeTree('src/components/admin'),
    readCodeTree('src/components/horses'),
  ].join('\n');

  assert.doesNotMatch(sources, /from ['"](?:lucide-react|react-icons|@heroicons|@fortawesome)/);
  assert.doesNotMatch(sources, /[\u{1F300}-\u{1FAFF}]/u);
  assert.match(sources, /OperatorGlyph/);
});

test('Stable Admin cards and shared primitives use machined frames rather than flat cards', () => {
  const pageCss = read('pages/horses/horses.module.css');
  const sharedCss = read('src/components/horses/shared.module.css');

  for (const selector of ['.loginCard', '.statBox', '.personaCard', '.settingCard', '.statCardLarge', '.tableWrapper', '.kpi']) {
    assert.match(pageCss, new RegExp(`\\${selector} \\{[\\s\\S]*?linear-gradient`));
  }
  assert.match(pageCss, /\.loginCard::before,[\s\S]*?clip-path:/);
  assert.match(pageCss, /\.header \{[\s\S]*?repeating-linear-gradient/);
  assert.match(sharedCss, /\.dialog \{[\s\S]*?linear-gradient/);
  assert.match(sharedCss, /\.kpiTile \{[\s\S]*?box-shadow:\s*inset/);
});
