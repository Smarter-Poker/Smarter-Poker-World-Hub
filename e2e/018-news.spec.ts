import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * News Hub end-to-end coverage.
 *
 * Every behaviour asserted here regressed at least once in production, so each
 * test is written against the user-visible contract rather than internal state:
 *   - the feed renders REAL articles (never the FALLBACK_NEWS placeholders)
 *   - the search input survives typing (it used to be unmounted mid-keystroke)
 *   - source chips filter and the clear chip restores
 *   - the grid/list toggle persists
 *   - bookmarks persist across a reload
 *   - the reel viewer opens without throwing (an undefined helper crashed it)
 *   - j/k/Enter keyboard navigation
 *   - every hamburger deep link lands on the right section
 *
 * Selectors are role/text based wherever the markup exposes a role or an
 * accessible name. The handful of class hooks used below (`.news-box`,
 * `.news-list-item`, `.news-grid`, `.source-filters`, `.keyboard-focused`) are
 * single stable class names that the page uses as its own structural
 * identifiers — not brittle descendant chains — and there is no ARIA
 * alternative for them today.
 */

const NEWS_PATH = '/hub/news';

// The news hub loads six feeds (articles, source boxes, reels, videos, events,
// MSPT) before it settles, and several tests reload the page. The project-wide
// 30s budget is not enough for that; raise it per test rather than editing the
// shared config.
test.beforeEach(() => {
  test.setTimeout(90_000);
});

// Runtime-crash signatures. A thrown ReferenceError/TypeError (e.g. the
// undefined reel helper) produces no visible DOM change in a production build,
// so the only way to catch it is to listen on 'pageerror'.
const CRASH_SIGNATURES =
  /(is not a function|is not defined|Cannot read propert|undefined is not an object|null is not an object)/i;

type FeedPayload = {
  success?: boolean;
  data?: Array<Record<string, unknown>>;
  pagination?: { limit?: number; offset?: number; total?: number; hasMore?: boolean };
};

function watchForCrashes(page: Page): string[] {
  const crashes: string[] = [];
  page.on('pageerror', (err) => {
    const message = String((err as Error)?.message ?? err);
    if (CRASH_SIGNATURES.test(message)) crashes.push(message);
  });
  return crashes;
}

async function expectNoCrash(page: Page, crashes: string[]): Promise<void> {
  // Same Next.js error-boundary probes the Hub landing spec uses.
  await expect(page.getByText('Application Error', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Unhandled Runtime Error', { exact: true })).toHaveCount(0);
  await expect(page.getByText('An unexpected error has occurred', { exact: false })).toHaveCount(0);
  expect(crashes, `uncaught runtime errors: ${crashes.join(' | ')}`).toEqual([]);
}

/**
 * Loads /hub/news and returns the first page of the articles feed.
 *
 * The intro video overlay covers the whole viewport on the first visit of a
 * session and would intercept every click, so it is marked seen before any page
 * script runs — exactly what the overlay's own Skip button does.
 */
async function loadNews(page: Page, query = ''): Promise<FeedPayload> {
  await page.addInitScript(() => {
    try {
      window.sessionStorage.setItem('news-intro-seen', 'true');
    } catch {
      /* storage unavailable (private mode) — the Skip button still works */
    }
  });

  // The page issues several /api/news/articles GETs (the MSPT sidebar box is one
  // of them); `offset=0` uniquely identifies the main feed request.
  const feedResponse = page
    .waitForResponse(
      (res) =>
        res.request().method() === 'GET' &&
        res.url().includes('/api/news/articles') &&
        res.url().includes('offset=0'),
      { timeout: 30_000 },
    )
    .catch(() => null);

  await page.goto(`${NEWS_PATH}${query}`, { waitUntil: 'commit' });

  const heading = page.getByRole('heading', { name: /SMARTER\.POKER/i });
  try {
    await expect(heading).toBeVisible({ timeout: 25_000 });
  } catch (err) {
    test.skip(
      page.url().includes('/login'),
      'redirected to /login — no authenticated storageState available in this run',
    );
    throw err;
  }

  const res = await feedResponse;
  if (!res) return {};
  try {
    return (await res.json()) as FeedPayload;
  } catch {
    return {};
  }
}

/** Rendered article surfaces: source-box cards and "More Stories" rows. */
function feedCards(page: Page): Locator {
  return page.locator('.news-box, .news-list-item');
}

const BOOKMARK_BUTTON = /Bookmark article|Remove bookmark/;

/** Source-box cards that carry a real article (placeholders have no actions). */
function bookmarkableCard(page: Page): Locator {
  return page
    .locator('.news-box')
    .filter({ has: page.getByRole('button', { name: BOOKMARK_BUTTON }) });
}

/** Waits for the feed to settle, then skips when the environment has no data. */
async function requireArticles(page: Page, payload: FeedPayload): Promise<void> {
  await feedCards(page)
    .first()
    .waitFor({ state: 'visible', timeout: 25_000 })
    .catch(() => {
      /* handled by the skip below */
    });
  const rendered = await feedCards(page).count();
  test.skip(
    rendered === 0 || (payload.data ?? []).length === 0,
    'live news feed returned no articles in this environment',
  );
}

/** True when this run carries a real signed-in session. */
async function isSignedIn(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    try {
      if (window.localStorage.getItem('sp-social-user')) return true;
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i) || '';
        if (/^sb-.*-auth-token$/.test(key) && window.localStorage.getItem(key)) return true;
      }
    } catch {
      /* storage unavailable */
    }
    return false;
  });
}

