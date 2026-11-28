#!/usr/bin/env node
/**
 * CHECK 30: Poker Near Me #SmarterDesign CSS cannot regress (2026-11-28).
 *
 * The #SmarterDesign upgrade of Poker Near Me (World Hub #3209, #3230, #3237,
 * #3267) removed every ALL-CAPS label, every gold, amber, orange, purple,
 * violet, pink and magenta ink, and the retired painted-controls-v1 /
 * painted-panels-v1 chassis. Nothing stopped them coming back one declaration
 * at a time. This scans the Poker Near Me stylesheets and the in-page style
 * blocks of the Poker Near Me pages and refuses:
 *
 *   1. `text-transform: uppercase` (Title Case labels; abbreviations such as
 *      NLH, PLO and BB are written in capitals in the copy itself);
 *   2. a colour literal (hex, rgb/rgba, hsl/hsla) whose hue sits in the
 *      banned bands - about 20-70 degrees (orange, amber, gold, yellow) and
 *      260-345 degrees (violet, purple, magenta, pink) - with real saturation;
 *   3. a reference to the retired painted chassis: painted-panels-v1 and the
 *      painted-controls-v1 utility well. The painted-controls-v1 icon-*.png
 *      pictograms are the pnc-icon set and stay exempt. Those references
 *      still exist on main, so this one is a RATCHET: each file's count is
 *      recorded in scripts/ci/pnm-smarterdesign-css-baseline.json and may
 *      only go down. Lower the baseline in the same commit that removes one.
 *
 * A literal is exempt only when the rule it sits in matches one of the short,
 * reasoned EXEMPT_SELECTORS below (map markers and Leaflet chrome, pnc-icon
 * pictograms, logo halos, avatar wells, rating chips, venue photos), or when
 * the declaration line carries `pnm-sd-allow:` with a reason.
 *
 * The same thresholds are applied to rendered pages by
 * e2e/pnm-smarterdesign-render.spec.ts; this is the cheap source-level half.
 *
 *   node scripts/ci/check-pnm-smarterdesign-css.mjs           # check
 *   node scripts/ci/check-pnm-smarterdesign-css.mjs --json    # machine output
 *   node scripts/ci/check-pnm-smarterdesign-css.mjs --self-test
 *   node scripts/ci/check-pnm-smarterdesign-css.mjs --write-baseline  # after removing chassis refs
 *
 * No dependencies beyond Node.
 */
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ── Thresholds (shared with the render spec) ─────────────────────────────
export const BANNED_HUE_BANDS = Object.freeze([
  { from: 20, to: 70, name: 'orange, amber, gold or yellow' },
  { from: 260, to: 345, name: 'violet, purple, magenta or pink' },
]);
// HSL saturation and chroma floors. Chroma (max - min channel) keeps a
// near-black navy shadow whose HSL saturation happens to be high from
// reading as a colour, and a near-grey from reading as a hue.
export const SATURATION_FLOOR = 0.25;
export const CHROMA_FLOOR = 0.1;
export const ALPHA_FLOOR = 0.05;

// Each exemption names what it covers and why. Matched against the full
// selector of the rule the literal sits in.
export const EXEMPT_SELECTORS = Object.freeze([
  { pattern: /leaflet|maplibre|mapboxgl/i, reason: 'map library chrome and tiles are third-party cartography, not UI ink' },
  { pattern: /marker|cluster/i, reason: 'map markers and clusters use a categorical marker palette that must stay distinguishable on the tiles' },
  { pattern: /pnc-icon/i, reason: 'pnc-icon pictograms are painted artwork, not text ink' },
  { pattern: /logo[-_]?halo|halo/i, reason: 'logo halos sit behind third-party venue and tour logos' },
  { pattern: /avatar/i, reason: 'avatar wells frame user photographs' },
  { pattern: /rating|stars?\b|star-/i, reason: 'rating chips use the conventional star colour beside a numeric score' },
  { pattern: /photo|cover-image|venue-image|hero-image/i, reason: 'venue photographs and their scrims are original records' },
]);

const INLINE_ALLOW = /pnm-sd-allow:\s*\S/;

// painted-controls-v1/icon-*.png is the pictogram set every pnc-icon draws;
// the chassis (panels, frames, the utility well) is what is retired.
const RETIRED_CHASSIS = /painted-panels-v1|painted-controls-v1\/(?!icon-[a-z0-9-]+\.png)/g;
export const BASELINE_PATH = 'scripts/ci/pnm-smarterdesign-css-baseline.json';

// ── File discovery ───────────────────────────────────────────────────────
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

