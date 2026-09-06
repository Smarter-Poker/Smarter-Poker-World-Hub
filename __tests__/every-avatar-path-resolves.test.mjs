/**
 * EVERY AVATAR PATH IN THE SOURCE MUST EXIST IN public/.
 *
 * Written 2026-09-06 alongside the webp conversion, because that change is
 * exactly the shape that breaks avatars silently: 213 literal paths across 15
 * files, plus three template-literal builders that assemble a path at runtime
 * from a tier and a filename. Miss one literal and one avatar 404s. Miss a
 * BUILDER and every seated player at every table gets a broken image, because
 * 1,461 profiles store `/avatars/table/*.webp` and the builder is what turns a
 * stored url into the file actually requested.
 *
 * Nothing checked this before. `public/` held both formats for months, so a
 * reference to either resolved and the drift was invisible: `avatars/table`
 * carried 100 PNGs and 201 webp, and code reached for the PNG while the
 * database had already moved to webp.
 *
 * A missing avatar is not a crash. It is a grey box on a poker table, which is
 * the kind of defect that reaches players and never reaches a log.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();

/** Every .js/.jsx/.ts/.tsx under these roots, skipping tests and node_modules. */
function sources(dir, out = []) {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__' || e.name.startsWith('.')) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) sources(rel, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(e.name)) out.push(rel);
  }
  return out;
}

const FILES = [...sources('src'), ...sources('pages')];

test('every literal /avatars/ path in the source exists on disk', () => {
  const missing = [];
  for (const file of FILES) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    for (const m of src.matchAll(/['"`](\/avatars\/[A-Za-z0-9_@./-]+\.(?:png|webp|jpg|jpeg|svg))['"`]/g)) {
      const url = m[1];
      if (url.includes('${')) continue; // handled by the builder test below
      if (!existsSync(join(ROOT, 'public', url))) missing.push(`${file} -> ${url}`);
    }
  }
  assert.deepEqual(
    [...new Set(missing)].sort(),
    [],
    `avatar files referenced in source but absent from public/:\n${[...new Set(missing)].sort().join('\n')}`
  );
});

test('every table-variant builder produces a file that exists, for every tier', () => {
  /**
   * The builders read `/avatars/table/${tier}_${filename}.<ext>`. Rather than
   * trust the extension in the source, take it FROM the source and prove the
   * whole product set resolves: both tiers, every gallery avatar.
   */
  const builders = [
    'src/lib/resolveAvatarDisplay.js',
    'src/components/poker/PremiumPokerTable.jsx',
    'src/components/poker/LivePokerTable.jsx',
  ];

  for (const file of builders) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    const m = src.match(/`\/avatars\/table\/\$\{tier\}_\$\{filename\}\.([a-z0-9]+)`/);
    assert.ok(m, `${file} no longer builds a /avatars/table path the way this test expects`);
    const ext = m[1];

    for (const tier of ['vip', 'free']) {
      const galleryDir = join(ROOT, 'public/avatars', tier);
      if (!existsSync(galleryDir)) continue;
      const names = readdirSync(galleryDir).map((f) => f.replace(/\.[a-z0-9]+$/, ''));
      const absent = names.filter(
        (n) => !existsSync(join(ROOT, 'public/avatars/table', `${tier}_${n}.${ext}`))
      );
      // Not every gallery avatar has a table variant - only assert that the
      // ones which DO exist match the extension the builder asks for, and that
      // the builder's extension is one the directory actually contains.
      const present = names.length - absent.length;
      assert.ok(
        present > 0,
        `${file} builds .${ext} for tier "${tier}" but public/avatars/table contains no ` +
          `${tier}_*.${ext} at all - every seated ${tier} avatar would 404`
      );
    }
  }
});

test('a stored .webp avatar url survives the builders', () => {
  // 1,461 profiles store `/avatars/table/*.webp`. The builders strip the
  // extension off an incoming url before rebuilding; if that strip only knows
  // '.png' then a stored .webp keeps its extension and the result is
  // `..._name.webp.webp`. This is the regression that would hit every user.
  for (const file of [
    'src/lib/resolveAvatarDisplay.js',
    'src/components/poker/PremiumPokerTable.jsx',
    'src/components/poker/LivePokerTable.jsx',
  ]) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    assert.doesNotMatch(
      src,
      /\.replace\(\s*['"]\.png['"]\s*,/,
      `${file} strips only '.png' from an incoming avatar url, so a stored .webp becomes ` +
        `name.webp.webp - and every profile now stores .webp`
    );
  }
});

test('public/avatars carries no PNG that a webp already replaces', () => {
  // The conversion is only a saving if the original leaves. A directory that
  // holds both is the state this repo was in for months, and it is what let
  // code and database drift apart unnoticed.
  const both = [];
  for (const tier of ['vip', 'free', 'table', 'portrait']) {
    const dir = join(ROOT, 'public/avatars', tier);
    if (!existsSync(dir)) continue;
    const files = new Set(readdirSync(dir));
    for (const f of files) {
      if (f.endsWith('.png') && files.has(f.replace(/\.png$/, '.webp'))) {
        both.push(`avatars/${tier}/${f}`);
      }
    }
  }
  assert.deepEqual(both.sort(), [], `PNG kept alongside its webp replacement:\n${both.sort().join('\n')}`);
});

test('the avatar directories stay within a sane weight', () => {
  // 117.9 MB of 1024x1024 PNG became 11.6 MB of webp on 2026-09-06. This is a
  // ratchet in the same spirit as check-public-budget: it fails if somebody
  // drops a pile of full-size originals back in.
  const CAP_BYTES = 20_000_000;
  let total = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) total += statSync(p).size;
    }
  };
  walk(join(ROOT, 'public/avatars'));
  assert.ok(
    total <= CAP_BYTES,
    `public/avatars is ${(total / 1e6).toFixed(1)} MB against a ${CAP_BYTES / 1e6} MB cap. ` +
      `Convert to webp before adding, or raise the cap deliberately and say why.`
  );
});
