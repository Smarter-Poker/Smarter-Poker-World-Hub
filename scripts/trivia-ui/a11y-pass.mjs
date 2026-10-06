/**
 * TRIVIA UI ACCESSIBILITY AND LAYOUT PASS (Phase 4 exit gate, p4-art).
 *
 * Drives the system Chrome through every reachable Trivia URL at the plan's
 * widths and records, per page: axe violations (serious/critical, split into
 * Trivia content vs shared site chrome), horizontal overflow, h1 count,
 * broken images, controls under 44px, controls hidden behind the fixed
 * header/footer, intro art box and state, keyboard focus visibility and
 * reduced-motion animations. Extra scenarios: 200%/400% zoom reflow, forced
 * colours, dialog focus trap/restore/Escape, intro art failure and slow load,
 * and a fast scroll of the lobby.
 *
 *   BASE=http://127.0.0.1:3100 [BASE_FLAGS=http://127.0.0.1:3101] OUT=dir \
 *     node scripts/trivia-ui/a11y-pass.mjs [--only=/hub/trivia/endless]
 *
 * It never signs in and never writes: Supabase calls are answered locally
 * with empty results, so every page renders its signed-out state.
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const BASE = process.env.BASE || 'http://127.0.0.1:3100';
const BASE_FLAGS = process.env.BASE_FLAGS || BASE;
const OUT = process.env.OUT || 'trivia-a11y-out';
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const SHOTS = new Set((process.env.SHOT_WIDTHS || '390,1440').split(',').map(Number));
mkdirSync(join(OUT, 'shots'), { recursive: true });

export const ROUTES = [
    '/hub/trivia', '/hub/trivia/daily', '/hub/trivia/arcade', '/hub/trivia/history', '/hub/trivia/rules',
    '/hub/trivia/pro', '/hub/trivia/mtt', '/hub/trivia/cash', '/hub/trivia/icm', '/hub/trivia/gto',
    '/hub/trivia/endless', '/hub/trivia/mixed', '/hub/trivia/survival-game', '/hub/trivia/survival',
    '/hub/trivia/time-attack', '/hub/trivia/pvp', '/hub/trivia/tournaments', '/hub/trivia/stats',
    '/hub/trivia/leaderboard', '/hub/trivia/achievements', '/hub/trivia/settings',
];
const GATED = new Set(['/hub/trivia/pvp', '/hub/trivia/tournaments']);
const VIEWPORTS = [
    { name: '320', width: 320, height: 640 }, { name: '375', width: 375, height: 812 },
    { name: '390', width: 390, height: 844 }, { name: '430', width: 430, height: 932 },
    { name: '768', width: 768, height: 1024 }, { name: '1024', width: 1024, height: 768 },
    { name: '1280', width: 1280, height: 800 }, { name: '1440', width: 1440, height: 900 },
    { name: '1920', width: 1920, height: 1080 },
    { name: 'landscape', width: 844, height: 390 },
    { name: 'zoom200', width: 640, height: 450 }, { name: 'reflow400', width: 320, height: 256 },
];

async function stub(context) {
    // Every Supabase call is answered here: no network write, no account.
    await context.route(/supabase\.co|auth\.smarter\.poker|realtime/, (route) => {
        const url = route.request().url();
        if (/\/auth\/v1\//.test(url)) return route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"signed out"}' });
        if (/\/rest\/v1\/rpc\//.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await context.route(/googletagmanager|google-analytics|onesignal|doubleclick/, (route) => route.abort());
}

async function settle(page) {
    await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
    await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
    await page.waitForTimeout(1200);
}

const MEASURE = () => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const chrome = (el) => Boolean(el.closest('header, nav, footer, [class*="Footer"], [class*="footer"], [class*="UniversalHeader"], [class*="hamburger"]'));
    const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('alt') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
    const controls = [...document.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [role="switch"], [role="tab"], [tabindex]:not([tabindex="-1"])')].filter(visible);
    const small = controls.filter((el) => { const r = el.getBoundingClientRect(); return (r.width < 44 || r.height < 44) && !el.closest('p, li > span'); });
    const overflowers = [...document.querySelectorAll('main *')].filter((el) => { const r = el.getBoundingClientRect(); return r.right > vw + 1 && visible(el); }).slice(0, 5).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`);
    const broken = [...document.images].filter((img) => img.complete && img.naturalWidth === 0 && img.currentSrc && visible(img)).map((img) => img.currentSrc.slice(-60));
    const arts = [...document.querySelectorAll('[data-art]')].map((el) => { const r = el.getBoundingClientRect(); const img = el.querySelector('img'); return { key: el.dataset.art, state: el.dataset.artState, ratio: +(r.width / Math.max(1, r.height)).toFixed(2), w: Math.round(r.width), src: img && img.currentSrc ? img.currentSrc.split('/').pop() : null, loading: img && img.loading, fp: img && img.getAttribute('fetchpriority'), preview: getComputedStyle(el).backgroundImage.startsWith('url("data:image/webp') }; });
    // A fitted label must fit its painted face: text wider than its box is cut by the rim.
    const clipped = [...document.querySelectorAll('[data-master-art] span, [data-master-art] button')].filter((el) => el.children.length === 0 && visible(el) && el.textContent.trim() && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible').map((el) => el.textContent.trim().slice(0, 30)).slice(0, 5);
    const cutByWell = [...document.querySelectorAll('[class*="plateText"], [class*="captionText"]')].filter((el) => visible(el) && el.getBoundingClientRect().width > el.parentElement.getBoundingClientRect().width + 1).map((el) => el.textContent.trim().slice(0, 30));
    return {
        url: location.pathname, scrollWidth: document.documentElement.scrollWidth, vw, vh, clipped: [...clipped, ...cutByWell],
        overflow: document.documentElement.scrollWidth > vw + 1, overflowers,
        h1: [...document.querySelectorAll('h1')].length,
        broken, arts,
        small: { trivia: small.filter((el) => !chrome(el)).length, chrome: small.filter(chrome).length, samples: small.filter((el) => !chrome(el)).slice(0, 6).map((el) => `${label(el)} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`) },
        controls: controls.length,
    };
};

const OCCLUSION = async () => {
    // Is any Trivia control covered by the fixed header, footer or anything else?
    const out = [];
    const els = [...document.querySelectorAll('main button, main a[href], main [role="button"], main input, main select')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; }).slice(0, 60);
    for (const el of els) {
        el.scrollIntoView({ block: 'center', inline: 'center' });
        await new Promise((r) => requestAnimationFrame(() => r()));
        const r = el.getBoundingClientRect();
        const pts = [[r.left + r.width / 2, r.top + r.height / 2]];
        for (const [x, y] of pts) {
            if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
            const hit = document.elementFromPoint(x, y);
            if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) out.push(`${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)} <- ${hit.tagName.toLowerCase()}.${String(hit.className).split(' ')[0]}`);
        }
    }
    window.scrollTo(0, 0);
    return out;
};

async function axe(page) {
    await page.addScriptTag({ content: AXE });
    return page.evaluate(async () => {
        const res = await window.axe.run(document, { resultTypes: ['violations'] });
        const chrome = (sel) => { try { const el = document.querySelector(sel); return Boolean(el && el.closest('header, nav, footer, [class*="Footer"], [class*="footer"], [class*="UniversalHeader"]')); } catch { return false; } };
        return res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => ({
            id: v.id, impact: v.impact,
            trivia: v.nodes.filter((n) => !chrome(n.target[0])).map((n) => String(n.target[0]).slice(0, 80)),
            chrome: v.nodes.filter((n) => chrome(n.target[0])).length,
        }));
    });
}

async function keyboard(page) {
    // Tab through the page: every stop must be visible and visibly focused.
    const stops = [];
    for (let i = 0; i < 70; i += 1) {
        await page.keyboard.press('Tab');
        const s = await page.evaluate(() => {
            const el = document.activeElement; if (!el || el === document.body) return null;
            const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
            const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2) || (cs.boxShadow && cs.boxShadow !== 'none');
            return { tag: el.tagName.toLowerCase(), name: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30), inView: r.bottom > 0 && r.top < innerHeight && r.width > 0, ring, chrome: Boolean(el.closest('header, nav, footer, [class*="Footer"], [class*="footer"]')) };
        });
        if (!s) continue;
        stops.push(s);
    }
    const trivia = stops.filter((s) => !s.chrome);
    return { stops: stops.length, triviaStops: trivia.length, noRing: trivia.filter((s) => !s.ring).map((s) => s.name).slice(0, 5), offscreen: trivia.filter((s) => !s.inView).map((s) => s.name).slice(0, 5) };
}

async function motion(page) {
    // Real motion only: under reduced motion the world sheet turns transitions
    // into 0.01ms no-ops, which are still momentarily 'running'.
    return page.evaluate(() => document.getAnimations().filter((a) => { const t = a.effect && a.effect.getTiming(); return a.playState === 'running' && t && (t.iterations === Infinity || Number(t.duration) > 50); }).map((a) => {
        const t = a.effect && a.effect.target; return `${t ? t.tagName.toLowerCase() + '.' + String(t.className).split(' ')[0] : '?'}:${a.animationName || a.constructor.name}`;
    }).slice(0, 8));
}

async function run() {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const results = [];
    const log = join(OUT, 'results.jsonl'); writeFileSync(log, '');
    const only = (process.env.VPS || '').split(',').filter(Boolean);
    for (const vp of VIEWPORTS.filter((v) => !only.length || only.includes(v.name))) {
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
        await stub(context);
        const page = await context.newPage();
        const errors = []; page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 120)));
        for (const route of ROUTES) {
            if (ONLY && route !== ONLY) continue;
            errors.length = 0;
            const base = GATED.has(route) ? BASE_FLAGS : BASE;
            const t0 = Date.now();
            const resp = await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => ({ status: () => `ERR ${e.message.slice(0, 60)}` }));
            await settle(page);
            const row = { route, vp: vp.name, status: resp && resp.status(), finalPath: new URL(page.url()).pathname, ms: Date.now() - t0 };
            Object.assign(row, await page.evaluate(MEASURE));
            row.animations = await motion(page);
            row.occluded = await page.evaluate(OCCLUSION);
            row.axe = await axe(page);
            if (['390', '1440'].includes(vp.name)) row.keyboard = await keyboard(page);
            row.pageErrors = [...errors];
            if (SHOTS.has(vp.width) && !['zoom200', 'reflow400', 'landscape'].includes(vp.name)) {
                await page.evaluate(() => window.scrollTo(0, 0));
                await page.screenshot({ path: join(OUT, 'shots', `${route.split('/').pop() || 'trivia'}-${vp.name}.png`), fullPage: false });
            }
            results.push(row); appendFileSync(log, JSON.stringify(row) + '\n');
            console.log(`${vp.name.padEnd(9)} ${route.padEnd(28)} ${row.status} clip=${row.clipped.length ? row.clipped.join('|') : 0} ovf=${row.overflow ? 'Y' : 'n'} h1=${row.h1} small=${row.small.trivia} occl=${row.occluded.length} axe=${row.axe.map((v) => v.id + ':' + v.trivia.length).join(',') || 0} art=${row.arts.map((a) => a.key + '/' + a.state).join(',') || '-'}`);
        }
        await context.close();
    }
    await browser.close();
    return results;
}

run().then((rows) => {
    const bad = rows.filter((r) => r.overflow || r.broken.length || r.axe.some((v) => v.trivia.length) || r.occluded.length || (r.keyboard && (r.keyboard.noRing.length || r.keyboard.offscreen.length)));
    writeFileSync(join(OUT, 'summary.json'), JSON.stringify({ pages: rows.length, flagged: bad.length, base: BASE }, null, 1));
    console.log(`DONE pages=${rows.length} flagged=${bad.length}`);
    // This file is a release gate, not a report generator. Before Phase 11 it
    // printed a non-zero flagged count and still exited 0, so CI could certify
    // a known accessibility/layout failure. Preserve every artifact for
    // diagnosis, then make the process result agree with its own summary.
    if (bad.length > 0) process.exitCode = 1;
}).catch((e) => { console.error(e); process.exit(1); });