test.describe('10. News Hub — Feed Rendering', () => {
  test('renders real articles from the API and does not crash on load', async ({ page }) => {
    const crashes = watchForCrashes(page);
    const payload = await loadNews(page);
    await requireArticles(page, payload);

    // Contract 1: the response shape the page is built on.
    expect(payload.success).toBe(true);
    expect(Array.isArray(payload.data)).toBe(true);
    expect(payload.pagination, 'GET /api/news/articles must return a pagination block').toBeTruthy();

    // Real data, not the FALLBACK_NEWS placeholders: at least one headline the
    // API actually returned has to be on screen.
    const titles = (payload.data ?? [])
      .map((a) => String(a.title ?? '').replace(/\s+/g, ' ').trim())
      .filter((t) => t.length > 12)
      .slice(0, 24);
    expect(titles.length, 'API returned no usable headlines').toBeGreaterThan(0);

    let matched: string | null = null;
    for (const title of titles) {
      const probe = title.slice(0, 45);
      if (await page.getByText(probe, { exact: false }).first().isVisible().catch(() => false)) {
        matched = title;
        break;
      }
    }
    expect(matched, 'none of the API headlines were rendered in the feed').not.toBeNull();

    await expectNoCrash(page, crashes);
  });

  test('emits a schema.org ItemList of the visible headlines', async ({ page }) => {
    const payload = await loadNews(page);
    await requireArticles(page, payload);

    // SEOHead emits its own JSON-LD blocks, so look for the ItemList among them.
    const blocks = page.locator('head script[type="application/ld+json"]');
    await blocks.first().waitFor({ state: 'attached', timeout: 15_000 }).catch(() => {
      /* handled by the skip below */
    });
    const raws = (await blocks.allTextContents()).filter(Boolean);
    const itemList = raws.find((raw) => raw.includes('"ItemList"'));
    test.skip(!itemList, 'no ItemList JSON-LD rendered for this feed');

    // Contract 5: every '<' is escaped, so a headline cannot close the script tag.
    expect(itemList as string).not.toContain('<');
    const parsed = JSON.parse(itemList as string);
    expect(parsed['@type']).toBe('ItemList');
    expect(Array.isArray(parsed.itemListElement)).toBe(true);
    expect(parsed.itemListElement.length).toBeGreaterThan(0);
    for (const entry of parsed.itemListElement) {
      expect(String(entry.name || '').trim().length, 'JSON-LD entries must carry a real headline')
        .toBeGreaterThan(0);
    }
  });
});

