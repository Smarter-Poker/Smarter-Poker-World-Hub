const { chromium, expect } = require('@playwright/test');
const http = require('http'),
  fs = require('fs'),
  path = require('path');
const os = require('os');
const root = path.resolve(__dirname, '../../..');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'trivia-browser-race-'));
if (process.env.GITHUB_OUTPUT)
  fs.appendFileSync(process.env.GITHUB_OUTPUT, 'evidence-directory=' + output + '\n');
let workerVersion = 1;
const results = [];
const pageErrors = [];
const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.url === '/sw.js') {
    res.setHeader('Content-Type', 'application/javascript');
    return res.end(
      `const VERSION=${workerVersion};self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('message',e=>{if(e.data==='version')e.ports[0].postMessage(VERSION);if(e.data?.type==='SP_SKIP_WAITING')self.skipWaiting()});`
    );
  }
  if (req.url === '/valid.svg') {
    res.setHeader('Content-Type', 'image/svg+xml');
    return res.end(
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="blue"/></svg>'
    );
  }
  if (req.url === '/broken.svg') {
    res.statusCode = 404;
    return res.end('missing');
  }
  if (req.url.startsWith('/images/')) {
    const f = path.join(root, 'public', req.url);
    if (fs.existsSync(f)) {
      res.setHeader('Content-Type', req.url.endsWith('.webp') ? 'image/webp' : 'image/png');
      return res.end(fs.readFileSync(f));
    }
    res.statusCode = 404;
    return res.end('absent');
  }
  if (req.url.startsWith('/bundle.')) {
    res.setHeader('Content-Type', req.url.endsWith('.css') ? 'text/css' : 'application/javascript');
    return res.end(fs.readFileSync(path.join(output, req.url)));
  }
  res.setHeader('Content-Type', 'text/html');
  res.end(
    '<html><head><link rel="stylesheet" href="/bundle.css"></head><body><div id="root"></div><script>sessionStorage.loads=String(Number(sessionStorage.loads||0)+1)</script><script src="/bundle.js"></script></body></html>'
  );
});
const flush = (page) =>
  page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );
