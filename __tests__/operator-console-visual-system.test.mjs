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

test('every operator route family is wrapped by the Club Arena console shell', () => {
  const app = read('pages/_app.js');
  const routes = read('src/components/admin/operatorConsoleRoutes.js');

  assert.match(app, /isOperatorConsoleRoute\(resolvedPath\)/);
  assert.match(app, /<OperatorConsoleShell>/);
  assert.match(routes, /pathname === '\/horses'/);
  assert.match(routes, /pathname\.startsWith\('\/horses\/'\)/);
  assert.match(routes, /pathname\.startsWith\('\/admin\/'\)/);
  assert.match(routes, /pathname\.startsWith\('\/hub\/admin\/'\)/);
});

test('the operator frame is dimensional, responsive, and reduced-motion safe', () => {
  const shell = read('src/components/admin/OperatorConsoleShell.jsx');
  const css = read('src/components/admin/OperatorConsoleShell.module.css');

  assert.match(shell, /data-admin-console="club-arena"/);
  assert.match(shell, /className=\{styles\.frameRail\}/);
  assert.match(shell, /kind="shield"/);
  assert.match(css, /repeating-linear-gradient/);
  assert.match(css, /box-shadow:\s*inset/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
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