test.describe('10. News Hub — Search', () => {
  test('typing never remounts the search input and results update', async ({ page }) => {
    const crashes = watchForCrashes(page);
    const payload = await loadNews(page);
    await requireArticles(page, payload);

    const search = page.getByPlaceholder('Search articles...');
    await expect(search).toBeVisible();

    // Stamp the live DOM node. React keeps an imperatively-set attribute across
    // re-renders, so if the attribute is gone afterwards the element was
    // unmounted and remounted — the exact regression that shipped once.
    await search.evaluate((el) => el.setAttribute('data-e2e-search-node', 'original'));

    // `search=poker` specifically — the MSPT sidebar box also queries this route
    // with a `search=` param and would otherwise satisfy the predicate.
    const searched = page
      .waitForRequest(
        (req) => req.url().includes('/api/news/articles') && req.url().includes('search=poker'),
        { timeout: 20_000 },
      )
      .catch(() => null);

    await search.click();
    await search.pressSequentially('poker', { delay: 120 });

    await expect(search).toHaveAttribute('data-e2e-search-node', 'original');
    await expect(search).toHaveValue('poker');
    await expect(search).toBeFocused();

    // Results update: the debounced query reaches the server, and the feed shows
    // suggestions, filtered stories, or an explicit empty state — never nothing.
    expect(await searched, 'the debounced search never reached /api/news/articles').not.toBeNull();
    const suggestions = page.getByRole('listbox');
    const emptyState = page.getByText(/No articles found for/i);
    const storyHeading = page.getByRole('heading', { name: /More Stories|Filtered Stories/i });
    await expect(suggestions.or(emptyState).or(storyHeading).first()).toBeVisible({
      timeout: 20_000,
    });

    // Clearing keeps the very same input alive too.
    await search.fill('');
    await expect(search).toHaveAttribute('data-e2e-search-node', 'original');
    await expect(search).toHaveValue('');

    await expectNoCrash(page, crashes);
  });
});

