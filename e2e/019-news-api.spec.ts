import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * News API contract coverage.
 *
 * Two jobs:
 *   1. Pin the pagination contract that /hub/news is built on
 *      ({ success, data, pagination: { limit, offset, total, hasMore } }) so a
 *      future change cannot quietly drop `data` or stop advancing `offset`.
 *   2. Prove the maintenance/debug routes reject unauthenticated callers. Some
 *      of them delete rows, so an open route is a data-loss bug, not a nit.
 *
 * Nothing here sends CRON_SECRET or ADMIN_API_KEY: these tests must never be
 * able to trigger the destructive side of those endpoints.
 */

const ARTICLES = '/api/news/articles';

type Pagination = { limit?: unknown; offset?: unknown; total?: unknown; hasMore?: unknown };
type ArticlesBody = { success?: unknown; data?: unknown; pagination?: Pagination };

async function getArticles(request: APIRequestContext, query = ''): Promise<ArticlesBody> {
  const res = await request.get(`${ARTICLES}${query}`);
  expect(res.status(), `GET ${ARTICLES}${query} should succeed`).toBe(200);
  return (await res.json()) as ArticlesBody;
}

function expectArticlesShape(body: ArticlesBody): asserts body is {
  success: true;
  data: Array<{ id?: string }>;
  pagination: { limit: number; offset: number; total: number; hasMore: boolean };
} {
  expect(body.success).toBe(true);
  // BACKWARD COMPATIBLE: `data` keeps its original meaning — the page of rows.
  expect(Array.isArray(body.data), '`data` must stay an array of article rows').toBe(true);
  expect(body.pagination, '`pagination` block is missing').toBeTruthy();
  const p = body.pagination as Pagination;
  expect(typeof p.limit).toBe('number');
  expect(typeof p.offset).toBe('number');
  expect(typeof p.total).toBe('number');
  expect(typeof p.hasMore).toBe('boolean');
}

test.describe('11. News API — Articles Pagination Contract', () => {
  test('returns { success, data, pagination }', async ({ request }) => {
    const body = await getArticles(request);
    expectArticlesShape(body);

    expect(body.pagination.limit).toBe(24); // documented default
    expect(body.pagination.offset).toBe(0);
    expect(body.pagination.total).toBeGreaterThanOrEqual(body.data.length);
    expect(body.data.length).toBeLessThanOrEqual(body.pagination.limit);
  });

  test('clamps limit to 1..100 and offset to >= 0', async ({ request }) => {
    const tooBig = await getArticles(request, '?limit=1000');
    expectArticlesShape(tooBig);
    expect(tooBig.pagination.limit).toBe(100);

    const tooSmall = await getArticles(request, '?limit=0');
    expectArticlesShape(tooSmall);
    expect(tooSmall.pagination.limit).toBe(1);

    // `?limit=abc` used to produce range(0, NaN) and a 500.
    const nonNumeric = await getArticles(request, '?limit=abc');
    expectArticlesShape(nonNumeric);
    expect(nonNumeric.pagination.limit).toBe(24);

    const negative = await getArticles(request, '?offset=-5');
    expectArticlesShape(negative);
    expect(negative.pagination.offset).toBe(0);
  });

  test('offset actually advances the window', async ({ request }) => {
    const first = await getArticles(request, '?limit=5&offset=0');
    expectArticlesShape(first);
    test.skip(first.pagination.total <= 5, 'fewer than 6 published articles — cannot page');

    const second = await getArticles(request, '?limit=5&offset=5');
    expectArticlesShape(second);
    expect(second.pagination.offset).toBe(5);
    expect(second.data.length).toBeGreaterThan(0);

    const firstIds = first.data.map((a) => a.id).filter(Boolean);
    const secondIds = second.data.map((a) => a.id).filter(Boolean);
    expect(firstIds.length).toBeGreaterThan(0);
    expect(secondIds.length).toBeGreaterThan(0);

    // A page-2 request that hands back page 1 is the bug this guards (`offset`
    // used to be string-concatenated, producing a 2000-row window from offset 0).
    // Asserted as "page 2 is not page 1" rather than strict disjointness: rows
    // sharing a published_at can legitimately swap order between two queries.
    expect(secondIds, 'offset=5 returned exactly the offset=0 page').not.toEqual(firstIds);
    const fresh = secondIds.filter((id) => !firstIds.includes(id));
    expect(fresh.length, 'offset=5 returned no rows beyond the offset=0 page').toBeGreaterThan(0);

    // `total` describes the whole result set, so it is stable across pages.
    expect(second.pagination.total).toBe(first.pagination.total);
    expect(first.pagination.hasMore).toBe(true);
  });

  test('hasMore is false once the window runs past the end', async ({ request }) => {
    const head = await getArticles(request, '?limit=1&offset=0');
    expectArticlesShape(head);
    test.skip(head.pagination.total > 90_000, 'total is near the API offset ceiling');

    // +100 rather than exactly `total`: the scraper may publish a row between the
    // two requests, and that must not turn into a flaky failure.
    const past = await getArticles(request, `?limit=1&offset=${head.pagination.total + 100}`);
    expectArticlesShape(past);
    expect(past.data.length).toBe(0);
    expect(past.pagination.hasMore).toBe(false);
  });

  test('search and source narrow `total`, not just the page', async ({ request }) => {
    const all = await getArticles(request, '?limit=1');
    expectArticlesShape(all);

    const searched = await getArticles(request, '?limit=1&search=poker');
    expectArticlesShape(searched);
    expect(searched.pagination.total).toBeLessThanOrEqual(all.pagination.total);

    const sourced = await getArticles(request, '?limit=1&source=PokerNews');
    expectArticlesShape(sourced);
    expect(sourced.pagination.total).toBeLessThanOrEqual(all.pagination.total);
  });

  test('rejects a view-count POST for a non-UUID article id', async ({ request }) => {
    const res = await request.post(ARTICLES, { data: { id: 'empty-box-1' } });
    expect(res.status()).toBe(400);

    const missing = await request.post(ARTICLES, { data: {} });
    expect(missing.status()).toBe(400);
  });
});

