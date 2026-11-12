// Acceptance tests 7, 8 and 9 for the Daily Content renderer, on SYNTHETIC fixtures only.
//   7  Long names: a 40-character name stays inside its podium card / row at the floor size or truncates.
//   8  Safe areas: no visible text past x 918 or y 1536 on any template, mid-animation, final and closing.
//   9  Horse marks: every horse entry carries the HORSE badge (and no human does); every results
//      frame carries the footer disclosure.
// Usage: node verify-templates.mjs [--json out.json]   (exit 1 on any failure)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openScene } from './render.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures');
const SAFE_X = 918, SAFE_Y = 1536;
const DISCLOSURE = 'Boards include Smarter.Poker horses, our AI players.';

// Runs in the page: visible text fragments, clipped by overflow ancestors.
const PAGE_TEXT = () => {
  const out = [];
  const opacityOf = el => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return 0; o *= Number(cs.opacity); } return o; };
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement; if (!el || el.closest('script,style,svg')) continue;
    const op = opacityOf(el); if (op < 0.02) continue;
    const r = document.createRange(); r.selectNodeContents(n);
    for (const rc of r.getClientRects()) {
      if (rc.width < 0.5 || rc.height < 0.5) continue;
      let x0 = rc.left, y0 = rc.top, x1 = rc.right, y1 = rc.bottom;
      for (let a = el; a && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.overflow !== 'visible' || cs.overflowX !== 'visible') { const b = a.getBoundingClientRect(); x0 = Math.max(x0, b.left); y0 = Math.max(y0, b.top); x1 = Math.min(x1, b.right); y1 = Math.min(y1, b.bottom); }
      }
      if (x1 - x0 < 0.5 || y1 - y0 < 0.5) continue;
      out.push({ text: n.textContent.trim().slice(0, 50), x0, y0, x1, y1, op, id: el.id || el.className });
    }
  }
  return out;
};

const fixtures = fs.readdirSync(FIX).filter(f => f.endsWith('.json')).sort();
const report = { test7: 'PASS', test8: 'PASS', test9: 'PASS', fixtures: {}, failures: [] };
const fail = (test, msg) => { report[test] = 'FAIL'; report.failures.push(`${test}: ${msg}`); };