test.describe('10. News Hub — Filters & Layout', () => {
  test('source chips filter the feed and the clear chip restores it', async ({ page }) => {
    const crashes = watchForCrashes(page);
    const payload = await loadNews(page);
    await requireArticles(page, payload);

    const chips = page.locator('.source-filters').getByRole('button');
    await expect(chips.first()).toBeVisible({ timeout: 20_000 });

    // Chips render "<source><count>", and only chips with a count have articles
    // behind them. Pick the busiest one so the filtered feed is never empty.
    const labels = await chips.allInnerTexts();
    let index = -1;
    let source = '';
    let best = 0;
    for (let i = 0; i < labels.length; i += 1) {
      const text = labels[i].replace(/\s+/g, ' ').trim();
      const match = text.match(/^(.+?)\s*(\d+)$/);
      if (!match || /^clear$/i.test(match[1].trim())) continue;
      const count = Number(match[2]);
      if (count > best) {
        best = count;
        index = i;
        source = match[1].trim();
      }
    }
    test.skip(index < 0, 'no source chip reported any articles in this environment');

    const rows = page.locator('.news-list-item');
    const before = await rows.count();

    await chips.nth(index).click();

    await expect(page.getByRole('heading', { name: /Filtered Stories/i }).first()).toBeVisible({
      timeout: 15_000,
    });
    // Every remaining row belongs to the chosen source.
    await expect(rows.filter({ hasNotText: source })).toHaveCount(0);
    const filtered = await rows.count();
    expect(filtered).toBeLessThanOrEqual(before);

    const clearChip = page.locator('.source-filters').getByRole('button', { name: /^Clear$/ });
    await expect(clearChip).toBeVisible();
    await clearChip.click();

    await expect(page.getByRole('heading', { name: /More Stories/i }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(clearChip).toHaveCount(0);
    expect(await rows.count()).toBeGreaterThanOrEqual(filtered);

    await expectNoCrash(page, crashes);
  });

  test('grid/list view toggle switches layout and persists across a reload', async ({ page }) => {
    const crashes = watchForCrashes(page);
    const payload = await loadNews(page);
    await requireArticles(page, payload);

    const grid = page.locator('.news-grid').first();
    await expect(grid).toBeVisible({ timeout: 20_000 });

    // Switch to whichever mode is NOT active, so the test does not depend on the
    // storageState's saved preference.
    const initial =
      (await page.evaluate(() => window.localStorage.getItem('news_view_mode'))) === 'list'
        ? 'list'
        : 'grid';
    const target = initial === 'list' ? 'grid' : 'list';
    const listClass = /news-grid-list/;

    await page.getByTitle(target === 'list' ? 'List View' : 'Grid View').click();
    if (target === 'list') {
      await expect(grid).toHaveClass(listClass);
    } else {
      await expect(grid).not.toHaveClass(listClass);
    }
    expect(await page.evaluate(() => window.localStorage.getItem('news_view_mode'))).toBe(target);

    await page.reload({ waitUntil: 'commit' });
    const gridAfterReload = page.locator('.news-grid').first();
    await expect(gridAfterReload).toBeVisible({ timeout: 25_000 });
    if (target === 'list') {
      await expect(gridAfterReload).toHaveClass(listClass);
    } else {
      await expect(gridAfterReload).not.toHaveClass(listClass);
    }

    // Restore, so the persisted value does not leak into a rerun.
    await page.getByTitle(initial === 'list' ? 'List View' : 'Grid View').click();
    expect(await page.evaluate(() => window.localStorage.getItem('news_view_mode'))).toBe(initial);

    await expectNoCrash(page, crashes);
  });
});

test.describe('10. News Hub — Saving Articles', () => {
  test('bookmarking an article persists across a reload', async ({ page }) => {
    const crashes = watchForCrashes(page);
    const payload = await loadNews(page);
    await requireArticles(page, payload);
    test.skip(
      !(await isSignedIn(page)),
      'bookmarks are account-scoped — no signed-in session available in this run',
    );

    // Placeholder/error boxes also carry the .news-box class but have no quick
    // actions, so pick the first card that actually offers a bookmark control.
    const card = bookmarkableCard(page).first();
    test.skip((await card.count()) === 0, 'no bookmarkable article card rendered');
    await expect(card).toBeVisible({ timeout: 20_000 });
    const title = (await card.locator('h3').first().innerText()).replace(/\s+/g, ' ').trim();

    // The quick-action row only fades in on hover; hovering is what a user does.
    await card.hover();
    const bookmark = card.getByRole('button', { name: BOOKMARK_BUTTON });
    await expect(bookmark).toBeVisible();

    const wasPressed = (await bookmark.getAttribute('aria-pressed')) === 'true';
    await bookmark.click();
    await expect(bookmark).toHaveAttribute('aria-pressed', String(!wasPressed), { timeout: 15_000 });

    await page.reload({ waitUntil: 'commit' });
    await expect(page.getByRole('heading', { name: /SMARTER\.POKER/i })).toBeVisible({
      timeout: 25_000,
    });

    const sameCard = bookmarkableCard(page).filter({ hasText: title.slice(0, 40) }).first();
    await expect(sameCard).toBeVisible({ timeout: 25_000 });
    await sameCard.hover();
    const bookmarkAfter = sameCard.getByRole('button', { name: BOOKMARK_BUTTON });
    await expect(bookmarkAfter).toHaveAttribute('aria-pressed', String(!wasPressed), {
      timeout: 15_000,
    });

    // Restore the account's original state.
    await bookmarkAfter.click();
    await expect(bookmarkAfter).toHaveAttribute('aria-pressed', String(wasPressed), {
      timeout: 15_000,
    });

    await expectNoCrash(page, crashes);
  });

  test('guests are told to sign in rather than silently losing a bookmark', async ({ page }) => {
    const payload = await loadNews(page);
    await requireArticles(page, payload);
    test.skip(await isSignedIn(page), 'this run is signed in — guest path not exercised');

    const card = bookmarkableCard(page).first();
    test.skip((await card.count()) === 0, 'no bookmarkable article card rendered');
    await card.hover();
    await card.getByRole('button', { name: BOOKMARK_BUTTON }).click();

    await expect(page.getByText('Sign in to save bookmarks')).toBeVisible({ timeout: 10_000 });
  });

  test('Read Later saves the article itself, not the read history', async ({ page }) => {
    const crashes = watchForCrashes(page);
    const payload = await loadNews(page);
    await requireArticles(page, payload);

    // Read Later works for guests too (localStorage 'news_read_later'), so this
    // test runs in every environment. A "More Stories" row is used on purpose:
    // those come from the paginated feed, so the saved article is still
    // resolvable after a full reload.
    const row = page.locator('.news-list-item').first();
    test.skip((await row.count()) === 0, 'no "More Stories" rows rendered in this environment');
    await expect(row).toBeVisible({ timeout: 20_000 });

    const title = (await row.locator('h4').first().innerText()).replace(/\s+/g, ' ').trim();
    await row.hover();
    const saveForLater = row.getByRole('button', { name: 'Add to Read Later' });
    test.skip((await saveForLater.count()) === 0, 'this row is already saved for later');
    await saveForLater.click();
    await expect(row.getByRole('button', { name: 'Remove from Read Later' })).toBeVisible({
      timeout: 10_000,
    });

    const savedIds = await page.evaluate(() => {
      try {
        return JSON.parse(window.localStorage.getItem('news_read_later') || '[]');
      } catch {
        return [];
      }
    });
    expect(Array.isArray(savedIds), "'news_read_later' must hold a JSON array of ids").toBe(true);
    expect((savedIds as unknown[]).length).toBeGreaterThan(0);

    // Deep link into the queue. It must show what was SAVED — the section used
    // to render read history instead, which is a different list entirely.
    await loadNews(page, '?filter=later');
    await expect(page.getByRole('heading', { name: /Read Later/i }).first()).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByText(title.slice(0, 45), { exact: false }).first()).toBeVisible({
      timeout: 25_000,
    });
    // ...and nothing beyond the queue: read HISTORY is a longer, different list,
    // so a section rendering it would exceed the number of saved ids.
    expect(await page.locator('.news-grid .news-box').count()).toBeLessThanOrEqual(
      (savedIds as unknown[]).length,
    );

    // Clean up so a rerun starts from an empty queue.
    const saved = page.getByRole('button', { name: 'Remove from Read Later' }).first();
    if (await saved.count()) {
      await saved.click();
    }

    await expectNoCrash(page, crashes);
  });
});

test.describe('10. News Hub — Reels', () => {
  test('opening a reel does not crash the page', async ({ page }) => {
    const crashes = watchForCrashes(page);
    await loadNews(page, '?tab=reels');

    const reelCards = page.getByRole('button', { name: /^Play reel:/ });
    await reelCards
      .first()
      .waitFor({ state: 'visible', timeout: 25_000 })
      .catch(() => {
        /* handled by the skip below */
      });
    test.skip((await reelCards.count()) === 0, 'no reels published in this environment');

    await reelCards.first().click();

    const viewer = page.getByRole('dialog', { name: 'Reel viewer' });
    await expect(viewer).toBeVisible({ timeout: 15_000 });
    await expectNoCrash(page, crashes);

    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0, { timeout: 10_000 });
    await expectNoCrash(page, crashes);
  });
});