const json = (route, body) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const item = (owner, state = 'eligible') => ({
  id: 'first_win',
  version: 2,
  title: owner + ' verified award',
  category: 'progress',
  state,
  progressCurrent: 1,
  progressTarget: 1,
  ...(state === 'awarded'
    ? {
        settledDiamonds: 5,
        receiptId: owner + 'receipt',
        journalId: owner + 'journal',
        transactionId: owner + 'transaction',
        awardedAt: new Date().toISOString(),
      }
    : {}),
});
const snapshot = (owner, state) => ({
  success: true,
  contract: 'trivia-achievements/2',
  version: 2,
  items: [item(owner, state)],
});
(async () => {
  await require('./build.cjs')(output);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({
    headless: true,
    ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}),
  });
  try {
    async function fresh(mode) {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => pageErrors.push({ mode, message: e.message }));
      await page.route('**/*', (r) => {
        if (!r.request().url().startsWith(base)) return r.abort();
        return r.fallback();
      });
      return { ctx, page, go: () => page.goto(base + '/?mode=' + mode) };
    }
    {
      const { ctx, page, go } = await fresh('art');
      await go();
      await expect(page.locator('[data-art="broken"]')).toHaveAttribute('data-art-state', 'error');
      await page.evaluate(() => {
        const img = document.querySelector('img');
        window.oldImg = img;
        window.oldPicture = img.parentNode;
        window.oldError = img[Object.keys(img).find((k) => k.startsWith('__reactProps$'))].onError;
        window.switchArt('valid');
      });
      await expect(page.locator('[data-art="valid"]')).toHaveAttribute('data-art-state', 'ready');
      await expect.poll(() => page.locator('img').evaluate((x) => x.naturalWidth)).toBe(640);
      await page.evaluate(() => window.oldError());
      await expect(page.locator('[data-art="valid"]')).toHaveAttribute('data-art-state', 'ready');
      expect(await page.locator('picture').evaluate((x) => x !== window.oldPicture)).toBe(true);
      expect(await page.locator('img').evaluate((x) => getComputedStyle(x).opacity)).toBe('1');
      results.push(
        'art: actual 404 recovered after identity change; picture remounted; late old React error ignored; replacement visible'
      );
      await ctx.close();
    }
    {
      const { ctx, page, go } = await fresh('sw');
      await go();
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller)
          await new Promise((r) =>
            navigator.serviceWorker.addEventListener('controllerchange', r, { once: true })
          );
      });
      await page.reload();
      await page.waitForFunction(() => window.acquireLease);
      const initial = await page.evaluate(() => Number(sessionStorage.loads));
      await page.evaluate(() => {
        window.releaseOne = window.acquireLease();
        window.releaseTwo = window.acquireLease();
      });
      expect(await page.locator('html').getAttribute('data-trivia-active-run-count')).toBe('2');
      workerVersion = 2;
      await page.evaluate(async () => {
        const changed = new Promise((r) =>
          navigator.serviceWorker.addEventListener('controllerchange', r, { once: true })
        );
        await (await navigator.serviceWorker.getRegistration('/')).update();
        await changed;
      });
      expect(await page.evaluate(() => Number(sessionStorage.loads))).toBe(initial);
      await page.evaluate(() => window.releaseOne());
      expect(await page.locator('html').getAttribute('data-trivia-active-run-count')).toBe('1');
      expect(await page.evaluate(() => Number(sessionStorage.loads))).toBe(initial);
      await page.evaluate(() => window.releaseTwo());
      await page.waitForFunction((n) => Number(sessionStorage.loads) === n, initial + 1);
      await page.waitForFunction(() => window.acquireLease);
      expect(await page.evaluate(() => window.activeLease())).toBe(false);
      await page.evaluate(() =>
        navigator.serviceWorker.dispatchEvent(new Event('controllerchange'))
      );
      expect(await page.evaluate(() => Number(sessionStorage.loads))).toBe(initial + 1);
      results.push(
        'sw: real V1->V2 browser worker takeover deferred through two leases; exactly one reload after final release; cooldown prevented repeated reload'
      );
      await ctx.close();
    }
    {
      const { ctx, page, go } = await fresh('achievements');
      let pendingRead;
      await page.route('**/api/trivia/achievements', async (r) => {
        const account = r.request().headers()['x-fixture-account'];
        if (account === 'account-a') {
          pendingRead = r;
          return;
        }
        await json(r, snapshot('B'));
      });
      await go();
      await expect.poll(() => Boolean(pendingRead)).toBe(true);
      await page.evaluate(() => window.switchAccount('account-b'));
      await expect(page.getByText('B Verified Award', { exact: true })).toBeVisible();
      const progress = page.locator('[data-achievement-id="first_win"] .trivia-progress-item__meta > span').last();
      await expect(progress).toContainText('Progress 1 Of 1');
      await expect(progress.locator('[aria-hidden="true"]')).toHaveText('1 / 1');
      await expect(progress.locator('[aria-hidden="true"]')).toBeVisible();
      expect(await progress.getAttribute('aria-label')).toBe(null);
      expect(await progress.locator('span').first().evaluate((node) => getComputedStyle(node).clipPath)).toBe('inset(50%)');
      await json(pendingRead, snapshot('A', 'awarded'));
      await flush(page);
      await expect(page.getByText('B Verified Award', { exact: true })).toBeVisible();
      await expect(page.getByText('A Verified Award', { exact: true })).toHaveCount(0);
      results.push(
        'achievements: old account delayed read cannot appear after mounted account switch'
      );
      await ctx.close();
    }
    {
      const { ctx, page, go } = await fresh('achievements');
      let heldClaim, heldRefresh;
      let gets = 0;
      await page.route('**/api/trivia/achievements', async (r) => {
        const a = r.request().headers()['x-fixture-account'];
        if (r.request().method() === 'POST') {
          heldClaim = r;
          return;
        }
        if (a === 'account-a' && ++gets > 1) {
          heldRefresh = r;
          return;
        }
        await json(r, snapshot(a === 'account-a' ? 'A' : 'B'));
      });
      await go();
      await expect(page.getByText('A Verified Award', { exact: true })).toBeVisible();
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect.poll(() => Boolean(heldRefresh)).toBe(true); // refresh in-flight hides controls; resolve it before claim? preserve handler from previous DOM
      await page.evaluate(() => window.switchAccount('account-b'));
      await expect(page.getByText('B Verified Award', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Claim Verified Award' }).click();
      await expect.poll(() => Boolean(heldClaim)).toBe(true);
      await page.evaluate(() => window.switchAccount('account-c'));
      await expect(page.getByText('B Verified Award', { exact: true })).toBeVisible();
      await json(heldClaim, {
        success: true,
        contract: 'trivia-achievements/2',
        version: 2,
        item: item('Old', 'awarded'),
      });
      await json(heldRefresh, snapshot('Stale', 'awarded'));
      await flush(page);
      await expect(page.locator('[data-achievement-id="first_win"]')).toHaveAttribute(
        'data-state',
        'eligible'
      );
      await expect(page.getByText('Old Verified Award', { exact: true })).toHaveCount(0);
      results.push(
        'achievements: delayed old account claim and refresh cannot credit replacement account'
      );
      await ctx.close();
    }
    {
      const { ctx, page, go } = await fresh('settings');
      let heldRead;
      await page.route('**/fixture/read?**', async (r) => {
        const id = new URL(r.request().url()).searchParams.get('id');
        if (id === 'account-a') {
          heldRead = r;
          return;
        }
        await json(r, {
          data: { trivia_preferences: { difficulty: 'hard' }, trivia_preferences_revision: 3 },
          error: null,
        });
      });
      await go();
      await expect.poll(() => Boolean(heldRead)).toBe(true);
      await page.evaluate(() => window.switchAccount('account-b'));
      await expect(
        page.getByRole('group', { name: 'Difficulty' }).getByRole('button', { name: 'Hard' })
      ).toHaveAttribute('aria-pressed', 'true');
      await json(heldRead, {
        data: { trivia_preferences: { difficulty: 'easy' }, trivia_preferences_revision: 1 },
        error: null,
      });
      await flush(page);
      await expect(
        page.getByRole('group', { name: 'Difficulty' }).getByRole('button', { name: 'Hard' })
      ).toHaveAttribute('aria-pressed', 'true');
      results.push('settings: old account cloud read cannot overwrite new account preferences');
      await ctx.close();
    }
    {
      const { ctx, page, go } = await fresh('settings');
      let heldWrite;
      await page.route('**/fixture/read?**', (r) => {
        const id = new URL(r.request().url()).searchParams.get('id');
        return json(r, {
          data: {
            trivia_preferences: { difficulty: id === 'account-a' ? 'medium' : 'hard' },
            trivia_preferences_revision: 3,
          },
          error: null,
        });
      });
      await page.route('**/fixture/rpc', (r) => {
        heldWrite = r;
      });
      await go();
      await expect(
        page.getByRole('group', { name: 'Difficulty' }).getByRole('button', { name: 'Easy' })
      ).toBeEnabled();
      await page
        .getByRole('group', { name: 'Difficulty' })
        .getByRole('button', { name: 'Easy' })
        .click();
      await expect.poll(() => Boolean(heldWrite)).toBe(true);
      await page.evaluate(() => window.switchAccount('account-b'));
      await expect(
        page.getByRole('group', { name: 'Difficulty' }).getByRole('button', { name: 'Hard' })
      ).toHaveAttribute('aria-pressed', 'true');
      await json(heldWrite, {
        data: {
          contract: 'trivia-preferences-cas/1',
          version: 1,
          success: true,
          conflict: false,
          preferences: { difficulty: 'easy' },
          revision: 4,
        },
        error: null,
      });
      await flush(page);
      await expect(
        page.getByRole('group', { name: 'Difficulty' }).getByRole('button', { name: 'Hard' })
      ).toHaveAttribute('aria-pressed', 'true');
      results.push(
        'settings: prior account CAS completion cannot overwrite new account preferences'
      );
      await ctx.close();
    }
    {
      const { ctx, page, go } = await fresh('achievements');
      let heldRefresh,
        reads = 0;
      await page.route('**/api/trivia/achievements', (r) => {
        if (r.request().method() === 'POST')
          return json(r, {
            success: true,
            contract: 'trivia-achievements/2',
            version: 2,
            item: item('A', 'awarded'),
          });
        if (++reads > 1) {
          heldRefresh = r;
          return;
        }
        return json(r, snapshot('A'));
      });
      await go();
      await expect(page.getByRole('button', { name: 'Claim Verified Award' })).toBeVisible();
      await page
        .getByRole('button', { name: 'Claim Verified Award' })
        .evaluate(
          (b) =>
            (window.queuedClaim =
              b[Object.keys(b).find((k) => k.startsWith('__reactProps$'))].onClick)
        );
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect.poll(() => Boolean(heldRefresh)).toBe(true);
      await page.evaluate(() => window.queuedClaim());
      await json(heldRefresh, snapshot('A'));
      await flush(page);
      await expect(page.locator('[data-achievement-id="first_win"]')).toHaveAttribute(
        'data-state',
        'credited'
      );
      await expect(page.getByRole('button', { name: 'Claim Verified Award' })).toHaveCount(0);
      results.push(
        'achievements: same-account in-flight refresh invalidated by queued real claim handler; authoritative settled award remains credited'
      );
      await ctx.close();
    }
    {
      const { ctx, page, go } = await fresh('settings');
      let heldRefresh,
        reads = 0;
      await page.route('**/fixture/read?**', (r) => {
        reads++;
        if (reads === 2) {
          heldRefresh = r;
          return;
        }
        return json(r, {
          data: { trivia_preferences: { difficulty: 'medium' }, trivia_preferences_revision: 3 },
          error: null,
        });
      });
      await page.route('**/fixture/rpc', (r) =>
        json(r, {
          data: {
            contract: 'trivia-preferences-cas/1',
            version: 1,
            success: true,
            conflict: false,
            preferences: { difficulty: 'easy' },
            revision: 4,
          },
          error: null,
        })
      );
      await go();
      const easy = page
        .getByRole('group', { name: 'Difficulty' })
        .getByRole('button', { name: 'Easy' });
      await expect(easy).toBeEnabled();
      await easy.evaluate(
        (b) =>
          (window.queuedEdit = b[Object.keys(b).find((k) => k.startsWith('__reactProps$'))].onClick)
      );
      await page.evaluate(() =>
        window.dispatchEvent(new StorageEvent('storage', { key: 'sp-trivia-prefs-account-a' }))
      );
      await expect.poll(() => Boolean(heldRefresh)).toBe(true);
      await page.evaluate(() => window.queuedEdit());
      await expect(easy).toHaveAttribute('aria-pressed', 'true');
      await json(heldRefresh, {
        data: { trivia_preferences: { difficulty: 'medium' }, trivia_preferences_revision: 3 },
        error: null,
      });
      await flush(page);
      await expect(easy).toHaveAttribute('aria-pressed', 'true');
      await expect
        .poll(() =>
          page.evaluate(
            () => JSON.parse(localStorage.getItem('sp-trivia-prefs-account-a:sync')).baseRevision
          )
        )
        .toBe(4);
      results.push(
        'settings: same-account delayed cloud refresh cannot overwrite revision4 CAS result; actual preference service retains new account-scoped durable preference'
      );
      await ctx.close();
    }
    {
      const { ctx, page, go } = await fresh('endless');
      const sid = '11111111-1111-4111-8111-111111111111',
        rid = '22222222-2222-4222-8222-222222222222',
        key = 'sp.trivia.solo-recovery.v1:account-a:endless';
      await ctx.addInitScript(
        ({ sid, rid, key }) => {
          if (!localStorage.getItem('seeded')) {
            localStorage.setItem('seeded', 'true');
            localStorage.setItem(
              key,
              JSON.stringify({
                version: 1,
                mode: 'endless',
                accountId: 'account-a',
                sessionId: sid,
                phase: 'settling',
                createdAt: Date.now(),
                settlementRequestId: rid,
              })
            );
          }
        },
        { sid, rid, key }
      );
      await page.route('**/fixture/read?**', (r) =>
        json(r, { data: { high_score: 2 }, error: null })
      );
      let calls = [];
      await page.route('**/api/trivia/session-submit', (r) => {
        calls.push(r.request().postDataJSON());
        const projected = calls.length >= 3;
        return json(r, {
          success: true,
          sessionId: sid,
          correct: 7,
          total: 10,
          diamondsAwarded: 7,
          newBalance: 1007,
          highScoreProjection: projected
            ? {
                status: 'persisted',
                highScore: 7,
                verifiedCorrect: 7,
                improved: true,
                replayed: false,
                projectionId: '33333333-3333-4333-8333-333333333333',
              }
            : {
                status: 'pending',
                reason: 'projection_unavailable',
                highScore: null,
                improved: false,
              },
        });
      });
      await go();
      await page.getByRole('button', { name: 'Resume Endless Run', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Retry Record Projection', exact: true })
      ).toBeVisible();
      await expect(page.getByText('New High Score', { exact: true })).toHaveCount(0);
      expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key)).toMatchObject({
        sessionId: sid,
        settlementRequestId: rid,
        phase: 'settling',
      });
      expect(await page.locator('html').getAttribute('data-trivia-active-run')).toBe('true');
      await page.reload();
      await page.getByRole('button', { name: 'Resume Endless Run', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Retry Record Projection', exact: true })
      ).toBeVisible();
      await page.getByRole('button', { name: 'Retry Record Projection', exact: true }).click();
      await expect(page.getByText('New High Score', { exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), key)).toBe(null);
      expect(calls.length).toBe(3);
      for (const c of calls) {
        expect(c.sessionId).toBe(sid);
        expect(c.settlementRequestId || c.requestId).toBe(rid);
      }
      results.push(
        'endless: actual page + actual run hook retain same settlement custody/active lease through pending result and reload; explicit retry persists record then retires pointer; no new start/entry'
      );
      await ctx.close();
    }
    for (const [mode, title] of [
      ['mtt', 'MTT Scenarios'],
      ['cash', 'Cash Game'],
      ['icm', 'ICM & Chip EV'],
      ['gto', 'GTO Master'],
    ]) {
      const { ctx, page, go } = await fresh('strategy-' + mode + '&authLoading=true');
      await go();
      await expect(page.getByTestId('trivia-skeleton')).toBeVisible();
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(
        page.getByRole('main').getByRole('heading', { level: 1, name: title, exact: true })
      ).toBeVisible();
      await page.evaluate(() => window.switchLoading(false));
      await expect(
        page.locator('[data-strategy-mode="' + mode + '"][data-game-state="lobby"]')
      ).toBeVisible();
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(
        page.getByRole('main').getByRole('heading', { level: 1, name: title, exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole('main').getByRole('button', { name: 'Start Challenge', exact: true })
      ).toBeVisible();
      results.push(
        'strategy ' +
          mode +
          ': one main-content landmark contains the actual loading title and hydrated lobby/actions'
      );
      await ctx.close();
    }
    expect(pageErrors).toEqual([]);
    console.log(JSON.stringify({ status: 'passed', results, evidenceDirectory: output }, null, 2));
    fs.writeFileSync(
      path.join(output, 'results.json'),
      JSON.stringify({ status: 'passed', results, observedAt: new Date().toISOString() }, null, 2)
    );
  } catch (e) {
    console.error(e.stack);
    fs.writeFileSync(
      path.join(output, 'results.json'),
      JSON.stringify({ status: 'failed', results, error: e.stack }, null, 2)
    );
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
})();
