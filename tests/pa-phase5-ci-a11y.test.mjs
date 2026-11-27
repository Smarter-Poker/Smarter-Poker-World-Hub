/**
 * pa-phase5-ci-a11y.test.mjs — Phase 5 Workstream 4 Tests
 *
 * Verifies:
 * 1. Path-filtered GitHub PR workflow (.github/workflows/pa-browser-smoke.yml)
 *    - Strict path filters for PA/Sandbox/Share surfaces
 *    - Permissions, concurrency, timeout, Node 24.12.0, cache hygiene
 *    - Absence of cron/schedule triggers
 * 2. scripts/ci/pa-browser-smoke.mjs upgrades:
 *    - Accessible name calculation and touch target thresholds
 *    - Landmark and heading validation
 *    - SSR Share Review validation (HTTP 200, noindex, no-store, robots meta, no +$1,250, OG tags)
 *    - CLI argument parsing and --check-only dry-run contract
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const { load: parseYaml } = createRequire(import.meta.url)('js-yaml');

test('pa-browser-smoke.yml follows all repository CI and workflow laws', () => {
  const workflowPath = '.github/workflows/pa-browser-smoke.yml';
  const yml = read(workflowPath);

  // 1. Strict path filters for PA/Sandbox/Share
  const expectedPaths = [
    'pages/hub/personal-assistant/**',
    'pages/share/hand.js',
    'pages/_app.js',
    'pages/api/assistant/**',
    'pages/api/poker/saved-hands.js',
    'pages/api/sandbox/**',
    'pages/api/training/audit-hand-history.js',
    'pages/api/og/hand-card.js',
    'src/components/personal-assistant/**',
    'src/components/sandbox/**',
    'src/lib/personal-assistant/**',
    'src/lib/sandbox/**',
    'src/lib/training/handAuditEngine.js',
    'src/lib/push/push-prefs.js',
    'src/config/diamondRewards.js',
    'src/hooks/useAssistant.js',
    'src/styles/worlds/PersonalAssistant*.module.css',
    'public/images/personal-assistant/**',
    'scripts/ci/pa-browser-smoke.mjs',
    'scripts/qualification/personalAssistantBrowser.mjs',
    'scripts/verify-pa-production-hardening.mjs',
    'scripts/openclaw-cron-dispatcher.py',
    'supabase/migrations/**',
    'next.config.js',
    'package.json',
    'package-lock.json',
    'tests/pa-*.test.mjs',
    'tests/personal-assistant-simplification.test.mjs',
    'tests/personal-assistant-math-and-worker.test.mjs',
    '__tests__/pa-*.test.mjs',
    '__tests__/helpers/saved-hand-query-fixture.mjs',
    'e2e/021-personal-assistant.spec.ts',
    'e2e/personal-assistant-completion.spec.ts',
    'e2e/fixtures/personalAssistantBrowser.ts',
    '.github/workflows/pa-browser-smoke.yml',
    '.github/workflows/global-footer-e2e.yml',
  ];
  for (const expectedPath of expectedPaths) {
    assert.ok(yml.includes(`'${expectedPath}'`), `missing path filter: ${expectedPath}`);
  }

  // 2. Event triggers: pull_request to main + workflow_dispatch; NO schedule/cron
  assert.match(yml, /pull_request:\s*\n\s*branches:\s*\[main\]/);
  assert.match(yml, /workflow_dispatch:/);
  assert.doesNotMatch(yml, /\bschedule:\b/, 'CI workflow must not define recurring schedules');

  // 3. Explicit permissions: contents: read only
  assert.match(yml, /permissions:\s*\n\s*contents:\s*read/);

  // 4. Concurrency with cancel-in-progress
  assert.match(yml, /concurrency:\s*\n\s*group:\s*pa-browser-smoke-\$\{\{\s*github\.ref\s*\}\}\s*\n\s*cancel-in-progress:\s*true/);

  // 5. Runner and timeout
  assert.match(yml, /runs-on:\s*\$\{\{\s*vars\.CI_RUNNER\s*\|\|\s*'ubuntu-latest'\s*\}\}/);
  assert.match(yml, /timeout-minutes:\s*10/);

  // 6. Node 24.12.0 and cache hygiene
  assert.match(yml, /node-version:\s*'24\.12\.0'/);
  assert.match(yml, /key:\s*nm-wh-noscripts-\$\{\{\s*runner\.os\s*\}\}-node24-\$\{\{\s*hashFiles\('package-lock\.json'\)\s*\}\}/);
  assert.match(yml, /npm ci --ignore-scripts --prefer-offline --no-audit/);

  // 7. Executes check-only contract smoke and unit test suite
  assert.match(yml, /node scripts\/ci\/pa-browser-smoke\.mjs --check-only/);
  assert.match(yml, /node --test tests\/pa-\*\.test\.mjs tests\/personal-assistant-simplification\.test\.mjs/);
});

test('the Personal Assistant unit gate executes saved-hand, import and native Sandbox regressions', () => {
  const workflow = parseYaml(read('.github/workflows/pa-browser-smoke.yml'));
  const unitSteps = workflow.jobs['smoke-and-unit'].steps.filter(step => step.run?.startsWith('node --test '));
  assert.equal(unitSteps.length, 1, 'keep the existing finite unit gate instead of adding a duplicate suite');
  const step = unitSteps[0];
  assert.equal(step['continue-on-error'], undefined, 'regression failures must fail the gate');
  const selection = step.run.trim().split(/\s+/).slice(2);
  for (const suite of [
    'tests/pa-*.test.mjs',
    'tests/personal-assistant-simplification.test.mjs',
    'tests/personal-assistant-math-and-worker.test.mjs',
    '__tests__/pa-*.test.mjs',
  ]) assert.ok(selection.includes(suite), `regression suite is not executed: ${suite}`);
  // The import suite is intentionally covered by the maintained pa-* selection.
  assert.ok(read('tests/pa-imported-review-queue.test.mjs').includes("from 'node:test'"));
  assert.equal(workflow.on.schedule, undefined);
});

test('the shared Footer production build runs finite Personal Assistant browser qualification first and retains evidence', () => {
  const workflow = parseYaml(read('.github/workflows/global-footer-e2e.yml'));
  const steps = workflow.jobs.footer.steps;
  const buildSteps = steps.filter(step => step.run === 'npm run build -- --webpack');
  assert.equal(buildSteps.length, 1, 'reuse the existing full production build');
  const build = buildSteps[0];
  assert.equal(build.id, 'production_build');
  const qualifications = steps.filter(step => step.run === 'node scripts/qualification/personalAssistantBrowser.mjs');
  assert.equal(qualifications.length, 1, 'the finite browser matrix must execute exactly once');
  const qualification = qualifications[0];
  assert.equal(steps.indexOf(qualification), steps.indexOf(build) + 1,
    'unrelated later browser failures must not skip Personal Assistant qualification');
  assert.equal(qualification.id, 'personal_assistant_browser');
  assert.equal(qualification.if, "${{ !cancelled() && steps.production_build.outcome == 'success' }}");
  assert.equal(qualification['continue-on-error'], undefined, 'browser failures must remain visible');
  assert.deepEqual(qualification.env, {
    CI: true,
    PERSONAL_ASSISTANT_BROWSER_WORK_ROOT: '${{ runner.temp }}',
    PERSONAL_ASSISTANT_BROWSER_EVIDENCE: '${{ github.workspace }}/test-results/personal-assistant',
  });
  const evidence = steps.find(step => step.uses === 'actions/upload-artifact@v4'
    && step.with?.path?.split(/\r?\n/).includes('test-results/'));
  assert.ok(evidence, 'the existing browser artifact must retain the Personal Assistant evidence directory');
  assert.equal(evidence.if, 'always()', 'failed qualification evidence must still be uploaded');
  assert.equal(workflow.on.schedule, undefined);
  assert.equal(workflow.on.push, undefined);
});

test('scripts/ci/pa-browser-smoke.mjs preserves core contract and adds a11y & SSR checks', async () => {
  const smoke = await import(pathToFileURL(join(ROOT, 'scripts/ci/pa-browser-smoke.mjs')).href);

  // Base constants
  assert.equal(smoke.DEFAULT_BASE_URL, 'https://smarter.poker');
  assert.equal(smoke.MIN_TOUCH_TARGET_HEIGHT, 36);
  assert.equal(smoke.SHARE_REVIEW_PATH, '/share/hand?view=review&street=flop&position=BTN');

  // Preserves all 7 PA/Sandbox routes (including Review My Play) and 2 viewports
  assert.deepEqual([...smoke.ROUTES], [
    '/hub/personal-assistant',
    '/hub/personal-assistant/review',
    '/hub/personal-assistant/leaks',
    '/hub/personal-assistant/leaks?format=tournament',
    '/hub/personal-assistant/leaks?tab=coaching',
    '/hub/personal-assistant/sandbox',
    '/sandbox/demo-hand-001',
  ]);
  assert.deepEqual(smoke.VIEWPORTS.map((v) => [v.width, v.height]), [[1440, 900], [390, 844]]);
  assert.deepEqual([...smoke.PRIVATE_API_PATHS], [
    '/api/assistant/leaks',
    '/api/assistant/coaching',
    '/api/assistant/stats',
    '/api/sandbox/custom-drill',
    '/api/sandbox/save-hand',
    '/api/poker/saved-hands',
    '/api/assistant/leaks/claim-live-fix',
    '/api/assistant/maintenance-jobs',
    '/api/training/audit-hand-history',
  ]);
  assert.deepEqual([...smoke.RETIRED_API_PATHS], [
    '/api/sandbox/equity-snapshot',
    '/api/assistant/sandbox/analyze',
  ]);

  // Checks include both existing and new a11y/SSR checks
  const requiredChecks = [
    'http-200',
    'no-page-errors',
    'no-horizontal-overflow',
    'no-invalid-button-nesting',
    'format-query-preserved',
    'private-api-headers',
    'a11y-accessible-name',
    'a11y-landmark-or-heading',
    'a11y-touch-targets',
    'a11y-keyboard-tab',
    'share-review-ssr',
  ];
  for (const check of requiredChecks) {
    assert.ok(smoke.CHECKS.includes(check), `CHECKS must include ${check}`);
  }

  // Contract verification dry-run
  assert.deepEqual(smoke.checkContract(), []);

  // CLI argument parsing
  const parsedDefault = smoke.parseArgs([]);
  assert.equal(parsedDefault.baseUrl, 'https://smarter.poker');
  assert.equal(parsedDefault.checkOnly, false);
  assert.equal(parsedDefault.strictOg, false);
  assert.equal(parsedDefault.storageState, null);

  const parsedCustom = smoke.parseArgs(['--base-url', 'https://preview.smarter.poker/path', '--check-only', '--strict-og', '--storage-state', 'state.json']);
  assert.equal(parsedCustom.baseUrl, 'https://preview.smarter.poker');
  assert.equal(parsedCustom.checkOnly, true);
  assert.equal(parsedCustom.strictOg, true);
  assert.equal(parsedCustom.storageState, 'state.json');
});

test('pa-browser-smoke --check-only executes cleanly via child process', () => {
  const stdout = execFileSync(process.execPath, ['scripts/ci/pa-browser-smoke.mjs', '--check-only'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.match(stdout, /pa-browser-smoke contract ok: 7 routes x 2 viewports, 9 private APIs, 11 checks/);
});

test('computeAccessibleName correctly derives accessible names and catches empty controls', async () => {
  const { computeAccessibleName } = await import(pathToFileURL(join(ROOT, 'scripts/ci/pa-browser-smoke.mjs')).href);

  // aria-label takes priority
  assert.equal(computeAccessibleName({ ariaLabel: 'Close Dialog', textContent: 'X' }), 'Close Dialog');

  // aria-labelledby resolves target text (never returns raw element ID string)
  assert.equal(computeAccessibleName({ ariaLabelledby: 'hdr-1', labelLookup: { 'hdr-1': 'Hand Replay' } }), 'Hand Replay');
  assert.equal(computeAccessibleName({ labelledByText: 'Coaching Header' }), 'Coaching Header');
  assert.equal(computeAccessibleName({ ariaLabelledby: 'dangling-id' }), '');

  // title attribute
  assert.equal(computeAccessibleName({ title: 'Help Information' }), 'Help Information');

  // innerText / textContent
  assert.equal(computeAccessibleName({ innerText: 'Save Changes' }), 'Save Changes');
  assert.equal(computeAccessibleName({ textContent: 'Back' }), 'Back');

  // img alt / svg title fallbacks
  assert.equal(computeAccessibleName({ imgAlt: 'Poker chip icon' }), 'Poker chip icon');
  assert.equal(computeAccessibleName({ svgTitle: 'Warning' }), 'Warning');

  // Empty control
  assert.equal(computeAccessibleName({}), '');
  assert.equal(computeAccessibleName({ ariaLabel: '   ', textContent: '' }), '');
});

test('shareReviewProblems validates status, headers, robots meta, no +$1,250, and OG tags', async () => {
  const { shareReviewProblems } = await import(pathToFileURL(join(ROOT, 'scripts/ci/pa-browser-smoke.mjs')).href);

  // 1. Valid compliant SSR payload passes cleanly
  const compliant = {
    status: 200,
    headers: {
      'x-robots-tag': 'noindex, nofollow',
      'cache-control': 'private, no-store, max-age=0',
    },
    body: `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Poker Hand Review | Smarter.Poker</title>
          <meta property="og:title" content="Poker Hand Review | Smarter.Poker" />
          <meta property="og:image" content="https://smarter.poker/api/og/hand-card?view=review&street=flop&position=BTN" />
          <meta name="robots" content="noindex,nofollow" />
        </head>
        <body>
          <main>
            <h1>Poker Hand Review</h1>
            <p>FLOP BTN</p>
          </main>
        </body>
      </html>
    `,
    strictOg: true,
  };
  assert.deepEqual(shareReviewProblems(compliant), []);

  // 2. Redirect (e.g. 308 next.config.js regression) is caught
  const redirectProblems = shareReviewProblems({
    status: 308,
    headers: { location: '/share/hand/default', 'x-robots-tag': 'noindex', 'cache-control': 'no-store' },
    body: '<meta name="robots" content="noindex,nofollow" />',
  });
  assert.ok(redirectProblems.some((p) => p.includes('status is 308, expected 200')));

  // 3. Missing X-Robots-Tag noindex
  const missingXRobots = shareReviewProblems({
    status: 200,
    headers: { 'cache-control': 'private, no-store' },
    body: '<meta name="robots" content="noindex,nofollow" />',
  });
  assert.ok(missingXRobots.some((p) => p.includes('X-Robots-Tag') && p.includes('noindex')));

  // 4. Missing Cache-Control no-store
  const missingCacheControl = shareReviewProblems({
    status: 200,
    headers: { 'x-robots-tag': 'noindex', 'cache-control': 'public, max-age=3600' },
    body: '<meta name="robots" content="noindex,nofollow" />',
  });
  assert.ok(missingCacheControl.some((p) => p.includes('Cache-Control') && p.includes('no-store')));

  // 5. Missing robots meta tag
  const missingRobotsMeta = shareReviewProblems({
    status: 200,
    headers: { 'x-robots-tag': 'noindex', 'cache-control': 'no-store' },
    body: '<html><head><title>Review</title></head><body><h1>Review</h1></body></html>',
  });
  assert.ok(missingRobotsMeta.some((p) => p.includes('missing <meta name="robots" content="noindex,nofollow">')));

  // 6. Fabricated +$1,250 default winning amount detected
  const fabricatedAmount = shareReviewProblems({
    status: 200,
    headers: { 'x-robots-tag': 'noindex', 'cache-control': 'no-store' },
    body: '<meta name="robots" content="noindex,nofollow" /><div>Won: +$1,250</div>',
  });
  assert.ok(fabricatedAmount.some((p) => p.includes('fabricated "+$1,250"')));

  // 7. OG metadata requirements with strictOg
  const missingOg = shareReviewProblems({
    status: 200,
    headers: { 'x-robots-tag': 'noindex', 'cache-control': 'no-store' },
    body: '<meta name="robots" content="noindex,nofollow" /><title>Some Hand</title>',
    strictOg: true,
  });
  assert.ok(missingOg.some((p) => p.includes('og:title')));
  assert.ok(missingOg.some((p) => p.includes('og:image')));
});

test('live pages/share/hand.js source satisfies SSR and meta contracts', () => {
  const shareSrc = read('pages/share/hand.js');

  // SSR sets headers for view=review
  assert.match(shareSrc, /res\.setHeader\('X-Robots-Tag',\s*'noindex, nofollow'\)/);
  assert.match(shareSrc, /res\.setHeader\('Cache-Control',\s*'private, no-store, max-age=0'\)/);

  // Sets robots meta
  assert.match(shareSrc, /isReview\s*&&\s*<meta(?:\s+[^>]*?)?\s+name="robots"\s+content="noindex,nofollow"\s*\/>/);

  // Sets OG title and OG image with view=review
  assert.match(shareSrc, /reviewText\(hand,\s*60\)\s*\|\|\s*'Poker Hand Review'/);
  assert.match(shareSrc, /view:\s*'review'/);
  assert.match(shareSrc, /<meta(?:\s+[^>]*?)?\s+property="og:title"\s+content=\{title\}\s*\/>/);
  assert.match(shareSrc, /<meta(?:\s+[^>]*?)?\s+property="og:image"\s+content=\{ogImageUrl\}\s*\/>/);
});
