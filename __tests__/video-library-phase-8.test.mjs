import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const PAGE = read('../pages/hub/video-library.js');
const CSS = read('../src/styles/worlds/video-library.css');
const RAIL = read('../src/components/video-library/VideoLibraryCommandRail.jsx');
const CATALOG = read('../pages/api/video-library/catalog.js');
const WATCH_PROGRESS = read('../pages/api/video-library/watch-progress.js');
const CLIENT_ERROR = read('../pages/api/video-library/client-error.js');
const HISTORY = read('../src/services/videoWatchHistory.js');

test('catalog reads are paginated, cached, rate-limited, and latest-request-wins', () => {
  assert.match(CATALOG, /applyRateLimit\(req, res, LIMITS\.read\)/);
  assert.match(CATALOG, /\.range\(offset, offset \+ limit - 1\)/);
  assert.match(CATALOG, /count: 'exact'/);
  assert.match(CATALOG, /s-maxage=120, stale-while-revalidate=600/);
  assert.match(PAGE, /catalogAbortRef\.current\?\.abort\(\)/);
  assert.match(PAGE, /requestId !== catalogRequestRef\.current/);
  assert.match(PAGE, /fetchCatalogPage\(\{ append: true, offset: videos\.length \}\)/);
  assert.doesNotMatch(PAGE, /\.from\('video_library_videos'\)/);
});

test('search and order remain shareable URL state', () => {
  assert.match(PAGE, /router\.query\.q/);
  assert.match(PAGE, /router\.query\.sort/);
  assert.match(PAGE, /replaceNavigationQuery\(\{ q: searchQuery \|\| null \}\)/);
  assert.match(PAGE, /replaceNavigationQuery\(\{ sort: nextSortMode === 'default' \? null : nextSortMode \}\)/);
});

test('lifecycle watch progress uses verified identity and keepalive transport', () => {
  assert.match(HISTORY, /export async function flushWatchDuration/);
  assert.match(HISTORY, /keepalive: true/);
  assert.match(HISTORY, /Authorization: `Bearer \$\{token\}`/);
  assert.match(WATCH_PROGRESS, /getServerUserWithFallback\(req, supabase\)/);
  assert.match(WATCH_PROGRESS, /global: \{ headers: \{ Authorization: `Bearer \$\{token\}` \} \}/);
  assert.match(WATCH_PROGRESS, /userSupabase\.rpc\('record_video_watch_session'/);
  assert.doesNotMatch(WATCH_PROGRESS, /const \{ data, error \} = await supabase\.rpc\('record_video_watch_session'/);
  assert.match(WATCH_PROGRESS, /p_expected_user_id: user\.id/);
  assert.doesNotMatch(WATCH_PROGRESS, /req\.body\?\.userId/);
  assert.match(WATCH_PROGRESS, /record_video_watch_session/);
});

test('personal-library recovery is persistent, actionable, and includes Playlists', () => {
  assert.match(PAGE, /librarySyncState/);
  assert.match(PAGE, /librarySyncErrors/);
  assert.match(PAGE, /refreshUserLibraryRef\.current\?\.\(\{ force: true \}\)/);
  assert.match(PAGE, /id: 'playlists'/);
  assert.match(PAGE, /playlistVideoIds/);
  assert.match(PAGE, /Sign In To Sync/);
  assert.match(PAGE, /\/auth\/login\?redirect=/);
});

test('loading, broken-media, featured, and mobile rail treatments are explicit', () => {
  assert.match(PAGE, /vl-video-skeleton/);
  assert.match(PAGE, /vl-media-failed/);
  assert.match(PAGE, /isFeatured = index === 0 && !hasActiveFilters/);
  assert.match(CSS, /\.vl-video-card\.is-featured/);
  assert.match(CSS, /\.vl-video-skeleton/);
  assert.match(CSS, /Preview unavailable/);
  // PIN MOVED (mobile phase 9, 2026-09-14): the edge fade mask was the
  // rail's (it faded the last chip to hint at more off screen). Every
  // control wraps on screen now, so there is nothing to hint at.
  assert.doesNotMatch(CSS, /mask-image: linear-gradient/);
  assert.match(CSS, /\.vl-type-toggle-row \{\s*display: grid !important;/);
  assert.match(CSS, /\.vl-empty-state button,[\s\S]*min-height: 44px/);
});

test('command rail is modular and client failures are allowlisted for telemetry', () => {
  assert.match(PAGE, /<VideoLibraryCommandRail/);
  assert.match(RAIL, /forwardRef/);
  assert.match(RAIL, /data-filter-group="library"/);
  assert.match(CLIENT_ERROR, /ALLOWED_EVENTS/);
  assert.match(CLIENT_ERROR, /reportApiError\(error, req\)/);
  assert.match(PAGE, /reportVideoLibraryIssue\('catalog_load'/);
  assert.match(PAGE, /reportVideoLibraryIssue\('library_sync'/);
  assert.match(PAGE, /reportVideoLibraryIssue\('reels_boundary'/);
});

test('the phase-eight JavaScript surface has no undefined runtime identifiers', async t => {
  let ESLint;
  let reactPlugin;
  try {
    ({ ESLint } = await import('eslint'));
    const reactModule = await import('eslint-plugin-react');
    reactPlugin = reactModule.default ?? reactModule;
  } catch {
    t.skip('ESLint dependencies are unavailable in this checkout');
    return;
  }

  const globals = Object.fromEntries([
    'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'fetch',
    'AbortController', 'URL', 'URLSearchParams', 'IntersectionObserver',
    'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement',
    'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout',
    'clearTimeout', 'setInterval', 'clearInterval', 'process', 'require', 'module',
    'exports', 'console', 'Buffer', '__dirname', '__filename',
  ].map(name => [name, 'readonly']));

  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [{
      files: ['**/*.{js,jsx}'],
      languageOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        parserOptions: { ecmaFeatures: { jsx: true } },
        globals,
      },
      plugins: { react: reactPlugin },
      rules: { 'no-undef': 'error', 'react/jsx-no-undef': 'error' },
    }],
  });

  const files = [
    '../pages/hub/video-library.js',
    '../src/components/video-library/VideoLibraryCommandRail.jsx',
    '../src/services/videoWatchHistory.js',
    '../pages/api/video-library/catalog.js',
    '../pages/api/video-library/watch-progress.js',
    '../pages/api/video-library/client-error.js',
  ];
  const failures = [];
  for (const file of files) {
    const fileUrl = new URL(file, import.meta.url);
    const [result] = await eslint.lintText(read(file), { filePath: fileUrl.pathname });
    result.messages
      .filter(message => message.ruleId === 'no-undef' || message.ruleId === 'react/jsx-no-undef')
      .forEach(message => failures.push(`${file}:${message.line}:${message.column} ${message.message}`));
  }
  assert.deepEqual(failures, []);
});
