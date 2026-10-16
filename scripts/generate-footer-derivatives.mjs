#!/usr/bin/env node
/**
 * WORLD FOOTER DERIVATIVES (2026-10-16).
 *
 * Every World footer shipped one full-resolution PNG to every phone: 0.76 to
 * 1.53 MB per page (Personal Assistant 1,056,474 B, News 802,173 B), and the
 * footer art is regularly the page's Largest Contentful Paint candidate. Only
 * Trivia carried responsive WebP derivatives (its 640w file is 67 KB).
 *
 * This writes the same kind of derivative for every footer that lacks them:
 * WebP at 640 / 960 / 1280 and the source width, each height derived from the
 * source aspect (the footer browser gate allows one density-corrected pixel),
 * with a content hash in the filename so a changed picture is always a new
 * URL. It then records `sources` (srcSet + sizes) next to the approved PNG in
 * src/config/world-footer-navigation.json. The PNG stays the <img> src and the
 * approved original; the source sha256 is unchanged.
 *
 * `sizes` follows BottomNavBar's stage arithmetic: the stage is
 * min(100vw, FOOTER_ARTWORK_HEIGHT x aspect) with FOOTER_ARTWORK_HEIGHT =
 * clamp(44px, 12.326vw, 132px) (pinned from 1071px), full-bleed frames are
 * 100vw, and the <img> is wider than the stage by sourceWidth / cropWidth.
 *
 * Usage: node scripts/generate-footer-derivatives.mjs
 * Re-run it when an approved footer PNG changes. WebP encoder output differs
 * between libvips builds, so the files are verified by content hash, size and
 * dimensions (__tests__/the-footer-ships-responsive-derivatives.law.test.mjs),
 * not by re-encoding.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = join(ROOT, 'src/config/world-footer-navigation.json');
const WIDTHS = [640, 960, 1280];
const VW_COEFFICIENT = 0.12326; // FOOTER_ARTWORK_HEIGHT's vw term
const HEIGHT_CAP = 132; // FOOTER_ARTWORK_HEIGHT's upper bound, reached at 1071px
const PIN_WIDTH = 1071;

export function footerSizes(artwork) {
  const crop = artwork.cropToContentBounds && artwork.contentBounds ? artwork.contentBounds : { width: artwork.width, height: artwork.height };
  const overscan = artwork.width / crop.width;
  const pct = (value) => `${Math.round(value * 1000) / 10}vw`;
  if (artwork.fullBleed) return pct(overscan);
  const aspect = crop.width / crop.height;
  const stageFraction = Math.min(1, VW_COEFFICIENT * aspect);
  const pinnedStage = Math.min(PIN_WIDTH, HEIGHT_CAP * aspect);
  return `(max-width: ${PIN_WIDTH}px) ${pct(stageFraction * overscan)}, ${Math.round(pinnedStage * overscan)}px`;
}

export function derivativeHeight(artwork, width) {
  return Math.round((width * artwork.height) / artwork.width);
}

async function main() {
  const sharp = require('sharp');
  let text = readFileSync(CONFIG, 'utf8');
  const config = JSON.parse(text);
  const problems = [];
  let changed = false;

  for (const world of config.worlds) {
    const artwork = world.artwork;
    if (!artwork?.src?.endsWith('.png')) continue;
    if (Array.isArray(artwork.sources) && artwork.sources.length && !artwork.generatedSources) continue; // hand-authored (Trivia)
    const sourcePath = join(ROOT, 'public', artwork.src);
    const sourceBytes = readFileSync(sourcePath);
    const sourceSha = createHash('sha256').update(sourceBytes).digest('hex');
    if (sourceSha !== artwork.sha256) problems.push(`${world.id}: ${artwork.src} no longer matches its approved sha256`);

    const candidates = [];
    for (const width of [...WIDTHS.filter((w) => w < artwork.width), artwork.width]) {
      const height = derivativeHeight(artwork, width);
      const bytes = await sharp(sourceBytes)
        .resize(width, height, { fit: 'fill', kernel: 'lanczos3' })
        .webp({ quality: 88, alphaQuality: 100, effort: 6, smartSubsample: true })
        .toBuffer();
      const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 10);
      const rel = artwork.src.replace(/\.png$/, `-${width}.${hash}.webp`);
      const out = join(ROOT, 'public', rel);
      if (!existsSync(out) || !readFileSync(out).equals(bytes)) writeFileSync(out, bytes);
      candidates.push(`${rel} ${width}w`);
    }
    const source = { type: 'image/webp', srcSet: candidates.join(', '), sizes: footerSizes(artwork) };
    const current = JSON.stringify(artwork.sources || null);
    if (current !== JSON.stringify([source]) || artwork.generatedSources !== true) {
      {
        // Edit the one artwork line in place so the file keeps its
        // one-object-per-line layout (the same shape Trivia's entry uses).
        const srcField = `"src": "${artwork.src}"`;
        const lines = text.split('\n');
        const index = lines.findIndex((line) => line.includes('"artwork"') && line.includes(srcField));
        if (index < 0) { problems.push(`${world.id}: artwork line not found`); continue; }
        let line = lines[index]
          .replace(/, "sources": \[[^\]]*\]/, '')
          .replace(/, "generatedSources": true/, '');
        line = line.replace(srcField, `${srcField}, "sources": [${JSON.stringify(source).replace(/^\{/, '{ ').replace(/\}$/, ' }').replace(/","/g, '", "').replace(/":"/g, '": "')}], "generatedSources": true`);
        lines[index] = line;
        text = lines.join('\n');
        changed = true;
      }
    }
  }

  if (changed) {
    JSON.parse(text); // never write a config that does not parse
    writeFileSync(CONFIG, text);
  }
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(`footer derivatives written${changed ? ' and config updated' : ''}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