export const PNM_PAGES = Object.freeze([
  'pages/hub/poker-near-me/[pnmTab].js',
  'pages/hub/poker-near-me/index.js',
  'pages/hub/poker-near-me/lobby.js',
  'pages/hub/poker-near-me/in/index.js',
  'pages/hub/poker-near-me/in/[state].js',
  'pages/hub/venues/[id].js',
  'pages/hub/tours/[code].js',
  'pages/hub/series/[id].js',
  'pages/hub/poker-series.js',
  'pages/hub/home-games.js',
  'pages/hub/events-calendar.js',
]);

export function pnmFiles(root = ROOT) {
  const css = [];
  const worlds = join(root, 'src/styles/worlds');
  if (existsSync(worlds)) {
    for (const name of readdirSync(worlds)) {
      if (/^poker-near-me-.*\.css$/.test(name)) css.push(join(worlds, name));
    }
  }
  const legacy = join(root, 'styles/poker-near-me.css');
  if (existsSync(legacy)) css.push(legacy);
  for (const p of walk(join(root, 'src/components/poker-near-me'))) {
    if (p.endsWith('.css')) css.push(p);
  }
  const pages = [];
  for (const rel of PNM_PAGES) {
    const p = join(root, rel);
    if (existsSync(p)) pages.push(p);
  }
  // Every page under the poker-near-me route family, including any added later.
  for (const p of walk(join(root, 'pages/hub/poker-near-me'))) {
    if (/\.(js|jsx|tsx?)$/.test(p) && !pages.includes(p)) pages.push(p);
  }
  return { css: css.sort(), pages: pages.sort() };
}

// ── Colour maths ─────────────────────────────────────────────────────────
export function rgbToHsl(r, g, b) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === R) h = 60 * (((G - B) / d) % 6);
    else if (max === G) h = 60 * ((B - R) / d + 2);
    else h = 60 * ((R - G) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s, l, chroma: d };
}

export function bannedBand(rgba) {
  if (!rgba) return null;
  const [r, g, b, a = 1] = rgba;
  if (a < ALPHA_FLOOR) return null;
  const { h, s, chroma } = rgbToHsl(r, g, b);
  if (s < SATURATION_FLOOR || chroma < CHROMA_FLOOR) return null;
  return BANNED_HUE_BANDS.find((band) => h >= band.from && h <= band.to) || null;
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let [r, g, b] = [0, 0, 0];
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function num(token, scale = 1) {
  const t = token.trim();
  if (t.endsWith('%')) return (parseFloat(t) / 100) * scale;
  return parseFloat(t);
}

const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(\s*[^()]*\)/g;

export function parseColor(literal) {
  if (literal.startsWith('#')) {
    let hex = literal.slice(1);
    if (![3, 4, 6, 8].includes(hex.length)) return null;
    if (hex.length <= 4) hex = [...hex].map((c) => c + c).join('');
    const v = (i) => parseInt(hex.slice(i, i + 2), 16);
    return [v(0), v(2), v(4), hex.length === 8 ? v(6) / 255 : 1];
  }
  const fn = literal.slice(0, literal.indexOf('(')).toLowerCase();
  const inner = literal.slice(literal.indexOf('(') + 1, -1);
  if (/var\(|calc\(|from\s/i.test(inner)) return null;
  const parts = inner.split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const alpha = parts[3] !== undefined ? num(parts[3], 1) : 1;
  if (fn.startsWith('rgb')) {
    const ch = parts.slice(0, 3).map((p) => num(p, 255));
    if (ch.some((c) => Number.isNaN(c))) return null;
    return [...ch, alpha];
  }
  const h = parseFloat(parts[0]);
  const s = num(parts[1].endsWith('%') ? parts[1] : parts[1] + '%', 1);
  const l = num(parts[2].endsWith('%') ? parts[2] : parts[2] + '%', 1);
  if ([h, s, l].some((c) => Number.isNaN(c))) return null;
  return [...hslToRgb(h, s, l), alpha];
}

// ── CSS walk ─────────────────────────────────────────────────────────────
/** Replace comments with spaces, keeping newlines so line numbers hold. */
function blankComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * Yields { selector, line, text } for every declaration, where selector is the
 * full chain of enclosing rule preludes (so `.x { .marker { ... } }` and
 * `@media { .marker ... }` both resolve).
 */
function* declarations(css, lineOffset = 0) {
  const src = blankComments(css);
  const stack = [];
  let buf = '';
  let line = 1 + lineOffset;
  let bufLine = line;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') {
      stack.push(buf.trim());
      buf = '';
      bufLine = line;
    } else if (ch === '}') {
      if (buf.trim()) yield { selector: stack.join(' '), line: bufLine, text: buf.trim() };
      stack.pop();
      buf = '';
      bufLine = line;
    } else if (ch === ';') {
      if (buf.trim()) yield { selector: stack.join(' '), line: bufLine, text: buf.trim() };
      buf = '';
      bufLine = line;
    } else {
      if (!buf.trim() && ch !== '\n' && !/\s/.test(ch)) bufLine = line;
      buf += ch;
    }
    if (ch === '\n') line++;
  }
}

/** Pull styled-jsx / <style> template literals out of a page. */
export function styleBlocks(source) {
  const blocks = [];
  const re = /<style\b[^>]*>\s*\{\s*`([\s\S]*?)`\s*\}\s*<\/style>/g;
  let m;
  while ((m = re.exec(source))) {
    const before = source.slice(0, m.index + m[0].indexOf('`') + 1);
    const lineOffset = before.split('\n').length - 1;
    // ${...} interpolations are JS, not CSS: blank them.
    const css = m[1].replace(/\$\{[^}]*\}/g, (x) => x.replace(/[^\n]/g, ' '));
    blocks.push({ css, lineOffset });
  }
  return blocks;
}

function blankJsComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, lead) => lead + ' '.repeat(m.length - lead.length));
}

function insideStyleBlock(src, lineIndex) {
  const before = src.split('\n').slice(0, lineIndex).join('\n');
  const open = before.lastIndexOf('<style');
  return open >= 0 && before.indexOf('</style>', open) < 0;
}

function exemption(selector) {
  return EXEMPT_SELECTORS.find((e) => e.pattern.test(selector)) || null;
}

export function scanCss(css, file, lineOffset = 0, rawLines = null) {
  const findings = [];
  const lines = rawLines || css.split('\n');
  for (const decl of declarations(css, lineOffset)) {
    const raw = lines[decl.line - 1] || '';
    const allowed = INLINE_ALLOW.test(raw);
    const colon = decl.text.indexOf(':');
    if (colon < 0) continue;
    const prop = decl.text.slice(0, colon).trim().toLowerCase();
    const value = decl.text.slice(colon + 1);
    if ((decl.text.match(RETIRED_CHASSIS) || []).length) {
      findings.push({ file, line: decl.line, rule: 'retired-chassis', selector: decl.selector, detail: decl.text.slice(0, 160) });
    }
    if (prop === 'text-transform' && /\buppercase\b/i.test(value) && !allowed) {
      findings.push({ file, line: decl.line, rule: 'uppercase', selector: decl.selector, detail: decl.text });
    }
    if (prop.startsWith('--') && /^--sd-|^--pnm-sd-/.test(prop)) {
      // Token definitions are checked like any other literal below.
    }
    const ex = exemption(decl.selector);
    if (ex || allowed) continue;
    for (const literal of value.match(COLOR_LITERAL) || []) {
      const band = bannedBand(parseColor(literal));
      if (band) {
        findings.push({ file, line: decl.line, rule: 'banned-hue', selector: decl.selector, detail: `${prop}: ${literal} reads as ${band.name}` });
      }
    }
  }
  return findings;
}

export function scanRepo(root = ROOT) {
  const { css, pages } = pnmFiles(root);
  const findings = [];
  for (const p of css) {
    const src = readFileSync(p, 'utf8');
    findings.push(...scanCss(src, relative(root, p)));
  }
  for (const p of pages) {
    const src = readFileSync(p, 'utf8');
    const rawLines = src.split('\n');
    // Page source outside style blocks: a className, an import or a URL
    // string. Comments that merely mention the old chassis are not uses.
    const code = blankJsComments(src).split('\n');
    code.forEach((l, i) => {
      if (/<style\b/.test(l)) return;
      if ((l.match(RETIRED_CHASSIS) || []).length && !insideStyleBlock(src, i)) {
        findings.push({ file: relative(root, p), line: i + 1, rule: 'retired-chassis', selector: '(page source)', detail: l.trim().slice(0, 160) });
      }
    });
    for (const block of styleBlocks(src)) {
      findings.push(...scanCss(block.css, relative(root, p), block.lineOffset, rawLines));
    }
  }
  // CSS files may also @import a retired chassis.
  return { findings, scanned: { css: css.length, pages: pages.length } };
}

