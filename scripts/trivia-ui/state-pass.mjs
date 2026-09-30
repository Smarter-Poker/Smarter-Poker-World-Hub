/**
 * TRIVIA STATE SCENARIOS (Phase 4 exit gate, p4-art). Companion to
 * a11y-pass.mjs: the states a plain page load never reaches.
 *
 *   BASE=http://127.0.0.1:3100 OUT=dir node scripts/trivia-ui/state-pass.mjs
 *
 * dialog      lobby Diamond Entry dialog: focus moves in, Tab stays in, Escape
 *             closes it and focus returns to the card that opened it
 * art-error   every intro art request fails: the box keeps its size and shows
 *             the art's own preview, and no broken image is visible
 * art-slow    intro art held back 6 s: the preview paints the box meanwhile
 * fast-scroll lobby flung to the bottom with slow pictures: no picture box in
 *             view is left empty
 * forced      forced colours: controls keep a visible boundary
 * long-copy   leaderboard with 40-character names and 9-digit scores: no
 *             horizontal overflow, nothing clipped past the console
 * Signed out and read-only: Supabase is answered locally, nothing is written.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:3100';
const OUT = process.env.OUT || 'trivia-state-out';
mkdirSync(join(OUT, 'states'), { recursive: true });
const report = {};
const ok = (name, pass, detail) => { report[name] = { pass, ...detail }; console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(detail).slice(0, 300)}`); };

const LONG = Array.from({ length: 12 }, (_, i) => ({
    user_id: `00000000-0000-0000-0000-00000000000${i % 10}`, username: `${'Supercalifragilisticexpialidocious'}Player${i}Longname`,
    mode: 'daily', score: 987654321 - i * 1000, correct_count: 10, total_questions: 10, play_date: '2026-09-30',
}));

async function context(browser, vp, { forced = false, rest = [] } = {}) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, reducedMotion: 'reduce', forcedColors: forced ? 'active' : 'none' });
    await ctx.route(/supabase\.co|auth\.smarter\.poker|realtime/, (route) => {
        const url = route.request().url();
        if (/\/auth\/v1\//.test(url)) return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
        if (/\/rest\/v1\/trivia_scores/.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rest) });
        if (/\/rest\/v1\/rpc\//.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await ctx.route(/googletagmanager|google-analytics|onesignal|doubleclick/, (r) => r.abort());
    return ctx;
}
const settle = async (page) => { await page.waitForLoadState('load').catch(() => {}); await page.evaluate(() => document.fonts && document.fonts.ready); await page.waitForTimeout(1200); };
const shot = (page, name) => page.screenshot({ path: join(OUT, 'states', `${name}.png`) });
const artBoxes = (page) => page.evaluate(() => [...document.querySelectorAll('[data-art]')].map((el) => {
    const r = el.getBoundingClientRect(); const img = el.querySelector('img');
    return { key: el.dataset.art, state: el.dataset.artState, w: Math.round(r.width), h: Math.round(r.height), inView: r.bottom > 0 && r.top < innerHeight,
        preview: getComputedStyle(el).backgroundImage.startsWith('url("data:image/webp'), decoded: Boolean(img && img.complete && img.naturalWidth > 0), imgVisible: img ? getComputedStyle(img).visibility : null };
}));

// Signed-in shots of the intros a signed-out visitor is redirected away from
// (Mixed; PvP and Tournaments also sit behind their release flags). A fixture
// session lives only in this browser: every Supabase and /api call is answered
// here, so nothing reaches a real account or database.
async function signedInShots(browser) {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const id = '00000000-0000-4000-8000-00000000f1f1';
    const user = { id, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.invalid', user_metadata: { username: 'Fixture Player' } };
    const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: id, role: 'authenticated', aud: 'authenticated', exp })}.fixture`;
    const session = { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'fixture', user };
    const routes = (process.env.SIGNED_IN_ROUTES || '/hub/trivia/mixed,/hub/trivia/pvp,/hub/trivia/tournaments').split(',');
    for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
        const ctx = await context(browser, vp);
        await ctx.addInitScript((value) => { try { localStorage.setItem('smarter-poker-auth', value); } catch {} }, JSON.stringify(session));
        await ctx.route(/\/auth\/v1\/(user|token)/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(/token/.test(r.request().url()) ? session : user) }));
        await ctx.route(/\/api\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
        const page = await ctx.newPage();
        for (const route of routes) {
            await page.goto((process.env.BASE_FLAGS && /pvp|tournaments/.test(route) ? process.env.BASE_FLAGS : BASE) + route); await settle(page); await page.waitForTimeout(1500);
            const boxes = await artBoxes(page); const at = new URL(page.url()).pathname;
            mkdirSync(join(OUT, 'shots'), { recursive: true });
            await page.screenshot({ path: join(OUT, 'shots', `${route.split('/').pop()}-${vp.width}.png`) });
            ok(`signed-in ${route} ${vp.width}`, at === route && boxes.length === 1, { at, boxes });
        }
        await ctx.close();
    }
}

async function run() {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    if (process.env.SIGNED_IN_ONLY) { await signedInShots(browser); await browser.close(); writeFileSync(join(OUT, 'signed-in.json'), JSON.stringify(report, null, 1)); return; }
    const phone = { width: 390, height: 844 };

    { // dialog
        const ctx = await context(browser, phone); const page = await ctx.newPage();
        await page.goto(`${BASE}/hub/trivia`); await settle(page);
        const card = page.locator('.mode-image-card').filter({ hasText: 'MTT Scenarios' }).first();
        await card.scrollIntoViewIfNeeded(); await card.focus(); await page.keyboard.press('Enter');
        await page.waitForSelector('[role="dialog"]', { timeout: 5000 }).catch(() => {});
        const shown = () => page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].filter((d) => { const r = d.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(d).visibility !== 'hidden'; }).length);
        const opened = await shown();
        const inside = [];
        for (let i = 0; i < 12; i += 1) { await page.keyboard.press('Tab'); inside.push(await page.evaluate(() => Boolean(document.activeElement && document.activeElement.closest('[role="dialog"]')))); }
        await shot(page, 'dialog-open-390');
        await page.keyboard.press('Escape'); await page.waitForTimeout(400);
        const closed = (await shown()) === 0;
        const restored = await page.evaluate(() => Boolean(document.activeElement && document.activeElement.classList.contains('mode-image-card')));
        ok('dialog', opened === 1 && inside.every(Boolean) && closed && restored, { opened, trapped: inside.every(Boolean), closed, restored });
        await ctx.close();
    }
    for (const [name, vp] of [['art-error', phone], ['art-error-desktop', { width: 1440, height: 900 }]]) { // art failure
        const ctx = await context(browser, vp); await ctx.route(/\/images\/trivia\/intro-v1\//, (r) => r.abort());
        const page = await ctx.newPage(); await page.goto(`${BASE}/hub/trivia/endless`); await settle(page);
        const boxes = await artBoxes(page); await shot(page, `${name}-endless`);
        ok(name, boxes.length === 1 && boxes[0].state === 'error' && boxes[0].h > 100 && boxes[0].preview && boxes[0].imgVisible === 'hidden', { boxes });
        await ctx.close();
    }
    { // slow load
        const ctx = await context(browser, phone);
        await ctx.route(/\/images\/trivia\/intro-v1\//, async (r) => { await new Promise((res) => setTimeout(res, 6000)); await r.continue(); });
        const page = await ctx.newPage(); await page.goto(`${BASE}/hub/trivia/mixed`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1800);
        const early = await artBoxes(page); await shot(page, 'art-slow-mixed-early');
        await page.waitForTimeout(6500); const late = await artBoxes(page);
        ok('art-slow', early.length === 1 && early[0].preview && early[0].h > 100 && !early[0].decoded && late[0].decoded, { early, late });
        await ctx.close();
    }
    { // fast scroll with slow pictures
        const ctx = await context(browser, phone);
        await ctx.route(/\/images\/trivia\//, async (r) => { await new Promise((res) => setTimeout(res, 2500)); await r.continue(); });
        const page = await ctx.newPage(); await page.goto(`${BASE}/hub/trivia`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500);
        const empties = [];
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        for (let y = 0, step = 0; y < height; y += 700, step += 1) {
            await page.evaluate((top) => window.scrollTo(0, top), y); await page.waitForTimeout(120);
            const blank = await page.evaluate(() => [...document.querySelectorAll('[data-art], .mode-image-card')].filter((el) => {
                const r = el.getBoundingClientRect(); if (!(r.bottom > 0 && r.top < innerHeight)) return false;
                if (el.dataset.art) return !getComputedStyle(el).backgroundImage.startsWith('url("data:');
                const img = el.querySelector('img'); const well = img && img.parentElement;
                return !(img && img.complete && img.naturalWidth > 0) && !(well && getComputedStyle(well).backgroundImage.startsWith('url('));
            }).map((el) => el.dataset.art || el.getAttribute('aria-label')?.split('.')[0]));
            if (blank.length) empties.push({ step, blank });
            if (step === 2) await shot(page, 'fast-scroll-lobby-mid');
        }
        ok('fast-scroll', empties.length === 0, { empties: empties.slice(0, 6) });
        await ctx.close();
    }
    for (const route of ['/hub/trivia', '/hub/trivia/survival-game']) { // forced colours
        const ctx = await context(browser, phone, { forced: true }); const page = await ctx.newPage();
        await page.goto(BASE + route); await settle(page);
        const bare = await page.evaluate(() => [...document.querySelectorAll('main button, main a[href]')].filter((el) => {
            const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false;
            const cs = getComputedStyle(el); const text = (el.textContent || '').trim();
            return !text && cs.borderStyle === 'none' && cs.outlineStyle === 'none' && !el.querySelector('img');
        }).map((el) => el.getAttribute('aria-label') || el.className).slice(0, 5));
        await shot(page, `forced-colors-${route.split('/').pop()}`);
        ok(`forced-colors ${route}`, bare.length === 0, { bare });
        await ctx.close();
    }
    for (const vp of [phone, { width: 320, height: 640 }]) { // long copy, large numbers
        const ctx = await context(browser, vp, { rest: LONG }); const page = await ctx.newPage();
        await page.goto(`${BASE}/hub/trivia/leaderboard`); await settle(page);
        const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: innerWidth, rows: document.querySelectorAll('main li, main tr').length,
            clipped: [...document.querySelectorAll('main *')].filter((el) => el.children.length === 0 && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible' && getComputedStyle(el).textOverflow !== 'ellipsis').length }));
        await shot(page, `long-copy-leaderboard-${vp.width}`);
        ok(`long-copy ${vp.width}`, m.sw <= m.vw + 1, m);
        await ctx.close();
    }
    await signedInShots(browser);
    await browser.close();
    writeFileSync(join(OUT, 'states.json'), JSON.stringify(report, null, 1));
    console.log('STATES DONE', Object.values(report).filter((r) => !r.pass).length, 'failing');
}
run().catch((e) => { console.error(e); process.exit(1); });
