#!/usr/bin/env node
/**
 * Poker Brain - Template Extraction Helper
 * -----------------------------------------
 * Given a full-frame PokerBros screenshot plus a JSON descriptor file listing
 * which card appears at which (x, y, w, h) rectangle in that screenshot, crop
 * each rectangle to a PNG and write it to public/hub/poker-brain/templates/
 * with the canonical file name (e.g. Ah.png, Td.png).
 *
 * Supports partial updates: if you only have 5 cards visible in a frame, you
 * list 5 entries and those 5 templates are written/updated. Existing files
 * are overwritten if present (intentional — use this to refine a template).
 *
 * Usage:
 *   node scripts/poker-brain-extract-templates.js --image path/to/frame.png \
 *        --map path/to/map.json
 *
 * Map file format:
 *   {
 *     "referenceSize": { "w": 1920, "h": 1080 }, // optional, rectangles are in these units
 *     "cards": [
 *       { "card": "Ah", "x": 714, "y": 928, "w": 60, "h": 88 },
 *       { "card": "Kd", "x": 782, "y": 928, "w": 60, "h": 88 }
 *     ]
 *   }
 *
 * Canonical card codes:
 *   rank:  A K Q J T 9 8 7 6 5 4 3 2
 *   suit:  s h d c
 *   special: back (card back), empty (empty slot)
 */

const fs = require('fs');
const path = require('path');

// sharp is already a dependency of Next.js image optimization, but to keep
// this script zero-dep-for-new-agents, we fall back to pngjs if sharp is
// unavailable. Try sharp first (faster, higher-quality crop).
let sharp = null;
try { sharp = require('sharp'); } catch (_) { /* fall through */ }

let PNG = null;
if (!sharp) {
  try { PNG = require('pngjs').PNG; } catch (_) {
    console.error('ERROR: neither "sharp" nor "pngjs" is available. Run `npm i sharp` or `npm i pngjs`.');
    process.exit(1);
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--image') out.image = argv[++i];
    else if (a === '--map') out.map = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function printUsage() {
  console.log(`Poker Brain template extractor
  --image <path>   full-frame PokerBros screenshot (PNG)
  --map <path>     JSON map of card code -> rectangle
  --out <dir>      output directory (default: public/hub/poker-brain/templates)
  --help           show this help`);
}

const VALID_RANKS = new Set(['A','K','Q','J','T','9','8','7','6','5','4','3','2']);
const VALID_SUITS = new Set(['s','h','d','c']);
const SPECIAL = new Set(['back','empty']);

function validateCardCode(code) {
  if (!code || typeof code !== 'string') return false;
  if (SPECIAL.has(code)) return true;
  if (code.length !== 2) return false;
  return VALID_RANKS.has(code[0]) && VALID_SUITS.has(code[1]);
}

async function cropWithSharp(imagePath, rect, outPath) {
  const image = sharp(imagePath);
  const meta = await image.metadata();
  const left = Math.max(0, Math.round(rect.x));
  const top = Math.max(0, Math.round(rect.y));
  const width = Math.min(meta.width - left, Math.round(rect.w));
  const height = Math.min(meta.height - top, Math.round(rect.h));
  if (width <= 0 || height <= 0) {
    throw new Error(`rectangle out of bounds for ${path.basename(outPath)}`);
  }
  await image.extract({ left, top, width, height }).png().toFile(outPath);
}

function cropWithPngjs(imagePath, rect, outPath) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(imagePath)
      .pipe(new PNG())
      .on('parsed', function () {
        const left = Math.max(0, Math.round(rect.x));
        const top = Math.max(0, Math.round(rect.y));
        const width = Math.min(this.width - left, Math.round(rect.w));
        const height = Math.min(this.height - top, Math.round(rect.h));
        if (width <= 0 || height <= 0) {
          return reject(new Error(`rectangle out of bounds for ${path.basename(outPath)}`));
        }
        const out = new PNG({ width, height });
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const srcIdx = ((top + y) * this.width + (left + x)) * 4;
            const dstIdx = (y * width + x) * 4;
            out.data[dstIdx]     = this.data[srcIdx];
            out.data[dstIdx + 1] = this.data[srcIdx + 1];
            out.data[dstIdx + 2] = this.data[srcIdx + 2];
            out.data[dstIdx + 3] = this.data[srcIdx + 3];
          }
        }
        out.pack().pipe(fs.createWriteStream(outPath))
          .on('finish', resolve)
          .on('error', reject);
      })
      .on('error', reject);
  });
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.image || !args.map) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  const outDir = args.out
    || path.resolve(__dirname, '..', 'public', 'hub', 'poker-brain', 'templates');

  if (!fs.existsSync(args.image)) {
    console.error(`ERROR: image not found: ${args.image}`);
    process.exit(1);
  }
  if (!fs.existsSync(args.map)) {
    console.error(`ERROR: map not found: ${args.map}`);
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });

  const map = JSON.parse(fs.readFileSync(args.map, 'utf8'));
  if (!Array.isArray(map.cards)) {
    console.error('ERROR: map.cards must be an array');
    process.exit(1);
  }

  console.log(`Using ${sharp ? 'sharp' : 'pngjs'} for PNG decoding.`);
  console.log(`Extracting ${map.cards.length} template(s) from ${path.basename(args.image)}`);
  console.log(`Output dir: ${outDir}`);

  let ok = 0;
  let failed = 0;
  for (const entry of map.cards) {
    const { card, x, y, w, h } = entry;
    if (!validateCardCode(card)) {
      console.warn(`  [skip] invalid card code "${card}"`);
      failed += 1;
      continue;
    }
    const rect = { x, y, w, h };
    const outPath = path.join(outDir, `${card}.png`);
    try {
      if (sharp) await cropWithSharp(args.image, rect, outPath);
      else await cropWithPngjs(args.image, rect, outPath);
      console.log(`  [ok]   ${card}.png  (${w}x${h} at ${x},${y})`);
      ok += 1;
    } catch (err) {
      console.warn(`  [fail] ${card}.png — ${err.message}`);
      failed += 1;
    }
  }

  console.log(`\nDone. ${ok} written, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
