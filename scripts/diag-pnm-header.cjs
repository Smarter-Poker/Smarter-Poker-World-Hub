// Temporary diagnostic (diag branch only, never merged): records the geometry
// of the approved global header on /hub/poker-near-me/series after the same
// document scroll that e2e/024 performs, in WebKit and Chromium.
const { webkit, chromium, devices } = require('@playwright/test');
const { PNG } = require('pngjs');
const strip = (buf) => { const png = PNG.sync.read(buf); const rows = []; for (let y = 0; y < 40; y += 4) { let r = 0, g = 0, b = 0; for (let x = 40; x < png.width - 40; x++) { const i = (png.width * y + x) * 4; r += png.data[i]; g += png.data[i + 1]; b += png.data[i + 2]; } const n = png.width - 80; rows.push([Math.round(r / n), Math.round(g / n), Math.round(b / n)].join(',')); } return rows.join(' | '); };

const BASE = process.env.BASE_URL;
const RUNS = Number(process.env.RUNS || 10);

async function snapshot(page, label) {
  return page.evaluate((label) => {
    const header = document.querySelector('header.approved-global-header');
    const trigger = document.querySelector('[data-world-menu-trigger="approved-header"]');
    const shell = document.querySelector('.pnm-shell');
    const cs = header ? getComputedStyle(header) : null;
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const chain = [];
    for (let el = header?.parentElement; el; el = el.parentElement) {
      const s = getComputedStyle(el);
      chain.push({
        el: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''}`,
        pos: s.position, transform: s.transform, filter: s.filter, contain: s.contain,
        willChange: s.willChange, containerType: s.containerType, overflow: `${s.overflowX}/${s.overflowY}`,
        backdrop: s.backdropFilter || s.webkitBackdropFilter, perspective: s.perspective, zoom: s.zoom,
        top: s.top, height: s.height,
      });
    }
    const vv = window.visualViewport;
    return {
      label,
      scrollY: Math.round(window.scrollY),
      innerHeight: window.innerHeight,
      docH: document.documentElement.scrollHeight,
      bodyH: document.body.scrollHeight,
      shellH: shell ? shell.scrollHeight : null,
      shellTop: shell ? Math.round(shell.getBoundingClientRect().top + window.scrollY) : null,
      headerCount: document.querySelectorAll('header.approved-global-header').length,
      triggerCount: document.querySelectorAll('[data-world-menu-trigger]').length,
      headerParent: header?.parentElement?.tagName,
      headerStyle: cs && { position: cs.position, top: cs.top, bottom: cs.bottom, inset: cs.inset, display: cs.display, transform: cs.transform },
      headerRect: rect(header),
      headerOffsetTop: header ? header.offsetTop : null,
      triggerRect: rect(trigger),
      vv: vv && { offsetTop: Math.round(vv.offsetTop), pageTop: Math.round(vv.pageTop), height: Math.round(vv.height), width: Math.round(vv.width), scale: vv.scale },
      docW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      bodyClass: document.body.className,
      htmlStyle: document.documentElement.getAttribute('style'),
      bodyStyle: document.body.getAttribute('style'),
      chain,
    };
  }, label);
}

async function once(browserType, name, i) {
  const browser = await browserType.launch();
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    viewport: { width: 375, height: 812 },
    storageState: { cookies: [], origins: [] },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${BASE}/hub/poker-near-me/series`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-world-menu-trigger]:visible').first().waitFor({ timeout: 20000 });
    const a = await snapshot(page, 'loaded');
    await page.evaluate(() => {
      const shell = document.querySelector('.pnm-shell');
      const bottomWithinShell = shell
        ? shell.getBoundingClientRect().top + window.scrollY + shell.scrollHeight - window.innerHeight
        : document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, Math.max(1, bottomWithinShell - 1));
    });
    for (let t = 0; t < 50; t++) {
      if (await page.evaluate(() => window.scrollY) > 0) break;
      await page.waitForTimeout(100);
    }
    const b = await snapshot(page, 'scrolled');
    const pwBox = await page.locator('[data-world-menu-trigger="approved-header"]').boundingBox();
    const shot1 = strip(await page.screenshot());
    const probeHit = () => page.evaluate(() => { const t = document.querySelector('[data-world-menu-trigger="approved-header"]'); const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); const desc = (n) => { if (!n || n.nodeType !== 1) return null; const cs = getComputedStyle(n); const b = n.getBoundingClientRect(); return `${n.tagName.toLowerCase()}${n.id ? '#' + n.id : ''}.${String(n.className).trim().split(/\s+/).slice(0, 3).join('.')} pos=${cs.position} z=${cs.zIndex} rect=${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.width)}x${Math.round(b.height)}`; }; const chain = []; for (let n = el; n && n !== document.body && chain.length < 8; n = n.parentElement) chain.push(desc(n)); return { hitIsTrigger: el === t || t.contains(el), chain, scrollY: Math.round(scrollY), docH: document.documentElement.scrollHeight }; });
    const hit1 = await probeHit();
    const series = [];
    for (let t = 0; t < 12; t++) { const bb = await page.locator('[data-world-menu-trigger="approved-header"]').boundingBox(); const sy = await page.evaluate(() => [Math.round(scrollY), document.documentElement.scrollHeight]); series.push(`${t * 200}ms:y=${bb && Math.round(bb.y)} sY=${sy[0]} dH=${sy[1]}`); await page.waitForTimeout(200); }
    const shot2 = strip(await page.screenshot());
    console.log('HITLATE ' + name + ' #' + i + ' ' + JSON.stringify(await probeHit()));
    console.log('SHOT ' + name + ' #' + i + ' at-measure: ' + shot1);
    console.log('SHOT ' + name + ' #' + i + ' settled:    ' + shot2);
    console.log('HIT ' + name + ' #' + i + ' ' + JSON.stringify(hit1));
    console.log('SERIES ' + name + ' #' + i + ' ' + series.join(' ; '));
    await page.waitForTimeout(100);
    const c = await snapshot(page, 'scrolled+2.5s');
    const pwBox2 = await page.locator('[data-world-menu-trigger="approved-header"]').boundingBox();
    const fail = !pwBox || pwBox.y + pwBox.height > 813 || pwBox.y < 0;
    console.log(`DIAG ${name} #${i} ${fail ? 'FAIL' : 'ok'} ` + JSON.stringify({ pwBox, pwBox2, a, b, c }));
  } catch (error) {
    console.log(`DIAG ${name} #${i} ERROR ${error.message}`);
  } finally {
    await browser.close();
  }
}

(async () => {
  for (let i = 0; i < RUNS; i++) {
    await once(webkit, 'webkit', i);
    if (i % 2 === 0) await once(chromium, 'chromium', i);
  }
})();
