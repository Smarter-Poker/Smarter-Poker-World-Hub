import { test, expect, type Page } from '@playwright/test';
import { installRealtimeSessionGuard } from './fixtures/realtimeSessionGuard';

// #SmarterDesign (Dan, 2026-11-27): ONE thin chrome frame per section, never a
// framed card inside a framed section. A frame is any element under <main>
// whose computed border-image-source is not 'none'. Allowed inside a frame:
// controls (buttons, inputs, selects, pill buttons, owner tool link buttons)
// and the stat readout tiles.
// The shared SEO conversion panel is owned by another team and is skipped.
//
// Runs against the compiled build with the isolated learning catalog through
// scripts/qualification/videoLibraryOneFrameBrowser.mjs (Global Footer E2E).

const OWNER = '33333333-3333-4333-8333-333333333333';
const CHANNEL = '11111111-1111-4111-8111-111111111111';
const PLAYLIST = '44444444-4444-4444-8444-444444444444';
const VIDEO_ID = 'phase7v0000';
const VIDEO = { id: VIDEO_ID, videoId: VIDEO_ID, source: 'HCL', sourceName: 'Channel Contract Poker', title: 'Daniel Negreanu Poker Decision', tags: ['Daniel Negreanu'], type: 'cash', duration: '18:42', availabilityStatus: 'verified', embeddable: true, availabilityCheckedAt: new Date().toISOString() };
const SNAPSHOT = { generatedAt: '2026-10-14T00:00:00Z', windowHours: 24, organicSessions: 3,
    sources: [{ active: 6 }], candidates: [{ status: 'published', count: 5 }, { status: 'approved', count: 20 }],
    moderationCases: [{ status: 'submitted', count: 2 }], jobs: [{ status: 'dead_letter', count: 4 }], controls: [{ control_key: 'video_library_discovery', enabled: true }] };

test.beforeEach(async ({ context }) => {
    await installRealtimeSessionGuard(context);
});

async function common(page: Page) {
    await page.route('https://www.youtube-nocookie.com/embed/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Isolated Provider</title>' }));
    await page.route('https://i.ytimg.com/**', route => route.fulfill({ status: 404, body: '' }));
    await page.route('**/api/video-library/catalog**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: [VIDEO], pagination: { total: 1, hasMore: false } }) }));
    await page.route('**/api/video-library/live**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: [], checkedAt: new Date().toISOString(), unavailableChannels: 0 }) }));
    await page.route('**/api/reels/feed**', route => route.fulfill({ contentType: 'application/json', body: '{"success":true,"reels":[],"data":[],"hasMore":false,"nextCursor":null}' }));
    await page.route('**/api/vip/check-status**', route => route.fulfill({ contentType: 'application/json', body: '{"isVip":false}' }));
}

async function signedIn(page: Page) {
    await page.addInitScript(({ owner }) => {
        const user = { id: owner, email: 'one-frame-fixture@example.invalid', user_metadata: {} };
        localStorage.setItem('smarter-poker-auth', JSON.stringify({ access_token: 'local-browser-fixture-only', refresh_token: 'local-browser-fixture-only', expires_at: Math.floor(Date.now() / 1000) + 3600, user }));
    }, { owner: OWNER });
    await page.route('**/auth/v1/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: OWNER, email: 'one-frame-fixture@example.invalid' }) }));
    await page.route('**/rest/v1/**', route => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith('/video_playlists')) {
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: PLAYLIST, user_id: OWNER, name: 'River Study', created_at: '2026-10-01T00:00:00Z', items: [{ id: VIDEO_ID, video_id: VIDEO_ID, sort_order: 0, created_at: '2026-10-01T00:00:00Z' }] }) });
        }
        return route.fulfill({ contentType: 'application/json', body: '[]' });
    });
    await page.route('**/api/admin/video-operations**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ snapshot: SNAPSHOT }) }));
}

type Nested = { outer: string; inner: string };

// Every framed element under <main> that sits inside another framed element.
async function nestedFrames(page: Page): Promise<{ frames: number; nested: Nested[] }> {
    return page.evaluate(() => {
        const main = document.querySelector('main');
        if (!main) throw new Error('No <main> landmark on this page.');
        // .vl-console-tool is an owner-tool link styled as a button ("Open Sources").
        const controls = 'button, input, select, textarea, .vl-pill-button, .vl-console-tool';
        const tiles = '.vl-console-stat, .vl-console-controls li, .vl-study-readout';
        const isSeoPanel = (el: Element) => Boolean(el.closest('[class*="SmarterSeoKit"], [class*="sd-conv"]'));
        const describe = (el: Element) => {
            const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.') : '';
            const tutorial = el.getAttribute('data-tutorial');
            return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}${tutorial ? `[data-tutorial=${tutorial}]` : ''}`;
        };
        const framed = [...main.querySelectorAll('*')].filter(el => {
            const style = getComputedStyle(el);
            if (style.borderImageSource === 'none' || style.display === 'none') return false;
            if (el.matches(controls) || el.closest(controls)) return false;
            if (el.matches(tiles) || el.closest(tiles)) return false;
            return !isSeoPanel(el);
        });
        const nested: { outer: string; inner: string }[] = [];
        for (const inner of framed) {
            const outer = framed.find(candidate => candidate !== inner && candidate.contains(inner));
            if (outer) nested.push({ outer: describe(outer), inner: describe(inner) });
        }
        return { frames: framed.length, nested };
    });
}

const PAGES: { name: string; path: string; auth?: boolean; ready: (page: Page) => Promise<void> }[] = [
    { name: 'index', path: '/hub/video-library', ready: page => expect(page.locator('#video-library-grid .vl-video-card, #video-library-grid [class*="card"]').first()).toBeVisible() },
    { name: 'channels', path: '/hub/video-library/channels', ready: page => expect(page.locator('[data-tutorial="channel-directory"]')).toBeVisible() },
    { name: 'channel', path: `/hub/video-library/channels/${CHANNEL}`, ready: page => expect(page.locator('[data-tutorial="channel-videos"]')).toBeVisible() },
    { name: 'players', path: '/hub/video-library/players', ready: page => expect(page.locator('[data-tutorial="player-directory"]')).toBeVisible() },
    { name: 'player', path: '/hub/video-library/players/daniel-negreanu', ready: page => expect(page.locator('[data-tutorial="player-videos"]')).toBeVisible() },
    { name: 'playlist', path: `/hub/video-library/playlists/${PLAYLIST}`, auth: true, ready: page => expect(page.locator('[data-tutorial="playlist-videos"]')).toBeVisible() },
    { name: 'owner', path: '/hub/video-library/owner', auth: true, ready: page => expect(page.locator('[data-tutorial="owner-pipeline"]')).toBeVisible() },
    { name: 'watch', path: `/hub/video-library/watch/${VIDEO_ID}/daniel-negreanu-poker-decision`, ready: page => expect(page.locator('[data-tutorial="watch-more"]')).toBeAttached() },
];

test.describe('Video Library One Frame Per Section', () => {
    for (const target of PAGES) {
        test(`${target.name} never nests a framed card inside a framed section`, async ({ page }) => {
            await common(page);
            if (target.auth) await signedIn(page);
            await page.goto(target.path, { waitUntil: 'domcontentloaded' });
            await expect(page.locator('[data-video-library-mast]')).toBeVisible();
            await target.ready(page);
            await page.waitForLoadState('load');
            const result = await nestedFrames(page);
            expect(result.frames, `${target.name} should render at least one framed section`).toBeGreaterThan(0);
            expect(result.nested, `${target.name} nests a frame inside a frame`).toEqual([]);
        });
    }
});