test.describe('11. News API — Maintenance Routes Reject Anonymous Callers', () => {
  /**
   * Routes guarded by CRON_SECRET / ADMIN_API_KEY in EVERY environment.
   *
   * `mayBeUndeployed` marks routes that are new in this change set: a 404 means
   * the target deployment predates them, which is a deploy-ordering fact rather
   * than a security failure, so those skip. An existing route can never answer
   * 404, so this cannot mask a real regression.
   */
  const GUARDED: Array<{
    path: string;
    methods: Array<'get' | 'post' | 'delete'>;
    mayBeUndeployed?: boolean;
  }> = [
    { path: '/api/news/fix-images', methods: ['get', 'post'] },
    { path: '/api/news/refetch-images', methods: ['get', 'post'] },
    { path: '/api/news/cleanup-google', methods: ['get', 'post', 'delete'] },
    { path: '/api/news/digest', methods: ['get', 'post'], mayBeUndeployed: true },
    { path: '/api/news/notify-new', methods: ['get', 'post'], mayBeUndeployed: true },
  ];

  for (const { path, methods, mayBeUndeployed } of GUARDED) {
    test(`${path} answers 401 without credentials`, async ({ request }) => {
      for (const method of methods) {
        const res =
          method === 'delete'
            ? await request.delete(path)
            : method === 'post'
              ? await request.post(path)
              : await request.get(path);
        test.skip(
          !!mayBeUndeployed && res.status() === 404,
          `${path} is not deployed to this environment yet`,
        );
        expect(res.status(), `${method.toUpperCase()} ${path} must not be open`).toBe(401);
      }
    });
  }

  test('?dryRun=1 does not bypass the digest/notify auth gate', async ({ request }) => {
    for (const path of ['/api/news/digest', '/api/news/notify-new']) {
      const res = await request.get(`${path}?dryRun=1`);
      test.skip(res.status() === 404, `${path} is not deployed to this environment yet`);
      expect(res.status(), `${path}?dryRun=1 must still require credentials`).toBe(401);
    }
  });

  // show-images and debug-extraction deliberately stay open OUTSIDE production
  // (their own guard returns true when NODE_ENV !== 'production'), so this only
  // asserts the production behaviour: hidden behind a 404.
  test('debug routes are hidden in production', async ({ request, baseURL }) => {
    test.skip(
      !/smarter\.poker/i.test(baseURL || ''),
      'show-images/debug-extraction are intentionally open outside production',
    );

    for (const path of ['/api/news/show-images', '/api/news/debug-extraction']) {
      const res = await request.get(path);
      expect([401, 403, 404], `GET ${path} returned ${res.status()}`).toContain(res.status());
    }
  });
});
