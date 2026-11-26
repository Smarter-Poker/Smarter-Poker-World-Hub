import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { normalizeLaunchFormat } from '../src/lib/training/customTrainingLaunchContract.mjs';

const ROOT = process.cwd();
const read = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

test('P0-1 & P1-6: Training Lobby ?autoLaunch= uses router.replace, accepts ?game= alias, normalizes format=tournament, and forwards PA context', () => {
  const trainingSrc = read('pages/hub/training.js');

  // Must import and use normalizeLaunchFormat so format=tournament -> 'mtt'
  assert.match(trainingSrc, /import\s*\{\s*normalizeLaunchFormat\s*\}\s*from\s*['"]\.\.\/\.\.\/src\/lib\/training\/customTrainingLaunchContract\.mjs['"]/);
  assert.equal(normalizeLaunchFormat('tournament'), 'mtt');
  assert.equal(normalizeLaunchFormat('cash'), 'cash');

  // Same-origin /hub/ returnTo validator rejects external URLs and protocol-relative // paths
  assert.match(trainingSrc, /function sanitizeHubReturnTo\(value\)/);
  assert.match(trainingSrc, /!trimmed\.startsWith\('\/hub\/'\)\s*\|\|\s*trimmed\.startsWith\('\/\/'\)\s*\|\|\s*trimmed\.includes\(':\/\/'\)/);

  // playGame supports focus?.replace === true via router.replace to prevent Back-button loop
  assert.match(trainingSrc, /if\s*\(focus\?\.replace === true\)\s*\{\s*router\.replace\(navTarget\);\s*\}\s*else\s*\{\s*router\.push\(navTarget\);\s*\}/);

  // playGame forwards from, source, leak, and validated returnTo
  assert.match(trainingSrc, /if\s*\(focus\?\.from \|\| focus\?\.source\)\s*\{\s*query\.source = focus\.from \|\| focus\.source;\s*\}/);
  assert.match(trainingSrc, /query\.from = focus\.from\.trim\(\)/);
  assert.match(trainingSrc, /query\.leak = focus\.leak\.trim\(\)/);
  assert.match(trainingSrc, /query\.returnTo = safeReturnTo/);

  // useEffect accepts router.query.game as alias for router.query.autoLaunch and sets replace: true
  assert.match(trainingSrc, /router\.query\.autoLaunch \|\| router\.query\.game/);
  assert.match(trainingSrc, /const queryOverrides = \{\s*replace: true,/);
  assert.match(trainingSrc, /const qFormat = normalizeLaunchFormat\(rawQFormat\) \|\| rawQFormat/);
});

test('P0-1 & P1-6: Training Arena normalizes format=tournament, validates returnTo, returns to PA on exit, and maps syncedHandId return banner by source', () => {
  const arenaSrc = read('pages/hub/training/arena/[gameId].js');

  // Normalizes format with normalizeLaunchFormat while keeping canonical rawFormat check
  assert.match(arenaSrc, /normalizeLaunchFormat/);
  assert.match(arenaSrc, /const rawFormat = normalizeLaunchFormat\(rawFormatInput\) \|\| rawFormatInput/);
  assert.ok(arenaSrc.includes("['cash', 'mtt', 'spins', 'hu', '9max'].includes(rawFormat)"));

  // Validates returnTo strictly within /hub/
  assert.match(arenaSrc, /function sanitizeHubReturnTo\(value\)/);

  // handleExit navigates back to validated returnTo or /hub/personal-assistant/leaks (preserving ?leak=)
  assert.match(arenaSrc, /const safeReturnTo = sanitizeHubReturnTo\(router\.query\?\.returnTo\);\s*if\s*\(safeReturnTo\)\s*\{\s*router\.push\(safeReturnTo\);\s*return;\s*\}/);
  assert.match(arenaSrc, /fromParam === 'leak-finder' \|\| sourceParam === 'leak-finder' \|\| sourceParam\.startsWith\('personal-assistant'\)/);
  assert.match(arenaSrc, /\/hub\/personal-assistant\/leaks\?leak=\$\{encodeURIComponent\(leakParam\)\}/);

  // handleExit also forwards targetStreet when exiting to level selector
  assert.match(arenaSrc, /exitParams\.set\('targetStreet',\s*router\.query\.targetStreet\.trim\(\)\)/);

  // Crisp top banner for PA-originated drills and source-aware syncedHandId return link
  assert.match(arenaSrc, /data-pa-return-banner="true"/);
  assert.match(arenaSrc, /← Return To Personal Assistant/);
  assert.match(arenaSrc, /querySource === 'personal-assistant-live-spot'/);
  assert.match(arenaSrc, /querySource === 'hand-history-upload'/);
  assert.match(arenaSrc, /\/hub\/training\/hand-history-upload/);
  assert.match(arenaSrc, /\/hub\/training\/live-hud-sync/);
});

test('P1-2: ReviewHandModal never leaks hole cards into URL query strings or calls btoa on Unicode suit symbols', () => {
  const modalSrc = read('src/components/poker/ReviewHandModal.jsx');

  assert.doesNotMatch(modalSrc, /\bbtoa\s*\(/, 'ReviewHandModal must never call btoa() on hand data (crashes on Unicode ♠♥♦♣)');
  assert.doesNotMatch(modalSrc, /handPayload/, 'ReviewHandModal must never serialize handPayload into URL query strings');
  assert.match(modalSrc, /\/hub\/personal-assistant\/leaks\?hand=\$\{encodeURIComponent\(handId\)\}&source=hub-hand-history/);
  assert.match(modalSrc, /\/hub\/personal-assistant\/leaks\?quickspot=1&source=hub-hand-history/);
});

test('P2-9: PA-sourced Back links on hand-history-upload.js, spot-trainer.js, and reports.js return to Personal Assistant', () => {
  for (const relPath of [
    'pages/hub/training/hand-history-upload.js',
    'pages/hub/training/spot-trainer.js',
    'pages/hub/training/reports.js',
  ]) {
    const src = read(relPath);
    assert.match(
      src,
      /querySource\.startsWith\('personal-assistant'\)\s*\|\|\s*querySource\.startsWith\('assistant-sandbox'\)/,
      `${relPath} must detect personal-assistant and assistant-sandbox sources`,
    );
    assert.match(
      src,
      /\/hub\/personal-assistant\/leaks\?leak=\$\{encodeURIComponent\(queryLeak\)\}/,
      `${relPath} must preserve ?leak= when returning to Personal Assistant`,
    );
    assert.match(
      src,
      /Back To Personal Assistant/,
      `${relPath} must label the PA return action "Back To Personal Assistant"`,
    );
  }
});

test('P2-10: MCP server emits ?autoLaunch= and hamburgerMenus renames misleading GTO Sandbox labels', () => {
  const mcpSrc = read('src/lib/mcp/mcpServer.mjs');
  assert.match(mcpSrc, /launch_url:\s*`\$\{base\}\/hub\/training\?autoLaunch=\$\{g\.id\}`/);
  assert.doesNotMatch(mcpSrc, /launch_url:\s*`\$\{base\}\/hub\/training\?game=\$\{g\.id\}`/);

  const menusSrc = read('src/config/hamburgerMenus.js');
  assert.match(menusSrc, /label:\s*'Scenario Archive'/);
  assert.match(menusSrc, /createMenuItem\.navigation\('Scenario Archive',\s*'\/hub\/personal-assistant\/sandbox'/);
});

test('P2-7: next.config.js includes wildcard legacy redirects for /hub/jarvis/:path* and /hub/sandbox/:path*', () => {
  const nextConfigSrc = read('next.config.js');
  assert.match(
    nextConfigSrc,
    /\{\s*source:\s*'\/hub\/jarvis',\s*destination:\s*'\/hub\/personal-assistant\/leaks',\s*permanent:\s*false\s*\}/,
  );
  assert.match(
    nextConfigSrc,
    /\{\s*source:\s*'\/hub\/jarvis\/:path\*',\s*destination:\s*'\/hub\/personal-assistant\/leaks',\s*permanent:\s*false\s*\}/,
  );
  assert.match(
    nextConfigSrc,
    /\{\s*source:\s*'\/hub\/sandbox',\s*destination:\s*'\/hub\/personal-assistant\/sandbox',\s*permanent:\s*false\s*\}/,
  );
  assert.match(
    nextConfigSrc,
    /\{\s*source:\s*'\/hub\/sandbox\/:path\*',\s*destination:\s*'\/hub\/personal-assistant\/sandbox',\s*permanent:\s*false\s*\}/,
  );
});
