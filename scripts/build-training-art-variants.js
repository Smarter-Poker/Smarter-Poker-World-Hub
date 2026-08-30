'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..', 'public/images/training/casino-realism');
const WIDTHS = [640, 960, 1440];
const originals = fs.readdirSync(ROOT)
  .filter((name) => /^[a-z0-9-]+\.webp$/.test(name))
  .sort();

async function buildOne(file, width) {
  const source = path.join(ROOT, file);
  const base = path.basename(file, '.webp');
  const outputDir = path.join(ROOT, String(width));
  fs.mkdirSync(outputDir, { recursive: true });

  const pipeline = sharp(source)
    .resize({ width, withoutEnlargement: true, fit: 'inside' });
  await Promise.all([
    width < 1440
      ? pipeline.clone().webp({ quality: 78, effort: 5 }).toFile(path.join(outputDir, `${base}.webp`))
      : Promise.resolve(),
    pipeline.clone().avif({ quality: 58, effort: 5 }).toFile(path.join(outputDir, `${base}.avif`)),
  ]);
}

async function main() {
  const queue = [];
  for (const file of originals) {
    for (const width of WIDTHS) queue.push([file, width]);
  }
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const next = queue.shift();
      if (next) await buildOne(...next);
    }
  });
  await Promise.all(workers);
  console.log(JSON.stringify({
    originals: originals.length,
    widths: WIDTHS,
    generated: originals.length * 5,
  }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
