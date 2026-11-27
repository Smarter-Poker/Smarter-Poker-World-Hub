/**
 * A SHORTCUT LINK DOES NOT PRELOAD ITS PAGE (2026-11-27, BINDING)
 *
 * In production, a Next.js <Link> that scrolls into the viewport downloads the
 * linked page's whole JavaScript bundle by default. The mobile budget
 * (e2e/mobile-budget.spec.ts, budgets in scripts/ci/mobile-budget.json)
 * counts every script a page loads, so a shortcut to a heavy page is charged
 * to the page that links to it.
 *
 * Measured on main 7a0605ba with the Global Footer E2E build environment:
 *   - /hub/poker-tools shipped 1051KB against a 900KB budget. The two calculator
 *     shortcuts added in #3080 prefetched /hub/training/equity-calculator and
 *     /hub/training/icm-calculator, about 280KB of calculator code
 *     (chunks 39507, 58474bfb, 1126, 55254, 92008).
 *   - /hub/personal-assistant shipped 865KB against an 850KB budget. Its section
 *     tabs and training-plan link prefetched the Leak Finder page (64KB page
 *     chunk plus its dependencies) and /hub/training.
 * Every World Hub PR's Global Footer E2E then failed.
 *
 * These links still navigate normally. Next.js still prefetches a
 * prefetch={false} link when the pointer hovers it, which is a signal of
 * intent. Raising the budget is not a fix: the budget file only goes down.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const code = (f) =>
  readFileSync(join(ROOT, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

// [file, href fragment that identifies the link]
const SHORTCUTS = [
  ['pages/hub/poker-tools.js', "'/hub/training/equity-calculator'"],
  ['pages/hub/poker-tools.js', "'/hub/training/icm-calculator'"],
  ['pages/hub/personal-assistant/index.js', "'/hub/personal-assistant/leaks?tab=leaks'"],
  ['pages/hub/personal-assistant/index.js', "'/hub/training'"],
  ['pages/hub/personal-assistant/index.js', "'/hub/personal-assistant/leaks?tab=plan'"],
];

function linkElements(src) {
  const out = [];
  const re = /<Link\b/g;
  let m;
  while ((m = re.exec(src))) {
    // The opening tag ends at the first '>' outside braces.
    let depth = 0;
    let i = m.index;
    for (; i < src.length; i += 1) {
      const c = src[i];
      if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      else if (c === '>' && depth === 0) break;
    }
    out.push(src.slice(m.index, i + 1));
  }
  return out;
}

const norm = (s) => s.replace(/"/g, "'");

for (const [file, href] of SHORTCUTS) {
  test(`${file}: the ${href} shortcut does not preload its page`, () => {
    const tags = linkElements(code(file)).filter((t) => {
      const hrefAttr = norm(t).match(/href=(\{[\s\S]*?\}|'[^']*')/);
      return hrefAttr && hrefAttr[1].includes(href.slice(1, -1)) &&
        (hrefAttr[1] === href || hrefAttr[1].startsWith('{'));
    });
    assert.ok(tags.length > 0, `${file}: no <Link> to ${href} - update this law if the shortcut moved`);
    for (const t of tags) {
      assert.match(t, /prefetch=\{false\}/, `${file}: <Link> to ${href} preloads its page bundle into the mobile budget`);
    }
  });
}
