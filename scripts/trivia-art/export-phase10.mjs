/**
 * Export the independently composed Phase 10 Trivia art masters.
 *
 * Each family has a 16:10 mobile source and a distinct 12:5 desktop source.
 * The exporter produces content-hashed AVIF/WebP variants at 640, 960 and
 * 1440 pixels, plus a tiny mobile preview and a provenance manifest.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const VERSION = 'intro-v3';
const FAMILIES = ['stats', 'leaderboard', 'achievements', 'settings'];
const WIDTHS = [640, 960, 1440];
const CROPS = Object.freeze({
  mobile: Object.freeze({ ratio: [16, 10], width: 1440, height: 900 }),
  wide: Object.freeze({ ratio: [12, 5], width: 1440, height: 600 }),
});

const sourceDir = path.join(HERE, 'sources', VERSION);
const outputDir = path.join(ROOT, 'public', 'images', 'trivia', VERSION);
const evidencePath = path.join(ROOT, 'docs', 'trivia', 'evidence', 'p10-progress-intro-art-manifest.json');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

async function encode(source, crop, width, format) {
  const height = Math.round(width * crop.height / crop.width);
  const pipeline = sharp(source)
    .resize(crop.width, crop.height, { fit: 'cover', position: 'centre' })
    .resize(width, height, { kernel: sharp.kernel.lanczos3 })
    .removeAlpha();

  const bytes = format === 'avif'
    ? await pipeline.avif({ quality: 52, effort: 6, chromaSubsampling: '4:2:0' }).toBuffer()
    : await pipeline.webp({ quality: 76, effort: 6, smartSubsample: true }).toBuffer();

  return { bytes, width, height, format };
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  await mkdir(path.dirname(evidencePath), { recursive: true });

  const manifest = {
    version: VERSION,
    generatedBy: 'scripts/trivia-art/export-phase10.mjs',
    generationProvider: 'OpenAI image generation tool',
    rules: 'Independent mobile and desktop compositions; text-free; no logos or real people; essential copy remains live HTML.',
    encoders: { avif: { quality: 52, effort: 6 }, webp: { quality: 76, effort: 6 } },
    families: {},
  };

  for (const family of FAMILIES) {
    const prompt = await readFile(path.join(sourceDir, `${family}-prompt.txt`));
    const record = {
      promptFile: `scripts/trivia-art/sources/${VERSION}/${family}-prompt.txt`,
      promptSha256: sha256(prompt),
      sources: {},
      crops: {},
    };

    for (const [composition, crop] of Object.entries(CROPS)) {
      const sourcePath = path.join(sourceDir, `${family}-${composition}-source.png`);
      const source = await readFile(sourcePath);
      const metadata = await sharp(source).metadata();
      record.sources[composition] = {
        file: `scripts/trivia-art/sources/${VERSION}/${family}-${composition}-source.png`,
        width: metadata.width,
        height: metadata.height,
        sha256: sha256(source),
      };

      const files = [];
      for (const width of WIDTHS) {
        for (const format of ['avif', 'webp']) {
          const encoded = await encode(source, crop, width, format);
          const digest = sha256(encoded.bytes);
          const filename = `${family}-${composition}-${width}.${digest.slice(0, 10)}.${format}`;
          await writeFile(path.join(outputDir, filename), encoded.bytes);
          files.push({
            file: filename,
            format,
            width: encoded.width,
            height: encoded.height,
            bytes: encoded.bytes.length,
            sha256: digest,
          });
        }
      }
      record.crops[composition] = { ratio: crop.ratio, files };
    }

    const mobileSource = await readFile(path.join(sourceDir, `${family}-mobile-source.png`));
    const preview = await sharp(mobileSource)
      .resize(CROPS.mobile.width, CROPS.mobile.height, { fit: 'cover', position: 'centre' })
      .resize(32, 20, { kernel: sharp.kernel.lanczos3 })
      .webp({ quality: 40, effort: 6 })
      .toBuffer();
    record.preview = `data:image/webp;base64,${preview.toString('base64')}`;
    record.previewBytes = preview.length;
    manifest.families[family] = record;
  }

  await writeFile(evidencePath, `${JSON.stringify(manifest, null, 2)}\n`);
  const fileCount = FAMILIES.length * Object.keys(CROPS).length * WIDTHS.length * 2;
  process.stdout.write(`Exported ${FAMILIES.length} families and ${fileCount} responsive files to ${outputDir}\n`);
}

await main();
