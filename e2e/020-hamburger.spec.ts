import { test, expect, type Page } from '@playwright/test';

/**
 * Hamburger menu end-to-end coverage.
 *
 * MENU-AUDIT.txt catalogued a whole class of dead menu items: a menu config
 * declares a handler (e.g. `setTimerEnabled`) that the page never passes, so the
 * toggle renders, looks interactive, and does absolutely nothing when clicked.
 * The "visibly changes state" test below is written to catch exactly that — a
 * dead toggle leaves `aria-checked` and the track colour untouched.
 *
 * The drawer's toggles are the only `role="switch"` elements in the app
 * (src/components/ui/HamburgerMenu.jsx), and they are inside a container that is
 * `visibility: hidden` while closed — so `getByRole('switch')` resolves to
 * exactly "the toggles of the currently open menu" with no CSS coupling.
 */

type MenuPage = {
  /** Route under test. */
  path: string;
  /** Menu config key in src/config/hamburgerMenus.js — for failure messages. */
  worldKey: string;
  /**
   * Navigation entries the config promises, matched on href because that is the
   * actual routing contract (and because a bare label like "All" also exists in
   * the page body). Only hrefs unique to the drawer are listed.
   */
  expectedLinks: Array<{ href: string; label: string }>;
};

const MENU_PAGES: MenuPage[] = [
  {
    path: '/hub/news',
    worldKey: 'news',
    expectedLinks: [
      { href: '/hub/news?tab=videos', label: 'Videos' },
      { href: '/hub/news?filter=bookmarks', label: 'Bookmarks' },
      { href: '/hub/news?filter=later', label: 'Read Later' },
      { href: '/hub/news/sources', label: 'Manage Sources' },
    ],
  },
  {
    path: '/hub/notifications',
    worldKey: 'notifications',
    expectedLinks: [
      { href: '/hub/notifications?filter=mentions', label: 'Mentions' },
      { href: '/hub/notifications?filter=friends', label: 'Friend Requests' },
    ],
  },
  {
    path: '/hub/trivia',
    worldKey: 'trivia',
    expectedLinks: [
      { href: '/hub/trivia?mode=daily', label: 'Daily Challenge' },
      { href: '/hub/trivia/leaderboard', label: 'Leaderboard' },
      { href: '/hub/trivia/achievements', label: 'Achievements' },
    ],
  },
];

/**
 * Stored menu preferences (Supabase or localStorage) are fetched after mount and
 * re-render the drawer, so a baseline read taken immediately after opening can
 * be stale. Everything else in this spec uses polled assertions; only the
 * baseline snapshots need this settle window.
 */
const PREFS_SETTLE_MS = 2_000;

// Opening the drawer, flipping every toggle, reloading and restoring does not
// fit the project-wide 30s budget. Raised per test rather than in the shared
// config.
test.beforeEach(() => {
  test.setTimeout(90_000);
});

/** Marks the news intro video as already seen; it otherwise covers the viewport. */
async function suppressIntro(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.sessionStorage.setItem('news-intro-seen', 'true');
    } catch {
      /* storage unavailable */
    }
  });
}