test.describe('10. News Hub — Keyboard Navigation', () => {
  test('j and k move focus and Enter opens the focused article', async ({ page }) => {
    const crashes = watchForCrashes(page);
    const payload = await loadNews(page);
    await requireArticles(page, payload);
    test.skip((await feedCards(page).count()) < 2, 'need at least two articles to move focus');

    // The handler ignores keystrokes while an input owns focus.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());

    const focused = page.locator('.keyboard-focused');

    await page.keyboard.press('j');
    await expect(focused).toHaveCount(1, { timeout: 10_000 });
    const first = (await focused.first().innerText()).replace(/\s+/g, ' ').trim();

    await page.keyboard.press('j');
    await expect(focused).toHaveCount(1);
    const second = (await focused.first().innerText()).replace(/\s+/g, ' ').trim();
    expect(second, 'j did not advance the keyboard focus').not.toBe(first);

    await page.keyboard.press('k');
    await expect(focused).toHaveCount(1);
    const back = (await focused.first().innerText()).replace(/\s+/g, ' ').trim();
    expect(back, 'k did not step the keyboard focus back').toBe(first);

    // Enter opens the focused article: the page records the view before showing
    // the reader, so the POST is the behavioural signal that survives any change
    // to the reader's markup.
    const viewPost = page.waitForRequest(
      (req) => req.url().includes('/api/news/articles') && req.method() === 'POST',
      { timeout: 15_000 },
    );
    await page.keyboard.press('Enter');
    await viewPost;

    await expectNoCrash(page, crashes);
  });
});

test.describe('10. News Hub — Deep Links', () => {
  // Every entry the hamburger menu can send the reader to (src/config/hamburgerMenus.js).
  const DEEP_LINKS: Array<{ query: string; heading: RegExp }> = [
    { query: '?tab=reels', heading: /Poker Reels/i },
    { query: '?tab=videos', heading: /Poker Videos/i },
    { query: '?tab=events', heading: /Upcoming Events/i },
    { query: '?filter=bookmarks', heading: /Bookmarked Articles/i },
    { query: '?filter=later', heading: /Read Later/i },
  ];

  for (const { query, heading } of DEEP_LINKS) {
    test(`${query} lands on the matching section`, async ({ page }) => {
      const crashes = watchForCrashes(page);
      await loadNews(page, query);

      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({
        timeout: 25_000,
      });
      await expectNoCrash(page, crashes);
    });
  }

  test('?tab=reels also marks the Reels tab as selected', async ({ page }) => {
    await loadNews(page, '?tab=reels');
    await expect(page.getByRole('tab', { name: /Reels/i })).toHaveAttribute(
      'aria-selected',
      'true',
      { timeout: 25_000 },
    );
    await expect(page.getByRole('tab', { name: /News/i })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });
});