for (const f of fixtures) {
  const name = f.replace(/\.json$/, '');
  const spec = JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
  const jobDir = path.join(HERE, '.verify', name);
  fs.mkdirSync(path.join(jobDir, 'avatars'), { recursive: true });
  fs.writeFileSync(path.join(jobDir, 'spec.json'), JSON.stringify(spec));
  const { page, meta, errors, close } = await openScene(jobDir);
  const fr = report.fixtures[name] = { template: meta.template, times: [], max_x: 0, max_y: 0 };
  try {
    const tFinal = meta.main_end - 1 / 30;
    const times = [meta.main_end * 0.45, meta.main_end * 0.75, tFinal];
    if (meta.closing_at != null) times.push(meta.closing_at + 0.6, meta.duration_s - 1 / 30);
    for (const t of times) {
      await page.evaluate(tt => window.setTime(tt), t);
      const frags = await page.evaluate(PAGE_TEXT);
      const bad = frags.filter(g => g.x1 > SAFE_X + 0.5 || g.y1 > SAFE_Y + 0.5);
      fr.times.push({ t: Number(t.toFixed(2)), fragments: frags.length, violations: bad.length });
      for (const g of frags) { fr.max_x = Math.max(fr.max_x, Math.round(g.x1)); fr.max_y = Math.max(fr.max_y, Math.round(g.y1)); }
      bad.slice(0, 5).forEach(g => fail('test8', `${name} t=${t.toFixed(2)} "${g.text}" ends at x=${g.x1.toFixed(0)} y=${g.y1.toFixed(0)}`));
      // test 9 footer on results frames (main timeline only)
      if (spec.results && t <= tFinal + 1e-6 && t >= 1.5) {
        const ft = await page.evaluate(() => { const d = document.querySelector('#footer .d1'); if (!d) return null; let o = 1; for (let e = d; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return { text: d.textContent, op: o }; });
        if (!ft || ft.text !== spec.footer.disclosure[0] || ft.op < 0.9) fail('test9', `${name} t=${t.toFixed(2)} footer disclosure missing or faint (${JSON.stringify(ft)})`);
        if (spec.footer.disclosure[0] !== DISCLOSURE && spec.template === 'board') fail('test9', `${name} board fixture uses a different disclosure`);
      }
    }
    // test 9 horse badges on the final main frame
    await page.evaluate(tt => window.setTime(tt), tFinal);
    const ent = await page.evaluate(() => [...document.querySelectorAll('[data-entry]')].map(el => {
      const b = el.querySelector('[data-badge="horse"]'); const er = el.getBoundingClientRect();
      let op = 1; if (b) for (let e = b; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
      const br = b && b.getBoundingClientRect();
      return { entry: el.dataset.entry, horse: el.dataset.horse === '1', badge: !!b, op, inside: !!br && br.left >= er.left - 1 && br.right <= er.right + 1 && br.top >= er.top - 1 && br.bottom <= er.bottom + 1, staff: !!el.querySelector('[data-badge="staff"]') };
    }));
    fr.entries = ent.length;
    for (const e of ent) {
      if (e.horse && (!e.badge || e.op < 0.9 || !e.inside)) fail('test9', `${name} ${e.entry} is a horse but its badge is missing/hidden/outside`);
      if (!e.horse && e.badge) fail('test9', `${name} ${e.entry} is not a horse but shows the badge`);
    }
    // expected horse count from the spec
    const specEntries = spec.template === 'board' ? [...(spec.board.podium || []), ...(spec.board.rows || [])] : spec.template === 'list' ? spec.list.items : [];
    const want = specEntries.filter(e => e.horse).length, got = ent.filter(e => e.horse && e.badge).length;
    if (want !== got) fail('test9', `${name} expected ${want} horse badges, found ${got}`);
    fr.horse_badges = got;
    // test 7 long names
    if (name === 'board-longnames') {
      const res = await page.evaluate(() => [...document.querySelectorAll('[data-entry]')].slice(0, 6).map(el => {
        const n = el.querySelector('.name, .nm'); const box = el.querySelector('.inner, .rin');
        const nr = n.getBoundingClientRect(), br = box.getBoundingClientRect();
        const r = document.createRange(); r.selectNodeContents(n);
        let tx1 = -1e9, ty1 = -1e9, tx0 = 1e9, ty0 = 1e9;
        for (const rc of r.getClientRects()) { tx0 = Math.min(tx0, Math.max(rc.left, nr.left)); ty0 = Math.min(ty0, Math.max(rc.top, nr.top)); tx1 = Math.max(tx1, Math.min(rc.right, nr.right)); ty1 = Math.max(ty1, Math.min(rc.bottom, nr.bottom)); }
        const cs = getComputedStyle(n);
        const overflowing = n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1;
        return { entry: el.dataset.entry, chars: n.textContent.length, fs: parseFloat(cs.fontSize), floor: Number(n.dataset.floor), truncated: n.dataset.truncated === '1', clipped: cs.overflow === 'hidden',
          overflowing, inside: nr.left >= br.left - 0.5 && nr.right <= br.right + 0.5 && nr.top >= br.top - 0.5 && nr.bottom <= br.bottom + 0.5,
          textInside: tx0 >= br.left - 0.5 && tx1 <= br.right + 0.5 && ty0 >= br.top - 0.5 && ty1 <= br.bottom + 0.5 };
      }));
      fr.long_names = res;
      for (const r of res) {
        if (r.chars !== 40) continue;
        // shown whole inside the card, or truncated (clipped with an ellipsis) at the floor size
        const ok = r.inside && r.textInside && r.fs >= r.floor - 0.01 && (r.truncated ? (r.clipped && Math.abs(r.fs - r.floor) < 0.01) : true);
        if (!ok) fail('test7', `${r.entry} 40-char name escapes its card: ${JSON.stringify(r)}`);
      }
      if (res.filter(r => r.chars === 40).length < 6) fail('test7', 'expected six 40-character names in the long-names fixture');
    }
    if (errors.length) fail('test8', `${name} page errors: ${errors.join(' | ')}`);
  } finally { await close(); }
}
const outIdx = process.argv.indexOf('--json');
if (outIdx > 0) fs.writeFileSync(process.argv[outIdx + 1], JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.failures.length ? 1 : 0);