function selfTest() {
  const assert = (cond, msg) => { if (!cond) { console.error('self-test failed: ' + msg); process.exit(1); } };
  assert(bannedBand(parseColor('#f5b301')), 'gold is banned');
  assert(bannedBand(parseColor('#ff8c00')), 'orange is banned');
  assert(bannedBand(parseColor('rgb(168, 85, 247)')), 'violet is banned');
  assert(bannedBand(parseColor('hsl(320 80% 60%)')), 'magenta hsl is banned');
  assert(bannedBand(parseColor('#ec4899')), 'pink is banned');
  assert(!bannedBand(parseColor('#74dfff')), 'ice is allowed');
  assert(!bannedBand(parseColor('#9fbacc')), 'silver is allowed');
  assert(!bannedBand(parseColor('#4dc660')), 'house green is allowed');
  assert(!bannedBand(parseColor('#ef4444')), 'error red (hue 0) is allowed');
  assert(!bannedBand(parseColor('#2563eb')), 'cobalt is allowed');
  assert(!bannedBand(parseColor('rgba(245, 179, 1, 0)')), 'a transparent stop is not ink');
  assert(!bannedBand(parseColor('#1b1a17')), 'a near-black neutral is not a hue');
  const sample = [
    '.a { text-transform: uppercase; }',
    '.b { color: #f5b301; }',
    '.leaflet-marker-icon { color: #f5b301; }',
    '.c { color: #f5b301; /* pnm-sd-allow: test reason */ }',
    '.d { background: url(/images/painted-controls-v1/utility-well.webp); }',
    '@media (max-width: 1px) { .e .f { border-color: rgba(168,85,247,.6); } }',
  ].join('\n');
  const f = scanCss(sample, 'sample.css');
  const rules = f.map((x) => x.rule + '@' + x.line);
  assert(rules.includes('uppercase@1'), 'uppercase found: ' + rules);
  assert(rules.includes('banned-hue@2'), 'gold found: ' + rules);
  assert(!rules.includes('banned-hue@3'), 'marker exempt: ' + rules);
  assert(!rules.includes('banned-hue@4'), 'inline allow honoured: ' + rules);
  assert(rules.includes('retired-chassis@5'), 'retired chassis found: ' + rules);
  assert(rules.includes('banned-hue@6'), 'nested media rule found: ' + rules);
  const icon = scanCss('.pnc-icon--x { background-image: url(/images/pnm-console/painted-controls-v1/icon-menu.png); }', 'i.css');
  assert(icon.length === 0, 'pictogram icons are not the chassis: ' + JSON.stringify(icon));
  const page = 'x\n<style jsx>{`\n  .g { color: #a855f7; }\n`}</style>\n';
  const blocks = styleBlocks(page);
  assert(blocks.length === 1, 'style block extracted');
  const pf = scanCss(blocks[0].css, 'page.js', blocks[0].lineOffset, page.split('\n'));
  assert(pf.length === 1 && pf[0].line === 3, 'page block line is the source line: ' + JSON.stringify(pf));
  console.log('check-pnm-smarterdesign-css self-test: ok');
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--self-test')) {
    selfTest();
  } else {
    const { findings: all, scanned } = scanRepo();
    const baseline = existsSync(join(ROOT, BASELINE_PATH)) ? JSON.parse(readFileSync(join(ROOT, BASELINE_PATH), 'utf8')) : { 'retired-chassis': {} };
    const chassisByFile = {};
    for (const f of all) if (f.rule === 'retired-chassis') chassisByFile[f.file] = (chassisByFile[f.file] || 0) + 1;
    const allowed = process.argv.includes('--write-baseline') ? chassisByFile : (baseline['retired-chassis'] || {});
    const findings = all.filter((f) => f.rule !== 'retired-chassis' || (chassisByFile[f.file] || 0) > (allowed[f.file] || 0));
    const shrunk = Object.entries(allowed).filter(([file, n]) => (chassisByFile[file] || 0) < n);
    if (process.argv.includes('--write-baseline')) {
      const next = { ...baseline, 'retired-chassis': Object.fromEntries(Object.entries(chassisByFile).sort()) };
      writeFileSync(join(ROOT, BASELINE_PATH), JSON.stringify(next, null, 2) + '\n');
      console.log('baseline written: ' + BASELINE_PATH);
    }
    for (const [file, n] of shrunk) {
      console.log(`note: ${file} now has ${chassisByFile[file] || 0} retired chassis reference(s), baseline ${n}. Lower the baseline (--write-baseline) in this commit.`);
    }
    if (process.argv.includes('--json')) {
      console.log(JSON.stringify({ scanned, findings }, null, 2));
    } else if (findings.length === 0) {
      console.log(`Poker Near Me #SmarterDesign CSS: clean (${scanned.css} stylesheets, ${scanned.pages} pages scanned).`);
    } else {
      for (const f of findings) {
        console.log(`::error file=${f.file},line=${f.line}::${f.rule} in "${f.selector.slice(0, 120)}": ${f.detail}`);
      }
      console.log(`\n${findings.length} Poker Near Me #SmarterDesign violation(s) in ${scanned.css} stylesheets and ${scanned.pages} pages.`);
      console.log('Fix the source. A genuine exception (map marker, photo, logo halo, rating chip) goes in EXEMPT_SELECTORS with its reason, or carries "pnm-sd-allow: <reason>" on the declaration line.');
    }
    if (findings.length) process.exitCode = 1;
  }
}