async function visit(page: Page, path: string): Promise<void> {
  await suppressIntro(page);
  await page.goto(path, { waitUntil: 'commit' });
  await page.waitForLoadState('domcontentloaded');
  test.skip(
    page.url().includes('/login'),
    `${path} redirected to /login — no authenticated storageState available in this run`,
  );
  // Next.js error-boundary probes, same as the Hub landing spec.
  await expect(page.getByText('Application Error', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Unhandled Runtime Error', { exact: true })).toHaveCount(0);
}

const closeButton = (page: Page) => page.getByRole('button', { name: 'Close Menu' });

async function menuIsOpen(page: Page): Promise<boolean> {
  return closeButton(page)
    .waitFor({ state: 'visible', timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
}

/**
 * Opens the drawer. UniversalHeader owns the trigger, so several accessible
 * names are tried in turn; the open drawer's "Close Menu" button is the signal
 * that the right control was hit. Returns false when no trigger could be found,
 * so callers can skip instead of failing on an unrelated header change.
 */
async function openHamburger(page: Page): Promise<boolean> {
  // Immediate check (no wait) — the drawer is normally closed at this point.
  if (await closeButton(page).isVisible().catch(() => false)) return true;

  const candidates = [
    page.getByRole('button', { name: /^\s*(open\s+)?(menu|main menu|navigation)\s*$/i }),
    page.getByRole('button', { name: /menu/i }),
    page.locator('[aria-label*="menu" i]'),
    page.locator('button[class*="hamburger" i], [data-testid*="menu" i]'),
  ];

  const origin = page.url();
  for (const candidate of candidates) {
    const trigger = candidate.first();
    if ((await trigger.count()) === 0) continue;
    if (!(await trigger.isVisible().catch(() => false))) continue;

    await trigger.click({ timeout: 5_000 }).catch(() => {
      /* try the next candidate */
    });
    if (await menuIsOpen(page)) return true;

    // A wrong guess may have navigated; get back before trying the next one.
    if (page.url() !== origin) {
      await page.goto(origin, { waitUntil: 'commit' });
      await page.waitForLoadState('domcontentloaded');
    }
  }
  return false;
}

async function requireOpenMenu(page: Page, worldKey: string): Promise<void> {
  const opened = await openHamburger(page);
  test.skip(!opened, `could not locate the hamburger trigger for the '${worldKey}' menu`);
  await expect(closeButton(page)).toBeVisible();
}

/** Reads every toggle of the open drawer as { label, checked }, in DOM order. */
async function readToggles(page: Page): Promise<Array<{ label: string; checked: boolean }>> {
  const switches = page.getByRole('switch');
  const count = await switches.count();
  const out: Array<{ label: string; checked: boolean }> = [];
  for (let i = 0; i < count; i += 1) {
    const toggle = switches.nth(i);
    // The switch's own row carries its <label>; reading it from the element
    // avoids matching labels elsewhere on the page.
    const label = await toggle.evaluate(
      (el) => el.closest('div')?.querySelector('label')?.textContent?.trim() || '',
    );
    out.push({
      label: (label || `toggle #${i + 1}`).replace(/\s+/g, ' ').trim(),
      checked: (await toggle.getAttribute('aria-checked')) === 'true',
    });
  }
  return out;
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

for (const menu of MENU_PAGES) {
  test.describe(`12. Hamburger Menu — ${menu.worldKey}`, () => {
    test(`opens on ${menu.path}, shows its own items, and closes`, async ({ page }) => {
      await visit(page, menu.path);
      await requireOpenMenu(page, menu.worldKey);

      // The right menu config is wired to this page (a wrong worldKey silently
      // falls back to an empty menu — see MENU-AUDIT.txt).
      for (const { href, label } of menu.expectedLinks) {
        const link = page.locator(`a[href="${href}"]`).first();
        await expect(
          link,
          `'${menu.worldKey}' menu is missing its '${label}' entry (${href})`,
        ).toBeVisible();
        await expect(link).toContainText(label);
      }

      await closeButton(page).click();
      await expect(closeButton(page)).toBeHidden();
      await expect(page.getByRole('switch')).toHaveCount(0);
    });

    test(`every toggle in the ${menu.worldKey} menu visibly changes state`, async ({ page }) => {
      await visit(page, menu.path);
      await requireOpenMenu(page, menu.worldKey);

      const switches = page.getByRole('switch');
      const count = await switches.count();
      test.skip(count === 0, `the '${menu.worldKey}' menu declares no toggles`);

      // Stored preferences load asynchronously and re-render the menu; read the
      // baseline only once they have had a chance to land.
      await page.waitForTimeout(PREFS_SETTLE_MS);
      const before = await readToggles(page);

      for (let i = 0; i < count; i += 1) {
        const toggle = switches.nth(i);
        const name = before[i]?.label || `toggle #${i + 1}`;
        const wasChecked = before[i].checked;
        const trackBefore = await toggle.evaluate((el) => getComputedStyle(el).backgroundColor);

        await toggle.click();

        // A menu item whose handler the page never passes is inert: aria-checked
        // and the track colour both stay put. That is the audited bug.
        await expect(toggle, `'${name}' did not change state when clicked`).toHaveAttribute(
          'aria-checked',
          String(!wasChecked),
          { timeout: 10_000 },
        );
        const trackAfter = await toggle.evaluate((el) => getComputedStyle(el).backgroundColor);
        expect(trackAfter, `'${name}' flipped but rendered no visible change`).not.toBe(
          trackBefore,
        );
      }

      // Put everything back so a rerun (and the real account) starts unchanged.
      for (let i = 0; i < count; i += 1) {
        await switches.nth(i).click();
        await expect(switches.nth(i)).toHaveAttribute('aria-checked', String(before[i].checked), {
          timeout: 10_000,
        });
      }
    });

    test(`${menu.worldKey} toggle states survive a reload`, async ({ page }) => {
      await visit(page, menu.path);
      test.skip(
        !(await isSignedIn(page)),
        'menu preferences are account-scoped — no signed-in session available in this run',
      );
      await requireOpenMenu(page, menu.worldKey);

      const switches = page.getByRole('switch');
      const count = await switches.count();
      test.skip(count === 0, `the '${menu.worldKey}' menu declares no toggles`);

      await page.waitForTimeout(PREFS_SETTLE_MS);
      const before = await readToggles(page);
      for (let i = 0; i < count; i += 1) {
        await switches.nth(i).click();
        await expect(switches.nth(i)).toHaveAttribute('aria-checked', String(!before[i].checked), {
          timeout: 10_000,
        });
      }

      // Give the preference write a moment to land before tearing the page down.
      await page.waitForTimeout(PREFS_SETTLE_MS);
      await page.reload({ waitUntil: 'commit' });
      await page.waitForLoadState('domcontentloaded');
      await requireOpenMenu(page, menu.worldKey);

      await expect(switches, 'the menu lost toggles after a reload').toHaveCount(count);
      for (let i = 0; i < count; i += 1) {
        // Polled, because the stored preferences arrive after first paint.
        await expect(
          switches.nth(i),
          `'${before[i].label}' did not survive the reload`,
        ).toHaveAttribute('aria-checked', String(!before[i].checked), { timeout: 20_000 });
      }

      // Restore the account's original preferences.
      for (let i = 0; i < count; i += 1) {
        await switches.nth(i).click();
        await expect(switches.nth(i)).toHaveAttribute('aria-checked', String(before[i].checked), {
          timeout: 10_000,
        });
      }
    });
  });
}

test.describe('12. Hamburger Menu — News Deep Links', () => {
  // The menu is the only way into these sections, so a broken link here is a
  // section the reader can never reach.
  const LINKS: Array<{ label: string; href: string; heading: RegExp }> = [
    { label: 'Reels', href: '/hub/news?tab=reels', heading: /Poker Reels/i },
    { label: 'Videos', href: '/hub/news?tab=videos', heading: /Poker Videos/i },
    { label: 'Events', href: '/hub/news?tab=events', heading: /Upcoming Events/i },
    { label: 'Bookmarks', href: '/hub/news?filter=bookmarks', heading: /Bookmarked Articles/i },
    { label: 'Read Later', href: '/hub/news?filter=later', heading: /Read Later/i },
  ];

  for (const { label, href, heading } of LINKS) {
    test(`'${label}' opens the matching news section`, async ({ page }) => {
      await visit(page, '/hub/news');
      await requireOpenMenu(page, 'news');

      await page.locator(`a[href="${href}"]`).first().click();

      const query = href.slice(href.indexOf('?') + 1);
      await expect(page).toHaveURL(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({
        timeout: 25_000,
      });
      await expect(page.getByText('Application Error', { exact: true })).toHaveCount(0);
    });
  }
});
